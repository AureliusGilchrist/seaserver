package unmatched

import (
	"reflect"
	"testing"
)

// A "downloading" badge with a torrent still present in the client's live list is not stuck — the
// download is simply still in progress.
func TestComputeStuckDownloadingMediaIDsNotStuckWhenLive(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	if err := r.database.UpsertUnmatchedTorrentMetadata("Show.S01E01", 101, []byte(`{}`)); err != nil {
		t.Fatalf("stage metadata: %v", err)
	}
	r.MarkAnimeDownloading(101)

	live := map[string]struct{}{"Show.S01E01": {}}
	stuck := r.ComputeStuckDownloadingMediaIDs(live)
	if len(stuck) != 0 {
		t.Fatalf("stuck = %v, want none", stuck)
	}
}

// A "downloading" badge whose only staged torrent name is absent from the live list is exactly the
// case this check exists for: the torrent was removed outside Seanime entirely.
func TestComputeStuckDownloadingMediaIDsStuckWhenAbsent(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	if err := r.database.UpsertUnmatchedTorrentMetadata("Show.S01E01", 202, []byte(`{}`)); err != nil {
		t.Fatalf("stage metadata: %v", err)
	}
	r.MarkAnimeDownloading(202)

	live := map[string]struct{}{"Unrelated.Show.S01E01": {}}
	stuck := r.ComputeStuckDownloadingMediaIDs(live)
	if !reflect.DeepEqual(stuck, []int{202}) {
		t.Fatalf("stuck = %v, want [202]", stuck)
	}
}

// No metadata row at all for a "downloading" anime falls out of the same rule as an absent name:
// zero rows trivially means zero live matches.
func TestComputeStuckDownloadingMediaIDsStuckWhenNoMetadata(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	r.MarkAnimeDownloading(303)

	stuck := r.ComputeStuckDownloadingMediaIDs(map[string]struct{}{"Anything": {}})
	if !reflect.DeepEqual(stuck, []int{303}) {
		t.Fatalf("stuck = %v, want [303]", stuck)
	}
}

// A "downloaded" or "matched" badge is never flagged, live torrents or not — this check only ever
// speaks to the "downloading" state.
func TestComputeStuckDownloadingMediaIDsIgnoresSettledBadges(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	r.MarkAnimeDownloading(404)
	r.MarkAnimeDownloaded(404)

	r.MarkAnimeDownloading(505)
	r.MarkAnimeMatchedState(505)

	stuck := r.ComputeStuckDownloadingMediaIDs(map[string]struct{}{})
	if len(stuck) != 0 {
		t.Fatalf("stuck = %v, want none", stuck)
	}
}

// Several downloading anime at once: only the ones with nothing live behind them come back, sorted.
func TestComputeStuckDownloadingMediaIDsMultipleAnime(t *testing.T) {
	r, _ := stageBaseWithDB(t)

	if err := r.database.UpsertUnmatchedTorrentMetadata("Live.Show.S01E01", 606, []byte(`{}`)); err != nil {
		t.Fatalf("stage metadata: %v", err)
	}
	r.MarkAnimeDownloading(606)

	if err := r.database.UpsertUnmatchedTorrentMetadata("Gone.Show.S01E01", 607, []byte(`{}`)); err != nil {
		t.Fatalf("stage metadata: %v", err)
	}
	r.MarkAnimeDownloading(607)

	r.MarkAnimeDownloading(608)

	live := map[string]struct{}{"Live.Show.S01E01": {}}
	stuck := r.ComputeStuckDownloadingMediaIDs(live)
	if !reflect.DeepEqual(stuck, []int{607, 608}) {
		t.Fatalf("stuck = %v, want [607 608]", stuck)
	}
}
