package kitsu

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
)

// Kitsu's OAuth surface is documented at https://kitsu.app/api/oauth.
//
// We don't host the OAuth flow ourselves — the user starts it in the web client, the redirect
// returns to the app with a code, and the server exchanges that code for an access/refresh pair.
// These two helpers cover the server side.
//
// Note: PKCE isn't required by Kitsu's documented flow, but we use it anyway because it adds no
// real cost and prevents an entire class of "stolen-client-secret" attacks if the OAuth client
// secret is ever leaked. The web client computes the verifier + challenge.

// OAuthConfig collects the OAuth endpoints.
type OAuthConfig struct {
	// AuthURL is `/api/oauth/authorize` on Kitsu.
	AuthURL string
	// TokenURL is `/api/oauth/token` on Kitsu.
	TokenURL string
	// ClientID identifies the app to Kitsu. Configurable so a self-hosted install can register
	// its own OAuth app.
	ClientID string
	// ClientSecret is the optional secret. Public clients (PKCE-only) leave this empty.
	ClientSecret string
	// RedirectURI must be precisely the one registered on the Kitsu developer page.
	RedirectURI string
}

// DefaultOAuthConfig returns the values an integrated install can fall back to if the per-install
// settings have not been populated yet. Leaving ClientID empty is a normal state — the user just
// hasn't set up an OAuth app.
func DefaultOAuthConfig() OAuthConfig {
	return OAuthConfig{
		AuthURL:   "https://kitsu.app/api/oauth/authorize",
		TokenURL:  "https://kitsu.app/api/oauth/token",
		ClientID:  "",
		ClientSecret: "",
		RedirectURI: "",
	}
}

// BuildAuthorizeURL composes the URL the user is sent to in the browser. `state` is opaque to
// Kitsu — the web client picks a fresh value per attempt and verifies it on the callback.
func BuildAuthorizeURL(cfg OAuthConfig, state, codeChallenge string) string {
	v := url.Values{}
	if cfg.ClientID != "" {
		v.Set("client_id", cfg.ClientID)
	}
	v.Set("response_type", "code")
	v.Set("redirect_uri", cfg.RedirectURI)
	v.Set("state", state)
	v.Set("code_challenge", codeChallenge)
	v.Set("code_challenge_method", "S256")
	return cfg.AuthURL + "?" + v.Encode()
}

// TokenResponse is the body Kitsu returns from /api/oauth/token.
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
	CreatedAt    int    `json:"created_at"`
}

// ExchangeCode exchanges an authorization code for an access/refresh pair. PKCE challenges are
// passed through `codeVerifier` (Kitsu hashes the verifier itself; we send the raw verifier and
// the server compares the SHA-256).
//
// `code` is the value Kitsu redirected back to the app with; `codeVerifier` is the random secret
// the web client picked at the start of the flow.
func (c *Client) ExchangeCode(ctx context.Context, cfg OAuthConfig, code, codeVerifier string) (*TokenResponse, error) {
	if cfg.TokenURL == "" {
		return nil, errors.New("kitsu: token URL not configured")
	}
	if code == "" {
		return nil, errors.New("kitsu: authorization code required")
	}

	form := url.Values{}
	if cfg.ClientID != "" {
		form.Set("client_id", cfg.ClientID)
	}
	if cfg.ClientSecret != "" {
		form.Set("client_secret", cfg.ClientSecret)
	}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", cfg.RedirectURI)
	form.Set("code_verifier", codeVerifier)

	req, err := newFormRequest(ctx, cfg.TokenURL, form)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, decodeOAuthError(resp)
	}

	var tr TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, err
	}
	if tr.AccessToken == "" {
		return nil, errors.New("kitsu: token response missing access_token")
	}
	return &tr, nil
}

// RefreshAccessToken trades a refresh token for a fresh access token. The refresh token may be
// rotated — callers should persist whatever TokenResponse comes back.
func (c *Client) RefreshAccessToken(ctx context.Context, cfg OAuthConfig, refreshToken string) (*TokenResponse, error) {
	if cfg.TokenURL == "" {
		return nil, errors.New("kitsu: token URL not configured")
	}
	if refreshToken == "" {
		return nil, errors.New("kitsu: refresh token required")
	}

	form := url.Values{}
	if cfg.ClientID != "" {
		form.Set("client_id", cfg.ClientID)
	}
	if cfg.ClientSecret != "" {
		form.Set("client_secret", cfg.ClientSecret)
	}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)

	req, err := newFormRequest(ctx, cfg.TokenURL, form)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, decodeOAuthError(resp)
	}

	var tr TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, err
	}
	if tr.AccessToken == "" {
		return nil, errors.New("kitsu: token response missing access_token")
	}
	return &tr, nil
}
