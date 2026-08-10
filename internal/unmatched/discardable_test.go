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
		// Commercials, promos and trailers. The numbered forms are the ones that used to slip
		// through: habari reads the trailing digits as an episode number, which short-circuited the
		// broader patterns and filed every CM and PV in the release as a real episode.
		"[Judas] Show - CM 3 (1080p).mkv",
		"[Judas] Show - CM3 (1080p).mkv",
		"[Group] Show - PV 02 [1080p].mkv",
		"[Group] Show - PV2 [1080p].mkv",
		"Show - Trailer 1.mkv",
		"Show - Promo 2.mkv",
		"Show - Teaser.mkv",
		"[Group] Show - Commercial 05 (1080p).mkv",
		"[Group] Show - Spot 1 (1080p).mkv",
		"Show CM.mkv",
		"Show PV.mkv",
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
		// The promo tokens must not fire from inside a word or a real episode title. "AD" is
		// deliberately not one of the tokens for exactly this reason.
		"[Group] Show - 07 - Advance Notice [1080p].mkv",
		"[Group] Show - 04 - The Campaign [1080p].mkv",
		"[Group] Scmp Show - 09 (1080p).mkv",
		"[Group] Show - 11 - Promotion Day [1080p].mkv",
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

// The exact files that were matched into the library as episodes 14 through 17.
//
// Two guards should each have caught them on their own, and both missed: the tag sits between
// underscores, which Go's \b counts as word characters, and the folder was "Extras" where the
// folder check tested for exactly "Extra".
func TestUnderscoreSeparatedCreditlessFilesAreDiscarded(t *testing.T) {
	names := []string{
		"[DB]Irozuku Sekai no Ashita kara_-_NCED01_(10bit_BD1080p_x265).mkv",
		"[DB]Irozuku Sekai no Ashita kara_-_NCED02_(10bit_BD1080p_x265).mkv",
		"[DB]Irozuku Sekai no Ashita kara_-_NCED03_(10bit_BD1080p_x265).mkv",
		"[DB]Irozuku Sekai no Ashita kara_-_NCOP_(10bit_BD1080p_x265).mkv",
	}
	for _, name := range names {
		if !isNCName(name) {
			t.Errorf("%q was not recognised as creditless content", name)
		}
	}
}

// Underscores are separators wherever a tag appears, not only for NC tags.
func TestUnderscoreSeparatedPromosAreDiscarded(t *testing.T) {
	for _, name := range []string{
		"Some_Show_-_PV01_(1080p).mkv",
		"Some_Show_-_CM3_(1080p).mkv",
		"Some_Show_-_creditless_opening.mkv",
	} {
		if !isNCName(name) {
			t.Errorf("%q was not recognised as discardable", name)
		}
	}
}

// The folder guard stays exact on purpose: everything in a folder it matches is deleted, and
// "Extras" is where plenty of releases put OVAs and specials worth keeping. Files like the ones
// above are discarded by name instead, which removes the creditless openings without touching
// whatever else shares the folder with them.
func TestExtraFolderMatchingStaysNarrow(t *testing.T) {
	cases := map[string]bool{
		"Some Show/Extra/whatever.mkv":     true,
		"Some Show/extra/whatever.mkv":     true,
		"Some Show/Extras/OVA 01.mkv":      false,
		"Some Show/Season 1/ep01.mkv":      false,
		"Some Show/Extraordinary/ep01.mkv": false,
	}
	for path, want := range cases {
		if got := pathHasExtraSegment(path); got != want {
			t.Errorf("pathHasExtraSegment(%q) = %v, want %v", path, got, want)
		}
	}
}

// And the thing that must not change: ordinary episodes are still episodes.
func TestOrdinaryEpisodesAreNotDiscarded(t *testing.T) {
	for _, name := range []string{
		"Irozuku Sekai no Ashita kara - 01.mkv",
		"[DB]Irozuku Sekai no Ashita kara_-_01_(10bit_BD1080p_x265).mkv",
		"Some Show - 05 - The Opening Ceremony.mkv",
		"Some_Show_-_12_(1080p).mkv",
	} {
		if isNCName(name) {
			t.Errorf("%q was wrongly treated as creditless/bonus content", name)
		}
	}
}
