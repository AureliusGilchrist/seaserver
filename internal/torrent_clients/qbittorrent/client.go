package qbittorrent

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"seanime/internal/torrent_clients/qbittorrent/application"
	"seanime/internal/torrent_clients/qbittorrent/log"
	"seanime/internal/torrent_clients/qbittorrent/rss"
	"seanime/internal/torrent_clients/qbittorrent/search"
	"seanime/internal/torrent_clients/qbittorrent/sync"
	"seanime/internal/torrent_clients/qbittorrent/torrent"
	"seanime/internal/torrent_clients/qbittorrent/transfer"
	"strings"
	std_sync "sync"
	"time"

	"github.com/rs/zerolog"
	"golang.org/x/net/publicsuffix"
)

type Client struct {
	baseURL          string
	logger           *zerolog.Logger
	client           *http.Client
	Username         string
	Password         string
	Port             int
	Host             string
	Path             string
	DisableBinaryUse bool
	Tags             string
	Category         string
	Application      qbittorrent_application.Client
	Log              qbittorrent_log.Client
	RSS              qbittorrent_rss.Client
	Search           qbittorrent_search.Client
	Sync             qbittorrent_sync.Client
	Torrent          qbittorrent_torrent.Client
	Transfer         qbittorrent_transfer.Client
}

type NewClientOptions struct {
	Logger           *zerolog.Logger
	Username         string
	Password         string
	Port             int
	Host             string
	Path             string
	DisableBinaryUse bool
	Tags             string
	Category         string
}

func NewClient(opts *NewClientOptions) *Client {

	host := opts.Host
	scheme := "http"
	if strings.HasPrefix(host, "https://") {
		scheme = "https"
		host = strings.TrimPrefix(host, "https://")
	} else if strings.HasPrefix(host, "http://") {
		host = strings.TrimPrefix(host, "http://")
	}
	opts.Host = host

	var baseURL string
	if opts.Port > 0 {
		baseURL = fmt.Sprintf("%s://%s:%d/api/v2", scheme, host, opts.Port)
	} else {
		baseURL = fmt.Sprintf("%s://%s/api/v2", scheme, host)
	}

	transport := newTransport()

	client := &http.Client{
		// qBittorrent's WebUI is on the same machine or the same LAN, so nothing here should take
		// anywhere near this long. Without a timeout at all — which is what an empty http.Client
		// gives you — a connection the other end has stopped answering on parks the caller forever,
		// and the pollers that ask for the torrent list every second pile up behind it.
		Timeout: 60 * time.Second,
	}
	c := &Client{
		baseURL:          baseURL,
		logger:           opts.Logger,
		client:           client,
		Username:         opts.Username,
		Password:         opts.Password,
		Port:             opts.Port,
		Path:             opts.Path,
		DisableBinaryUse: opts.DisableBinaryUse,
		Host:             opts.Host,
		Tags:             opts.Tags,
		Category:         opts.Category,
		Application: qbittorrent_application.Client{
			BaseUrl: baseURL + "/app",
			Client:  client,
			Logger:  opts.Logger,
		},
		Log: qbittorrent_log.Client{
			BaseUrl: baseURL + "/log",
			Client:  client,
			Logger:  opts.Logger,
		},
		RSS: qbittorrent_rss.Client{
			BaseUrl: baseURL + "/rss",
			Client:  client,
			Logger:  opts.Logger,
		},
		Search: qbittorrent_search.Client{
			BaseUrl: baseURL + "/search",
			Client:  client,
			Logger:  opts.Logger,
		},
		Sync: qbittorrent_sync.Client{
			BaseUrl: baseURL + "/sync",
			Client:  client,
			Logger:  opts.Logger,
		},
		Torrent: qbittorrent_torrent.Client{
			BaseUrl: baseURL + "/torrents",
			Client:  client,
			Logger:  opts.Logger,
		},
		Transfer: qbittorrent_transfer.Client{
			BaseUrl: baseURL + "/transfer",
			Client:  client,
			Logger:  opts.Logger,
		},
	}

	c.client.Transport = &authedRoundTripper{
		wrapped:   transport,
		transport: transport,
		client:    c,
	}

	return c
}

// newTransport builds this client's own HTTP transport rather than sharing http.DefaultTransport.
//
// Two reasons, both learned from "Get .../torrents/info: EOF" appearing several times a second
// against a WebUI that was up the whole time.
//
// An EOF on a request that never left is almost always a keep-alive connection the other end has
// already closed: qBittorrent retires idle WebUI connections, and any NAT or NAS network stack in
// between does the same. Whoever holds the connection longest is the one who discovers it is dead,
// so this keeps idle connections for a good deal less time than the other end does and lets them go
// before they can rot.
//
// And a transport of our own means CloseIdleConnections on the retry path below throws away *our*
// dead connections rather than reaching into the pool every other part of the app is using.
func newTransport() *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.IdleConnTimeout = 20 * time.Second
	transport.MaxIdleConnsPerHost = 4
	return transport
}

