package anilist

import (
	"seanime/internal/events"
	"testing"
)

type tokenExpiredEventCapture struct {
	events.WSEventManagerInterface
	name    string
	payload interface{}
}

func (c *tokenExpiredEventCapture) SendEvent(name string, payload interface{}) {
	c.name = name
	c.payload = payload
}

func TestBroadcastTokenExpiredIncludesProfileID(t *testing.T) {
	client := NewAnilistClient("token", "")
	capture := &tokenExpiredEventCapture{}
	client.SetWSEventManager(capture)
	client.SetTokenExpiredProfileID(42)

	client.broadcastTokenExpired()

	if capture.name != events.AnilistTokenExpired {
		t.Fatalf("event name = %q, want %q", capture.name, events.AnilistTokenExpired)
	}
	payload, ok := capture.payload.(map[string]uint)
	if !ok || payload["profileId"] != 42 {
		t.Fatalf("event payload = %#v, want profileId 42", capture.payload)
	}
}
