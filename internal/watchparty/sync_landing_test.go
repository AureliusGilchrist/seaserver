package watchparty

import (
	"testing"
	"time"
)

func TestSeekLanding(t *testing.T) {
	t0 := time.Now()
	playing := pendingSeek{active: true, target: 100, at: t0, measure: true}

	// No seek pending: settled.
	if landed, _, _ := seekLanding(pendingSeek{}, t0, 5, 5, false, false); !landed {
		t.Fatal("no pending seek should count as settled")
	}

	// Still buffering at the target (position not moving): not landed, so no new seek.
	if landed, _, _ := seekLanding(playing, t0.Add(4*time.Second), 100, 100, false, false); landed {
		t.Fatal("a stalled participant hasn't landed")
	}

	// Still on the old position: not landed.
	if landed, _, _ := seekLanding(playing, t0.Add(2*time.Second), 40, 39, false, false); landed {
		t.Fatal("a participant short of the target hasn't landed")
	}

	// Playing from the target: landed. It started at 100 and is at 101 after 6s, so the
	// seek took 5s to land.
	landed, took, ok := seekLanding(playing, t0.Add(6*time.Second), 101, 100.5, false, false)
	if !landed || !ok {
		t.Fatalf("expected a measured landing, got landed=%v ok=%v", landed, ok)
	}
	if took < 4.9 || took > 5.1 {
		t.Fatalf("took = %v, want ~5", took)
	}

	// Paused at the target while the source plays: it is being resumed, not landed.
	if landed, _, _ := seekLanding(playing, t0.Add(time.Second), 100, 100, true, false); landed {
		t.Fatal("paused at the target while the source plays still has to buffer")
	}

	// Paused at the target with the source paused: landed.
	paused := pendingSeek{active: true, target: 100, at: t0}
	if landed, _, _ := seekLanding(paused, t0.Add(time.Second), 100.2, 100.2, true, true); !landed {
		t.Fatal("paused at the target with the source paused has landed")
	}

	// Landing time is capped.
	_, took, _ = seekLanding(playing, t0.Add(time.Minute), 100.5, 100.1, false, false)
	if took != maxSeekLead {
		t.Fatalf("took = %v, want the cap %v", took, maxSeekLead)
	}
}
