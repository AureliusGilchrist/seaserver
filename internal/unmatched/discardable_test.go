package unmatched

import "testing"

// Guards the deletion rules: creditless/bonus content must be detected, and real episodes
// must never be, since a false positive here silently deletes a user's episode.
func TestNCAndExtraDetection(t *testing.T) {
	shouldDelete := []string{
		// Explicit creditless tags
		"[SubsPlease] Show - NCOP1 (1080p) [ABC123].mkv",
		"[SubsPlease] Show - NCED2 (1080p) [ABC123].mkv",
		"[Erai-raws] Show - NCOP [1080p][Multiple Subtitle].mkv",
		"Show - Creditless Opening.mkv",
		"Show - Textless Ending 2.mkv",
		"Show - Clean Opening.mkv",
		// Bare Opening/Ending on a file that carries no episode number
		"Show - Opening.mkv",
		"Show - Ending 2.mkv",
		"[Group] Show - Opening 1 (1080p).mkv",
		"Opening.mkv",
	}
	for _, n := range shouldDelete {
		if !isNCName(n) {
			t.Errorf("expected to DELETE: %q", n)
		}
	}

	shouldKeep := []string{
		// Ordinary episodes
		"[SubsPlease] NEEDY GIRL OVERDOSE - 01 (1080p) [034F401D].mkv",
		"[Erai-raws] Needy Girl Overdose - 02 [1080p CR WEB-DL AVC AAC][MultiSub][2CAC656B].mkv",
		"[Group] Show - 05 (1080p).mkv",
		"[Group] Cowboy Bebop - 12 (1080p).mkv",
		// The case called out explicitly: "Opening"/"Ending" inside a real episode title
		"[Group] Show - 05 - The Opening Ceremony [1080p].mkv",
		"[Group] Show - 12 - Ending of an Era [1080p].mkv",
		"[Group] Show - 03 - Opening Night (1080p).mkv",
		"[Group] Show - 24 - The Ending [1080p][ABC123].mkv",
	}
	for _, n := range shouldKeep {
		if isNCName(n) {
			t.Errorf("false positive, would DELETE a real episode: %q", n)
		}
	}

	if !isExtraName("Extra") || !isExtraName("extra") {
		t.Error("Extra not detected")
	}
	if isExtraName("Extras") || isExtraName("Extra Stuff") {
		t.Error("matched more than exactly Extra")
	}
	if !pathHasExtraSegment("Extra/thing.mkv") || pathHasExtraSegment("Season 1/ep.mkv") {
		t.Error("path segment detection wrong")
	}
}
