package unmatched

import (
	"testing"
	"time"
)

func TestRecentlyMatchedAnime(t *testing.T) {
	reset := func() {
		recentlyMatched.Lock()
		recentlyMatched.at = make(map[int]time.Time)
		recentlyMatched.Unlock()
	}

	t.Run("a match is remembered", func(t *testing.T) {
		reset()
		MarkAnimeMatched(42)
		if _, ok := RecentlyMatchedAnime()[42]; !ok {
			t.Error("a matched anime should be reported as recently matched")
		}
	})

	// The zero id is what an auto-match produces when its metadata lookup came back empty, and
	// treating that as "anime 0 is finished" would be a claim about nothing.
	t.Run("a missing id is not a match", func(t *testing.T) {
		reset()
		MarkAnimeMatched(0)
		MarkAnimeMatched(-1)
		if got := len(RecentlyMatchedAnime()); got != 0 {
			t.Errorf("got %d entries, want none", got)
		}
	})

	t.Run("the record expires and is evicted", func(t *testing.T) {
		reset()
		MarkAnimeMatched(7)

		recentlyMatched.Lock()
		recentlyMatched.at[7] = time.Now().Add(-recentlyMatchedTTL - time.Minute)
		recentlyMatched.Unlock()

		if _, ok := RecentlyMatchedAnime()[7]; ok {
			t.Error("a match older than the TTL should not be reported")
		}

		// Reading is also what prunes: the map must not grow for the life of the process.
		recentlyMatched.Lock()
		remaining := len(recentlyMatched.at)
		recentlyMatched.Unlock()
		if remaining != 0 {
			t.Errorf("%d stale entries left behind, want 0", remaining)
		}
	})

	t.Run("re-matching refreshes the record", func(t *testing.T) {
		reset()
		MarkAnimeMatched(9)
		recentlyMatched.Lock()
		recentlyMatched.at[9] = time.Now().Add(-recentlyMatchedTTL + time.Second)
		recentlyMatched.Unlock()

		MarkAnimeMatched(9)
		if _, ok := RecentlyMatchedAnime()[9]; !ok {
			t.Error("matching again should restart the anime's TTL")
		}
	})
}
