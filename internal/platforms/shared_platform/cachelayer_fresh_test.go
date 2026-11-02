package shared_platform

import (
	"testing"
	"time"
)

func TestFreshnessRules(t *testing.T) {
	finished := []byte(`{"Media":{"status":"FINISHED"}}`)
	airing := []byte(`{"Media":{"status":"RELEASING"}}`)
	upcoming := []byte(`{"Media":{"status":"NOT_YET_RELEASED"}}`)
	ago := func(d time.Duration) time.Time { return time.Now().Add(-d) }

	if isStale(finished, ago(2*time.Hour)) {
		t.Error("a finished show stored 2h ago should be fresh")
	}
	if !isStale(finished, ago(7*time.Hour)) {
		t.Error("a finished show stored 7h ago should be refreshed")
	}
	if isAiringPastFresh(finished, ago(7*time.Hour)) {
		t.Error("a finished show is never read live first")
	}
	if isAiringPastFresh(airing, ago(10*time.Minute)) {
		t.Error("an airing show stored 10 minutes ago is fresh")
	}
	if !isAiringPastFresh(airing, ago(40*time.Minute)) {
		t.Error("an airing show stored 40 minutes ago is read live first")
	}
	if !isAiringPastFresh(upcoming, ago(40*time.Minute)) {
		t.Error("an upcoming show is treated like an airing one")
	}
}
