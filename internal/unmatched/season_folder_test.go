package unmatched

import "testing"

// Every way a release might name the first season. Getting one of these wrong means the download is
// left for manual matching, so the list is deliberately long.
func TestSeasonNumberFromFolderName(t *testing.T) {
	cases := map[string]int{
		// Core forms.
		"Season 1":     1,
		"Season 01":    1,
		"season 1":     1,
		"SEASON 1":     1,
		"Season One":   1,
		"Season_1":     1,
		"Season.1":     1,
		"Season-01":    1,
		"S1":           1,
		"S01":          1,
		"s01":          1,
		"S 1":          1,
		"S.1":          1,
		"S_01":         1,
		"Series 1":     1,
		"1st Season":   1,
		"01st Season":  1,
		"First Season": 1,
		// Embedded in a longer folder name.
		"Some Show S01 [1080p]":      1,
		"[Group] Some Show Season 1": 1,
		"Some Show - Season 01 (BD)": 1,
		// Part and cour, on request.
		"Part 1":   1,
		"Part One": 1,
		"Cour 1":   1,
		"Cour 01":  1,
		// Bare numbers, on request.
		"1":  1,
		"01": 1,
		// Roman numerals, on request.
		"Season I":  1,
		"Season II": 2,
		"S II":      2,

		// Other seasons read correctly, which is what keeps them from being matched as the first.
		"Season 2":      2,
		"S02":           2,
		"2nd Season":    2,
		"Second Season": 2,
		"Part 3":        3,
		"Season Ten":    10,

		// Not seasons.
		"Specials":              0,
		"Extra":                 0,
		"Some Show":             0,
		"[Erai-raws] Some Show": 0,
		"Bonus Disc":            0,
		"":                      0,
		"   ":                   0,
		// One episode, not a season folder.
		"Some Show S01E01":     0,
		"Some Show S01E01.mkv": 0,
	}

	for name, want := range cases {
		if got := seasonNumberFromFolderName(name); got != want {
			t.Errorf("seasonNumberFromFolderName(%q) = %d, want %d", name, got, want)
		}
	}
}

// The older display parser runs a bare `s(\d+)` over the name and finds a season inside a release
// group. This one must not, because here the answer decides which files get matched.
func TestSeasonNumberIgnoresIncidentalLetters(t *testing.T) {
	for _, name := range []string{
		"Erai-raws",
		"Some Show [Subs01]",
		"HorribleSubs",
		"Some Show (Dubs 2)",
	} {
		if got := seasonNumberFromFolderName(name); got != 0 {
			t.Errorf("seasonNumberFromFolderName(%q) = %d, want 0", name, got)
		}
	}
}
