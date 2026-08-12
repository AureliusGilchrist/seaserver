package handlers

import (
	"slices"
	"testing"

	"seanime/internal/unmatched"
)

func library(ids ...int) map[int]struct{} {
	m := make(map[int]struct{}, len(ids))
	for _, id := range ids {
		m[id] = struct{}{}
	}
	return m
}

func recorded(mediaID int, state string) unmatched.AnimeDownloadState {
	return unmatched.AnimeDownloadState{MediaID: mediaID, State: state}
}

// Every anime with files in the library is matched, however those files got there — downloaded
// here, imported by hand, or present long before any of this existed.
func TestLibraryEntriesAreMatched(t *testing.T) {
	res := buildDownloadingMediaStatus(nil, library(1, 2, 3))

	for _, id := range []int{1, 2, 3} {
		if !slices.Contains(res.Matched, id) {
			t.Errorf("%d is not matched, want it matched for having files", id)
		}
	}
	if len(res.Downloading) != 0 || len(res.Finished) != 0 {
		t.Errorf("downloading=%v finished=%v, want both empty", res.Downloading, res.Finished)
	}
}

// The sanity check: a download recorded as waiting to be matched, whose episodes are in fact
// already in the library, is matched. The record has fallen behind; the files are the truth.
func TestLocalFilesTurnDownloadedIntoMatched(t *testing.T) {
	res := buildDownloadingMediaStatus(
		[]unmatched.AnimeDownloadState{recorded(42, unmatched.DownloadStateDownloaded)},
		library(42),
	)

	if !slices.Contains(res.Matched, 42) {
		t.Fatalf("42 is not matched; matched=%v finished=%v", res.Matched, res.Finished)
	}
	if slices.Contains(res.Finished, 42) {
		t.Error("42 is still reported as downloaded — it must not be both")
	}
}

// And only when the files are there. A finished download still sitting in staging keeps its grey
// badge, because that one is asking you to go and match it.
func TestDownloadedWithoutLocalFilesStaysDownloaded(t *testing.T) {
	res := buildDownloadingMediaStatus(
		[]unmatched.AnimeDownloadState{recorded(42, unmatched.DownloadStateDownloaded)},
		library(),
	)

	if !slices.Contains(res.Finished, 42) {
		t.Fatalf("42 is not reported as downloaded; finished=%v matched=%v", res.Finished, res.Matched)
	}
	if slices.Contains(res.Matched, 42) {
		t.Error("42 was promoted to matched without any files to justify it")
	}
}

// Downloading outranks everything, files included: another season coming down is the fact that
// decides what you do next.
func TestDownloadingWinsOverLocalFiles(t *testing.T) {
	res := buildDownloadingMediaStatus(
		[]unmatched.AnimeDownloadState{recorded(42, unmatched.DownloadStateDownloading)},
		library(42),
	)

	if !slices.Contains(res.Downloading, 42) {
		t.Fatalf("42 is not downloading; downloading=%v matched=%v", res.Downloading, res.Matched)
	}
	if slices.Contains(res.Matched, 42) {
		t.Error("42 is also matched — a card would have two badges")
	}
}

// One anime, one badge, in every combination.
func TestAnAnimeAppearsInExactlyOneList(t *testing.T) {
	res := buildDownloadingMediaStatus(
		[]unmatched.AnimeDownloadState{
			recorded(1, unmatched.DownloadStateDownloading),
			recorded(2, unmatched.DownloadStateDownloaded),
			recorded(3, unmatched.DownloadStateMatched),
			recorded(4, unmatched.DownloadStateDownloaded),
		},
		library(1, 3, 4, 5),
	)

	seen := map[int]int{}
	for _, id := range res.Downloading {
		seen[id]++
	}
	for _, id := range res.Finished {
		seen[id]++
	}
	for _, id := range res.Matched {
		seen[id]++
	}
	for id, count := range seen {
		if count != 1 {
			t.Errorf("%d appears in %d lists, want 1", id, count)
		}
	}

	if !slices.Contains(res.Downloading, 1) {
		t.Error("1 should be downloading")
	}
	if !slices.Contains(res.Finished, 2) {
		t.Error("2 has no files, so it should still be downloaded")
	}
	if !slices.Contains(res.Matched, 3) {
		t.Error("3 should be matched")
	}
	if !slices.Contains(res.Matched, 4) {
		t.Error("4 has files, so its downloaded record should read as matched")
	}
	if !slices.Contains(res.Matched, 5) {
		t.Error("5 has files and no record, so it should be matched")
	}
}
