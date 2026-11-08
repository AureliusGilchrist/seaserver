package onlinestream_download

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Limits applied to every request a download makes to a streaming host. They are deliberately
// conservative: a download is not interactive, so being slow costs nothing, while being fast gets
// the server's IP throttled or banned by the provider — which also breaks online streaming.
const (
	// hostConcurrency is how many requests may be in flight to one provider host at once.
	hostConcurrency = 3
	// hostMinInterval is the smallest gap between the start of two requests to one host.
	hostMinInterval = 250 * time.Millisecond
	// hostMaxInterval caps how far a host's interval is stretched after it answers 429.
	hostMaxInterval = 5 * time.Second
	// maxAttempts is how many times one request is tried before the download fails.
	maxAttempts = 6
	// baseBackoff is the first retry delay; it doubles on each further attempt.
	baseBackoff = time.Second
	// maxBackoff caps a single retry delay.
	maxBackoff = 60 * time.Second
)

// hostLimiter paces the requests sent to one (provider, host) pair.
type hostLimiter struct {
	sem      chan struct{}
	mu       sync.Mutex
	next     time.Time     // earliest start time of the next request
	interval time.Duration // current spacing; grows on 429 and relaxes on success
}

func newHostLimiter() *hostLimiter {
	return &hostLimiter{
		sem:      make(chan struct{}, hostConcurrency),
		interval: hostMinInterval,
	}
}

// acquire waits for a concurrency slot and for this host's pacing interval.
func (l *hostLimiter) acquire(ctx context.Context) error {
	select {
	case l.sem <- struct{}{}:
	case <-ctx.Done():
		return ctx.Err()
	}

	l.mu.Lock()
	now := time.Now()
	start := l.next
	if start.Before(now) {
		start = now
	}
	l.next = start.Add(l.interval)
	l.mu.Unlock()

	if wait := time.Until(start); wait > 0 {
		t := time.NewTimer(wait)
		defer t.Stop()
		select {
		case <-t.C:
		case <-ctx.Done():
			<-l.sem
			return ctx.Err()
		}
	}
	return nil
}

func (l *hostLimiter) release() { <-l.sem }

// slowDown is called when the host answers 429: the spacing doubles and nothing starts until
// the host's own Retry-After (if given) has passed.
func (l *hostLimiter) slowDown(retryAfter time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.interval *= 2
	if l.interval > hostMaxInterval {
		l.interval = hostMaxInterval
	}
	if retryAfter > 0 {
		if until := time.Now().Add(retryAfter); until.After(l.next) {
			l.next = until
		}
	}
}

// relax slowly returns the spacing to its minimum after successful requests.
func (l *hostLimiter) relax() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.interval > hostMinInterval {
		l.interval -= l.interval / 10
		if l.interval < hostMinInterval {
			l.interval = hostMinInterval
		}
	}
}

// RateLimitedClient is an HTTP client whose every request goes through a per-provider,
// per-host limiter with retry and backoff on 429, 5xx and network errors.
type RateLimitedClient struct {
	client   *http.Client
	mu       sync.Mutex
	limiters map[string]*hostLimiter
}

func NewRateLimitedClient() *RateLimitedClient {
	return &RateLimitedClient{
		client: &http.Client{
			Timeout: 2 * time.Minute,
		},
		limiters: make(map[string]*hostLimiter),
	}
}

func (c *RateLimitedClient) limiterFor(provider, host string) *hostLimiter {
	key := provider + "|" + strings.ToLower(host)
	c.mu.Lock()
	defer c.mu.Unlock()
	l, ok := c.limiters[key]
	if !ok {
		l = newHostLimiter()
		c.limiters[key] = l
	}
	return l
}

// HTTPStatusError is returned for a response that was not retried or ran out of retries.
type HTTPStatusError struct {
	URL    string
	Status int
}

func (e *HTTPStatusError) Error() string {
	return fmt.Sprintf("%s answered HTTP %d", hostOf(e.URL), e.Status)
}

// PermanentError wraps a failure that retrying cannot fix, such as a local disk error.
type PermanentError struct{ Err error }

func (e *PermanentError) Error() string { return e.Err.Error() }
func (e *PermanentError) Unwrap() error { return e.Err }

func hostOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	return u.Host
}

func retryable(status int) bool {
	return status == http.StatusTooManyRequests || status == http.StatusRequestTimeout || status >= 500
}

func parseRetryAfter(v string) time.Duration {
	if v == "" {
		return 0
	}
	if secs, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && secs >= 0 {
		return time.Duration(secs) * time.Second
	}
	if t, err := http.ParseTime(v); err == nil {
		return time.Until(t)
	}
	return 0
}

func backoffFor(attempt int) time.Duration {
	d := baseBackoff << attempt
	if d > maxBackoff || d <= 0 {
		d = maxBackoff
	}
	// Up to 25% jitter so retries from parallel slots do not line up.
	return d + time.Duration(rand.Int63n(int64(d/4)+1))
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Do performs a GET for rawURL with the given headers and hands the successful response body to
// consume. A failure inside consume (e.g. the connection dropping mid-body) is retried as well.
func (c *RateLimitedClient) Do(ctx context.Context, provider string, rawURL string, headers map[string]string, consume func(resp *http.Response) error) error {
	return c.DoDynamic(ctx, provider, rawURL, func() map[string]string { return headers }, consume)
}

// DoDynamic is Do with the request headers rebuilt for every attempt, which lets a caller resume a
// partial body with a Range header after a dropped connection.
func (c *RateLimitedClient) DoDynamic(ctx context.Context, provider string, rawURL string, headersFn func() map[string]string, consume func(resp *http.Response) error) error {
	host := hostOf(rawURL)
	l := c.limiterFor(provider, host)

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			if err := sleepCtx(ctx, backoffFor(attempt-1)); err != nil {
				return err
			}
		}

		if err := l.acquire(ctx); err != nil {
			return err
		}

		retry, err := c.doOnce(ctx, l, rawURL, headersFn(), consume)
		l.release()
		if err == nil {
			l.relax()
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		lastErr = err
		if !retry {
			return err
		}
	}
	return fmt.Errorf("gave up after %d attempts: %w", maxAttempts, lastErr)
}

func (c *RateLimitedClient) doOnce(ctx context.Context, l *hostLimiter, rawURL string, headers map[string]string, consume func(resp *http.Response) error) (retry bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return false, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return true, err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == http.StatusTooManyRequests {
			l.slowDown(parseRetryAfter(resp.Header.Get("Retry-After")))
		}
		return retryable(resp.StatusCode), &HTTPStatusError{URL: rawURL, Status: resp.StatusCode}
	}

	if err := consume(resp); err != nil {
		var statusErr *HTTPStatusError
		var permErr *PermanentError
		if errors.As(err, &statusErr) || errors.As(err, &permErr) {
			return false, err
		}
		// Body read failures are transient network problems.
		return true, err
	}
	return false, nil
}

// GetBytes fetches a small resource (a playlist, a key, a subtitle) into memory.
func (c *RateLimitedClient) GetBytes(ctx context.Context, provider, rawURL string, headers map[string]string, limit int64) ([]byte, error) {
	var out []byte
	err := c.Do(ctx, provider, rawURL, headers, func(resp *http.Response) error {
		b, err := io.ReadAll(io.LimitReader(resp.Body, limit))
		if err != nil {
			return err
		}
		out = b
		return nil
	})
	return out, err
}
