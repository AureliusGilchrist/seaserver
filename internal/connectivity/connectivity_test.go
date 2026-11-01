package connectivity

import "testing"

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
