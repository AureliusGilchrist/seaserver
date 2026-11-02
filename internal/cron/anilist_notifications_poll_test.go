package cron

import (
	"seanime/internal/api/anilist"
	"testing"
)

type pollTestClient struct {
	anilist.AnilistClient
	authenticated bool
	rejected      bool
}

func (c *pollTestClient) IsAuthenticated() bool { return c.authenticated }
func (c *pollTestClient) TokenRejected() bool   { return c.rejected }

type pollTestClientNoFlag struct {
	anilist.AnilistClient
}

func (c *pollTestClientNoFlag) IsAuthenticated() bool { return true }

func TestCanPollAnilistNotifications(t *testing.T) {
	if canPollAnilistNotifications(nil) {
		t.Fatal("nil client must be skipped")
	}
	if canPollAnilistNotifications(&pollTestClient{authenticated: false}) {
		t.Fatal("unauthenticated client must be skipped")
	}
	if canPollAnilistNotifications(&pollTestClient{authenticated: true, rejected: true}) {
		t.Fatal("client with a rejected token must be skipped")
	}
	if !canPollAnilistNotifications(&pollTestClient{authenticated: true}) {
		t.Fatal("authenticated client must be polled")
	}
	if !canPollAnilistNotifications(&pollTestClientNoFlag{}) {
		t.Fatal("client without a rejected flag must be polled when authenticated")
	}
	// A real client starts out pollable; a fresh login replaces it, which clears the flag.
	if !canPollAnilistNotifications(anilist.NewAnilistClient("token", "")) {
		t.Fatal("fresh real client must be polled")
	}
}
