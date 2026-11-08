package connectivity

import (
	"errors"
	"testing"
)

func TestForcedOfflineIgnoresTheConnection(t *testing.T) {
	reset()
	SetForcedOffline(true)
	report(true)
	if Current() != Offline {
		t.Fatalf("state is %s while forced offline", Current())
	}
	SetForcedOffline(false)
	if Current() != Online {
		t.Fatalf("state is %s after turning it off", Current())
	}
}

func reset() {
	forced.Store(false)
	offline.Store(false)
	blocked.Store(false)
	failures.Store(0)
}

func TestOneFailedProbeDoesNotGoOffline(t *testing.T) {
	reset()
	report(false)
	report(false)
	if Current() != Online {
		t.Fatalf("offline after %d failures", failures.Load())
	}
	report(true)
	report(false)
	report(false)
	if Current() != Online {
		t.Fatal("a success should have reset the failure count")
	}
}

func TestOfflineAndBack(t *testing.T) {
	reset()
	var seen []State
	OnChange(func(s State) { seen = append(seen, s) })

	for range failuresBeforeOffline {
		report(false)
	}
	if Current() != Offline || IsAniListAllowed() {
		t.Fatalf("state is %s after repeated failures", Current())
	}
	report(true)
	if Current() != Online {
		t.Fatalf("state is %s after a success", Current())
	}
	if len(seen) != 2 || seen[0] != Offline || seen[1] != Online {
		t.Fatalf("listeners saw %v", seen)
	}
}

func TestBlockTakesPriorityAndKeepsTheRealState(t *testing.T) {
	reset()
	SetBlocked(true)
	if Current() != Blocked || IsAniListAllowed() {
		t.Fatalf("state is %s while blocked", Current())
	}
	for range failuresBeforeOffline {
		report(false)
	}
	if Current() != Blocked || !IsOffline() {
		t.Fatal("the block should show, with the real connection still tracked behind it")
	}
	SetBlocked(false)
	if Current() != Offline {
		t.Fatalf("state is %s after unblocking", Current())
	}
	reset()
}

func TestIsNetworkError(t *testing.T) {
	for _, msg := range []string{
		`Get "https://x": dial tcp: lookup x on 127.0.0.53:53: privacy/doh: DNS blocked, no DoH resolver is reachable (fail-closed)`,
		"read tcp 1.2.3.4:5->6.7.8.9:443: connection reset by peer",
		`Get "https://x": context deadline exceeded (Client.Timeout exceeded while awaiting headers)`,
	} {
		if !IsNetworkError(errors.New(msg)) {
			t.Errorf("%q should be a network error", msg)
		}
	}
	for _, msg := range []string{"anime not found", "animepahe: 403 blocked by Cloudflare's check"} {
		if IsNetworkError(errors.New(msg)) {
			t.Errorf("%q is not a network error", msg)
		}
	}
}
