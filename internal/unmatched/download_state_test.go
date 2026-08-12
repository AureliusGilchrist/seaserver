package unmatched

import (
	"testing"
)

// stateOf reads back the one state recorded for an anime, or "" when it has none.
func stateOf(t *testing.T, r *Repository, mediaID int) string {
	t.Helper()
	for _, s := range r.AnimeDownloadStates() {
		if s.MediaID == mediaID {
			return s.State
		}
	}
	return ""
}

// The badge is a progression — downloading, then downloaded, then matched — and each step is
// recorded at the moment it happens rather than worked out afterwards.
func TestDownloadStateProgression(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	r.MarkAnimeDownloading(101)
	if got := stateOf(t, r, 101); got != DownloadStateDownloading {
		t.Fatalf("after queueing: %q, want %q", got, DownloadStateDownloading)
	}

	r.MarkAnimeDownloaded(101)
	if got := stateOf(t, r, 101); got != DownloadStateDownloaded {
		t.Fatalf("after finishing: %q, want %q", got, DownloadStateDownloaded)
	}

	r.MarkAnimeMatchedState(101)
	if got := stateOf(t, r, 101); got != DownloadStateMatched {
		t.Fatalf("after matching: %q, want %q", got, DownloadStateMatched)
	}
}

// One anime, one badge, whatever else is true of it.
func TestDownloadStateIsOnePerAnime(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	r.MarkAnimeDownloading(202)
	r.MarkAnimeDownloading(202)
	r.MarkAnimeDownloading(202)

	count := 0
	for _, s := range r.AnimeDownloadStates() {
		if s.MediaID == 202 {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("rows for one anime = %d, want 1", count)
	}
}

// A badge never walks backwards on its own. This is the rule that the old design broke constantly:
// an observation arriving late — a torrent seen as complete after the files were already matched —
// must not take a matched anime back to downloaded.
func TestFinishingCannotUndoAMatch(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	r.MarkAnimeDownloading(303)
	r.MarkAnimeMatchedState(303)

	r.MarkAnimeDownloaded(303)

	if got := stateOf(t, r, 303); got != DownloadStateMatched {
		t.Fatalf("state = %q after a late finish, want it to stay %q", got, DownloadStateMatched)
	}
}

// Finishing says nothing about an anime nobody queued anything for. Inventing a badge here is how
// badges appear on things the user never downloaded.
func TestFinishingAnUnknownAnimeRecordsNothing(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	r.MarkAnimeDownloaded(404)

	if got := stateOf(t, r, 404); got != "" {
		t.Fatalf("state = %q, want no record at all", got)
	}
}

// Downloading something you already have is still downloading — a second season, a better release.
// Queueing is something the user did, so it outranks whatever the badge said before.
func TestQueueingAgainAfterAMatchGoesBackToDownloading(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	r.MarkAnimeDownloading(505)
	r.MarkAnimeMatchedState(505)

	r.MarkAnimeDownloading(505)

	if got := stateOf(t, r, 505); got != DownloadStateDownloading {
		t.Fatalf("state = %q, want %q", got, DownloadStateDownloading)
	}
}

// Deleting the download is the one thing that takes a badge down rather than moving it on.
func TestClearingRemovesTheBadge(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	r.MarkAnimeDownloading(606)
	r.ClearAnimeDownloadState(606)

	if got := stateOf(t, r, 606); got != "" {
		t.Fatalf("state = %q after clearing, want no record", got)
	}
}

// Two anime do not share a badge.
func TestStatesAreIndependentPerAnime(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	r.MarkAnimeDownloading(707)
	r.MarkAnimeDownloading(808)
	r.MarkAnimeMatchedState(808)

	if got := stateOf(t, r, 707); got != DownloadStateDownloading {
		t.Errorf("707 = %q, want %q", got, DownloadStateDownloading)
	}
	if got := stateOf(t, r, 808); got != DownloadStateMatched {
		t.Errorf("808 = %q, want %q", got, DownloadStateMatched)
	}
}
