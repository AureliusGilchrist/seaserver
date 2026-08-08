package enqueuefuture

import (
	"testing"

	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/torrents/torrent"
)

func TestBestSeeders(t *testing.T) {
	t.Run("nil search data", func(t *testing.T) {
		best, count := bestSeeders(nil)
		if best != 0 || count != 0 {
			t.Errorf("got best=%d count=%d, want 0/0", best, count)
		}
	})

	t.Run("no torrents", func(t *testing.T) {
		best, count := bestSeeders(&torrent.SearchData{})
		if best != 0 || count != 0 {
			t.Errorf("got best=%d count=%d, want 0/0", best, count)
		}
	})

	t.Run("reports the healthiest and counts them all", func(t *testing.T) {
		best, count := bestSeeders(&torrent.SearchData{
			Torrents: []*hibiketorrent.AnimeTorrent{
				{Seeders: 2},
				nil, // a provider returning a nil entry must not be counted or panic
				{Seeders: 41},
				{Seeders: 7},
			},
		})
		if best != 41 {
			t.Errorf("best = %d, want 41", best)
		}
		if count != 3 {
			t.Errorf("count = %d, want 3 (the nil is not a torrent)", count)
		}
	})

	// The gate the queue applies: below MinSeeders a download either never starts or crawls, so the
	// entry is not worth putting in front of the user.
	t.Run("the seeder gate", func(t *testing.T) {
		tests := []struct {
			seeders    int
			wantHidden bool
		}{
			{seeders: 0, wantHidden: true},
			{seeders: 1, wantHidden: true},
			{seeders: 4, wantHidden: true},
			{seeders: 5, wantHidden: false},
			{seeders: 500, wantHidden: false},
		}
		for _, tt := range tests {
			best, count := bestSeeders(&torrent.SearchData{
				Torrents: []*hibiketorrent.AnimeTorrent{{Seeders: tt.seeders}},
			})
			if count != 1 {
				t.Fatalf("count = %d, want 1", count)
			}
			hidden := best < MinSeeders
			if hidden != tt.wantHidden {
				t.Errorf("best seeders %d: hidden = %v, want %v", tt.seeders, hidden, tt.wantHidden)
			}
		}
	})
}
