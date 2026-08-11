package anilist

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"net/http"
	"seanime/internal/constants"
	"seanime/internal/util"
	"strconv"
	"time"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"
)

func CustomQuery(body map[string]interface{}, logger *zerolog.Logger, token string) (data interface{}, err error) {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return customQuery(bodyBytes, logger, token)
}

// CustomQueryCtx runs a raw GraphQL query on the caller's context, through the same gate and pacer
// as every other AniList request — see priority.go.
//
// The context-free form below does neither: it builds its own background context, so it cannot be
// cancelled, and it never passes gateRequest, so the budget never learns it happened. A single such
// call is harmless. One inside a loop is not: it spends slots the pacer thinks are still available,
// which is answered with 429s, which the pacer then absorbs by stalling every *metered* request for
// a minute apiece. Use this form for anything on a cancellable path or in a loop.
func CustomQueryCtx(ctx context.Context, body []byte, logger *zerolog.Logger, token ...string) (data interface{}, err error) {
	return customQueryWithContext(ctx, body, logger, token...)
}

func customQuery(body []byte, logger *zerolog.Logger, token ...string) (data interface{}, err error) {
	return customQueryWithContext(context.Background(), body, logger, token...)
}

func customQueryWithContext(ctx context.Context, body []byte, logger *zerolog.Logger, token ...string) (data interface{}, err error) {

	var rlRemainingStr string

	reqTime := time.Now()
	defer func() {
		timeSince := time.Since(reqTime)
		formattedDur := timeSince.Truncate(time.Millisecond).String()
		if err != nil {
			// Log context deadline exceeded as WARN to reduce log spam during transient issues
			if errors.Is(err, context.DeadlineExceeded) {
				logger.Warn().Str("duration", formattedDur).Str("rlr", rlRemainingStr).Err(err).Msg("anilist: Request timeout")
			} else {
				logger.Error().Str("duration", formattedDur).Str("rlr", rlRemainingStr).Err(err).Msg("anilist: Failed Request")
			}
		} else {
			if timeSince > 600*time.Millisecond {
				logger.Warn().Str("rtt", formattedDur).Str("rlr", rlRemainingStr).Msg("anilist: Long Request")
			} else {
				logger.Trace().Str("rtt", formattedDur).Str("rlr", rlRemainingStr).Msg("anilist: Successful Request")
			}
		}
	}()

	defer util.HandlePanicInModuleThen("api/anilist/custom_query", func() {
		err = errors.New("panic in customQuery")
	})

	// Takes its turn and its slot like everything else. See CustomQueryCtx above for what went
	// wrong while this path was exempt.
	release := gateRequest(ctx)
	defer release()

	client := newAnilistHTTPClient()

	var req *http.Request
	requestCtx := ctx
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		requestCtx, cancel = context.WithTimeout(ctx, anilistRequestTimeout)
		defer cancel()
	}
	req, err = http.NewRequestWithContext(requestCtx, "POST", constants.AnilistApiUrl, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if len(token) > 0 && token[0] != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token[0]))
	}

	// Send request
	retryCount := 2

	var resp *http.Response
	for i := 0; i < retryCount; i++ {

		// Reset response body for retry
		if resp != nil && resp.Body != nil {
			resp.Body.Close()
		}

		// Recreate the request body if it was read in a previous attempt
		if req.GetBody != nil {
			newBody, err := req.GetBody()
			if err != nil {
				return nil, fmt.Errorf("failed to get request body: %w", err)
			}
			req.Body = newBody
		}

		resp, err = client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("request failed: %w", err)
		}

		rlRemainingStr = resp.Header.Get("X-Ratelimit-Remaining")
		if remaining, convErr := strconv.Atoi(rlRemainingStr); convErr == nil {
			ObserveRateLimitRemaining(remaining)
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			// Over the line already: book the window as spent so the pacer stops sending into it.
			ObserveRateLimitRemaining(0)
			rlRetryAfterStr := resp.Header.Get("Retry-After")
			rlRetryAfter, convErr := strconv.Atoi(rlRetryAfterStr)
			if convErr != nil || rlRetryAfter <= 0 {
				rlRetryAfter = 60
			}
			logger.Warn().Msgf("anilist: Rate limited (429), retrying in %d seconds", rlRetryAfter+1)

			select {
			case <-requestCtx.Done():
				return nil, requestCtx.Err()
			case <-time.After(time.Duration(rlRetryAfter+1) * time.Second):
				continue
			}
		}

		break
	}

	defer resp.Body.Close()

	if resp.Header.Get("Content-Encoding") == "gzip" {
		resp.Body, err = gzip.NewReader(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("gzip decode failed: %w", err)
		}
	}

	var res interface{}
	err = json.NewDecoder(resp.Body).Decode(&res)
	if err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	var ok bool

	reqErrors, ok := res.(map[string]interface{})["errors"].([]interface{})

	if ok && len(reqErrors) > 0 {
		firstError, foundErr := reqErrors[0].(map[string]interface{})
		if foundErr {
			return nil, errors.New(firstError["message"].(string))
		}
	}

	data, ok = res.(map[string]interface{})["data"]
	if !ok {
		return nil, errors.New("failed to parse data")
	}

	return data, nil
}
