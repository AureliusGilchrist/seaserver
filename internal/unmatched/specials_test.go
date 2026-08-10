package unmatched

import "testing"

// OVAs and specials must not be numbered as episodes of the season. Both underscore- and
// space-separated forms, because \b-style boundaries miss the underscore ones.
func TestSpecialsAreRecognised(t *testing.T) {
	for _, name := range []string{
		"[Group] Some Show - OVA 01 [1080p].mkv",
		"Some_Show_-_OVA_01_(1080p).mkv",
		"Some_Show_-_OVA.mkv",
		"[Group] Some Show - OAD 2 [1080p].mkv",
		"[Group] Some Show - ONA 03 [1080p].mkv",
		"Some Show - Special 1.mkv",
		"Some Show - Specials 1.mkv",
		"Some_Show_-_SP01.mkv",
		"Some Show S00E03.mkv",
		"Some.Show.s00e12.mkv",
	} {
		if !isSpecialName(name) {
			t.Errorf("%q was not recognised as an OVA/special", name)
		}
	}
}

// The cost of getting this wrong is an episode left out of its own season, so the heuristics have
// to stay off ordinary names.
func TestOrdinaryEpisodesAreNotSpecials(t *testing.T) {
	for _, name := range []string{
		"[Group] Some Show - 01 [1080p].mkv",
		"Some_Show_-_12_(1080p).mkv",
		"Some Show S01E05.mkv",
		"Some Show - 07 - A Very Special Day.mkv", // "Special" in the episode title
		"[OVA-Raws] Some Show - 03 [1080p].mkv",   // "OVA" in the release group
		"Sponsor Show - 04.mkv",                   // "sp" inside a word
		"Some Show - 09 - Ona's Promise.mkv",
	} {
		if isSpecialName(name) {
			t.Errorf("%q was wrongly treated as an OVA/special", name)
		}
	}
}

func TestSpecialsFolders(t *testing.T) {
	cases := map[string]bool{
		"Some Show/OVA/ova01.mkv":        true,
		"Some Show/Specials/sp01.mkv":    true,
		"Some Show/specials/sp01.mkv":    true,
		"Some Show/Bonus/thing.mkv":      true,
		"Some Show/Season 1/ep01.mkv":    false,
		"Some Show/ep01.mkv":             false,
		"Specials Show/Season 1/e01.mkv": false, // only exact folder names count
	}
	for path, want := range cases {
		if got := pathHasSpecialsSegment(path); got != want {
			t.Errorf("pathHasSpecialsSegment(%q) = %v, want %v", path, got, want)
		}
	}
}

// The count check is exact in both directions, and says nothing when there is no count to compare
// against.
func TestCountMismatchFor(t *testing.T) {
	plan := func(n int) []PlannedEpisode {
		out := make([]PlannedEpisode, 0, n)
		for i := 1; i <= n; i++ {
			out = append(out, PlannedEpisode{Episode: i})
		}
		return out
	}

	if got := countMismatchFor(12, "/lib", plan(12)); got != nil {
		t.Errorf("an exact match was reported as a mismatch: %+v", got)
	}
	if got := countMismatchFor(12, "/lib", plan(4)); got == nil {
		t.Error("too few episodes was not reported")
	} else if got.Expected != 12 || got.Found != 4 {
		t.Errorf("got expected=%d found=%d, want 12/4", got.Expected, got.Found)
	}
	if got := countMismatchFor(12, "/lib", plan(17)); got == nil {
		t.Error("too many episodes was not reported")
	}
	// Nothing recorded to compare against — asking would be noise.
	if got := countMismatchFor(0, "/lib", plan(4)); got != nil {
		t.Error("a mismatch was reported against an unknown episode count")
	}
	if got := countMismatchFor(12, "/lib", nil); got != nil {
		t.Error("a mismatch was reported for a match with no files")
	}
}
