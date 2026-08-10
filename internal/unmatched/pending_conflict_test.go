package unmatched

import "testing"

// An automatic match runs because a download finished, with nobody watching. A conflict it stops on
// has to be kept somewhere the screen can find it, or the download sits there looking untouched and
// the only record of why it stopped is a line in the log.
func TestPendingConflictsSurviveUntilAnswered(t *testing.T) {
	repo, _ := stageBase(t)

	if repo.PendingConflict("Some Release") != nil {
		t.Fatal("a conflict was reported before any match ran")
	}

	conflict := &MatchConflict{
		Destination:  "/library/Some Show",
		Files:        []ConflictingFile{{NewName: "Some Show - Episode 001.mkv"}},
		TotalPlanned: 1,
		Unattributed: true,
	}
	repo.SetPendingConflict("Some Release", conflict)

	got := repo.PendingConflict("Some Release")
	if got == nil {
		t.Fatal("the conflict was not kept")
	}
	if len(got.Files) != 1 || !got.Unattributed {
		t.Errorf("the conflict came back changed: %+v", got)
	}
	if repo.PendingConflictCount() != 1 {
		t.Errorf("count = %d, want 1", repo.PendingConflictCount())
	}

	// It rides along with the listing the screen already polls, which is what makes it a prompt
	// rather than a log line.
	listed := repo.withPendingConflicts([]*UnmatchedTorrent{{Name: "Some Release"}, {Name: "Untouched"}})
	if listed[0].PendingConflict == nil {
		t.Error("the listing did not carry the pending conflict")
	}
	if listed[1].PendingConflict != nil {
		t.Error("an unrelated download was given a conflict")
	}

	// Answered, and it stops being asked immediately rather than when a cache turns over.
	repo.ClearPendingConflict("Some Release")
	if repo.PendingConflict("Some Release") != nil {
		t.Error("the conflict outlived the decision")
	}
	relisted := repo.withPendingConflicts([]*UnmatchedTorrent{{Name: "Some Release"}})
	if relisted[0].PendingConflict != nil {
		t.Error("the listing still carried an answered conflict")
	}
}

func TestSetPendingConflictIgnoresNothingToSay(t *testing.T) {
	repo, _ := stageBase(t)

	repo.SetPendingConflict("", &MatchConflict{})
	repo.SetPendingConflict("Some Release", nil)

	if repo.PendingConflictCount() != 0 {
		t.Errorf("count = %d, want 0", repo.PendingConflictCount())
	}
}
