package kitsu

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// newFormRequest produces a *http.Request whose body is a form-encoded payload, the shape Kitsu's
// token endpoint expects. Content-Type is set explicitly so the underlying transport does not
// try to guess.
func newFormRequest(ctx context.Context, fullURL string, form url.Values) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fullURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	return req, nil
}

// decodeOAuthError pulls a JSON:API error payload out of a non-2xx response, or returns a
// fallback error with the status code if the body was empty / unparsable.
func decodeOAuthError(resp *http.Response) error {
	body, _ := io.ReadAll(resp.Body)
	if len(body) == 0 {
		return fmt.Errorf("kitsu: oauth error %d (empty body)", resp.StatusCode)
	}
	var oauthErr struct {
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &oauthErr); err == nil && oauthErr.Error != "" {
		return fmt.Errorf("kitsu: oauth error %s: %s", oauthErr.Error, oauthErr.ErrorDescription)
	}
	return fmt.Errorf("kitsu: oauth error %d: %s", resp.StatusCode, string(body))
}

// MustNotEmpty is a tiny helper used by callers to bail out early when Kitsu hands us an empty
// response — JSON:API almost never does this, but the GetViewer-on-empty-token path can in
// unusual cases, and the caller would rather see a definite error than a generic unmarshal one.
var ErrEmptyBody = errors.New("kitsu: empty response body")
