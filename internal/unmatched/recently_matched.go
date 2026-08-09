package unmatched

import (
	"sync"
	"time"
)

// A match is the moment a download stops being a download and becomes part of the library, and it is
// the only moment that is known for certain. Everything else about "is this still downloading" is
// inferred — from what the torrent client happens to be reporting, and from what is left lying in the
// staging area — and both of those can go on saying "downloading" long after the files have moved:
//
//   - a partial match keeps its staging directory (there are still video files in it) but loses its
//     sidecar, so the directory survives as evidence of a download that has in fact been dealt with;
//   - a full match removes the directory entirely, at which point the anime simply stops being
//     mentioned, and "stopped being mentioned" is not the same signal as "finished" — the client
//     waits several silent polls before believing it, and up to ten minutes for a download it never
//     saw confirmed.
//
// So the match records itself here, and the downloading endpoint reads it as the positive statement
// it is: this anime is done, hand the card over to the library badge.
//
// The record is deliberately short-lived. It exists to cover the gap between the files landing and
// the ordinary signals catching up, not to be a second source of truth about the library.
const recentlyMatchedTTL = 15 * time.Minute

var recentlyMatched = struct {
	sync.Mutex
	at map[int]time.Time
}{at: make(map[int]time.Time)}

// MarkAnimeMatched records that an anime's files have just been moved into the library.
func MarkAnimeMatched(animeID int) {
	if animeID <= 0 {
		return
	}
	recentlyMatched.Lock()
	defer recentlyMatched.Unlock()
	recentlyMatched.at[animeID] = time.Now()
}

// RecentlyMatchedAnime returns the anime matched within the TTL, dropping anything older as it goes.
func RecentlyMatchedAnime() map[int]struct{} {
	recentlyMatched.Lock()
	defer recentlyMatched.Unlock()

	out := make(map[int]struct{}, len(recentlyMatched.at))
	for id, at := range recentlyMatched.at {
		if time.Since(at) > recentlyMatchedTTL {
			delete(recentlyMatched.at, id)
			continue
		}
		out[id] = struct{}{}
	}
	return out
}
