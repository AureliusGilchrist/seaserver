package kitsu

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
)

// GetCurrentUser fetches the user record for the bearer token currently configured on the client.
// Used during OAuth validation and whenever we need the display name of the signed-in profile.
func (c *Client) GetCurrentUser(ctx context.Context) (*User, error) {
	if !c.HasToken() {
		return nil, ErrNotAuthenticated
	}
	raw, err := c.getCached(ctx, "/users/-/self", ttlFromSeconds(60))
	if err != nil {
		return nil, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}

	var u User
	if err := json.Unmarshal(resp.Data, &u); err != nil {
		return nil, err
	}
	if u.ID == "" {
		return nil, errors.New("kitsu: missing user id in /users/-/self response")
	}
	return &u, nil
}

// GetUserByID fetches a public Kitsu user record by id. Does not require auth — only the user's
// public profile is returned — but the resolved avatar/follower counts may be hidden if the user
// has set their account private.
func (c *Client) GetUserByID(ctx context.Context, id string) (*User, error) {
	if id == "" {
		return nil, errors.New("kitsu: user id required")
	}
	raw, err := c.getCached(ctx, "/users/"+url.PathEscape(id), ttlFromSeconds(300))
	if err != nil {
		return nil, err
	}

	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	var u User
	if err := json.Unmarshal(resp.Data, &u); err != nil {
		return nil, err
	}
	return &u, nil
}