func (c *Client) Login() error {
	endpoint := c.baseURL + "/auth/login"
	data := url.Values{}
	data.Add("username", c.Username)
	data.Add("password", c.Password)
	request, err := http.NewRequest("POST", endpoint, strings.NewReader(data.Encode()))
	if err != nil {
		return err
	}
	request.Header.Add("content-type", "application/x-www-form-urlencoded")
	request.Header.Add("Referer", c.baseURL)
	resp, err := c.client.Do(request)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("invalid status %s", resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if strings.TrimSpace(string(body)) == "Fails." {
		return fmt.Errorf("invalid username or password")
	}
	if len(resp.Cookies()) < 1 {
		return fmt.Errorf("no cookies in login response")
	}
	apiURL, err := url.Parse(c.baseURL)
	if err != nil {
		return err
	}
	jar, err := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	if err != nil {
		return err
	}
	jar.SetCookies(apiURL, []*http.Cookie{resp.Cookies()[0]})
	c.client.Jar = jar
	return nil
}

func (c *Client) Logout() error {
	endpoint := c.baseURL + "/auth/logout"
	request, err := http.NewRequest("POST", endpoint, nil)
	if err != nil {
		return err
	}
	resp, err := c.client.Do(request)
	if err != nil {
		return err
	}
	if resp.StatusCode != 200 {
		return fmt.Errorf("invalid status %s", resp.Status)
	}
	return nil
}

type authedRoundTripper struct {
	wrapped http.RoundTripper
	// transport is the same object as wrapped, kept typed so idle connections can be dropped when
	// one of them turns out to be dead. See RoundTrip.
	transport *http.Transport
	client    *Client
	mu        std_sync.Mutex
	reauthing bool
	reauthErr error
	reauthCh  chan struct{}
}

// reauth ensures only one login attempt runs at a time. Concurrent callers wait
// for the in-progress login to finish and share its result rather than each
// hammering qBittorrent's auth endpoint (which triggers an IP ban).
func (art *authedRoundTripper) reauth() error {
	art.mu.Lock()
	if art.reauthing {
		// Another goroutine is already logging in; wait for it.
		ch := art.reauthCh
		art.mu.Unlock()
		<-ch
		art.mu.Lock()
		err := art.reauthErr
		art.mu.Unlock()
		return err
	}

	art.reauthing = true
	art.reauthCh = make(chan struct{})
	art.mu.Unlock()

	art.client.logger.Warn().Msg("qBittorrent: 403 Forbidden, attempting to re-authenticate")
	loginErr := art.client.Login()
	if loginErr != nil {
		art.client.logger.Err(loginErr).Msg("qBittorrent: failed to re-authenticate")
	}

	art.mu.Lock()
	art.reauthing = false
	art.reauthErr = loginErr
	close(art.reauthCh)
	art.mu.Unlock()

	return loginErr
}

func (art *authedRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	// Don't intercept login or logout requests to avoid infinite recursion
	if strings.Contains(req.URL.Path, "/auth/login") || strings.Contains(req.URL.Path, "/auth/logout") {
		return art.wrapped.RoundTrip(req)
	}

	// Buffer the body so both retry paths below can send the request a second time.
	//
	// Note what is *not* done here any more: the caller's own request is left exactly as it was. A
	// RoundTripper is not allowed to modify the request it is handed, and modifying it had a cost
	// beyond the rule — replacing req.Body with a plain NopCloser dropped the GetBody that
	// http.NewRequest had set, and GetBody is precisely what tells the transport a request may be
	// sent again. Without it, a request that failed on a connection the server had already closed
	// came straight back to the caller as "EOF" instead of being retried on a fresh one.
	var bodyBytes []byte
	if req.Body != nil {
		var err error
		bodyBytes, err = io.ReadAll(req.Body)
		req.Body.Close()
		if err != nil {
			return nil, err
		}
	}

	resp, err := art.wrapped.RoundTrip(art.rebuild(req, bodyBytes))

	// A transport-level failure with no response at all is the dead-keep-alive case: the connection
	// was taken from the pool, the other end had already closed it, and nothing was ever written.
	// The request is replayable — the body is in hand — so drop the pool and send it once more
	// rather than reporting a failure the next attempt would not have had.
	if err != nil {
		art.transport.CloseIdleConnections()
		resp, err = art.wrapped.RoundTrip(art.rebuild(req, bodyBytes))
		if err != nil {
			return resp, err
		}
	}

	if resp.StatusCode == http.StatusForbidden {
		resp.Body.Close()

		if loginErr := art.reauth(); loginErr != nil {
			return nil, loginErr
		}

		// Retry the request with the refreshed session cookie
		newReq := art.rebuild(req, bodyBytes)
		newReq.Header.Del("Cookie")
		if art.client.client.Jar != nil {
			for _, cookie := range art.client.client.Jar.Cookies(newReq.URL) {
				newReq.AddCookie(cookie)
			}
		}

		return art.wrapped.RoundTrip(newReq)
	}

	return resp, err
}

// rebuild returns a fresh copy of the request with a readable body, ready to be sent.
//
// GetBody is set alongside Body so the transport can replay the request by itself, which is what
// makes an ordinary stale connection invisible instead of an error.
func (art *authedRoundTripper) rebuild(req *http.Request, bodyBytes []byte) *http.Request {
	clone := req.Clone(req.Context())
	if bodyBytes != nil {
		clone.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		clone.GetBody = func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(bodyBytes)), nil
		}
		clone.ContentLength = int64(len(bodyBytes))
	}
	return clone
}
