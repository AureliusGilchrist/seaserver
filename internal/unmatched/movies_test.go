package unmatched

import "testing"

// A film in a batch has no episode number, which is exactly the shape that gets swept up and filed
// as an episode past the end of the season.
func TestMoviesAreRecognised(t *testing.T) {
	for _, name := range []string{
		"[Group] Some Show Movie [1080p].mkv",
		"Some_Show_-_Movie_01_(1080p).mkv",
		"Some Show - The Movie.mkv",
		"Some Show Movie 2 [1080p][HEVC].mkv",
		"[Group] Some Show Movies [BD 1080p].mkv",
		"Gekijouban Some Show [1080p].mkv",
		"Gekijou-ban Some Show.mkv",
		"Gekijyouban Some Show.mkv",
		"劇場版 Some Show [1080p].mkv",
	} {
		if !isMovieName(name) {
			t.Errorf("%q was not recognised as a film", name)
		}
	}
}

// Getting this wrong leaves an episode out of its own season, so the marker has to stay off the
// places the word turns up innocently — an episode title, a release group, a series' own name.
func TestOrdinaryEpisodesAreNotMovies(t *testing.T) {
	for _, name := range []string{
		"[Group] Some Show - 01 [1080p].mkv",
		"Some Show S01E05.mkv",
		"Some Show - 07 - Movie Night.mkv",     // "Movie" in the episode title
		"[Movie-Raws] Some Show - 03.mkv",      // "Movie" in the release group
		"Some Show - 04 - The Moviegoer.mkv",   // inside a longer word
		"Some_Show_-_12_(1080p)_[Remover].mkv", // "mov" inside a word
	} {
		if isMovieName(name) {
			t.Errorf("%q was wrongly treated as a film", name)
		}
	}
}

func TestMovieFolders(t *testing.T) {
	cases := map[string]bool{
		"Some Show/Movies/movie1.mkv":       true,
		"Some Show/Movie/feature.mkv":       true,
		"Some Show/Films/feature.mkv":       true,
		"Some Show/劇場版/feature.mkv":         true,
		"Some Show/Season 1/ep01.mkv":       false,
		"Some Show/ep01.mkv":                false,
		"Movie Collection/Season 1/e01.mkv": false, // only exact folder names count
	}
	for path, want := range cases {
		if got := pathHasMoviesSegment(path); got != want {
			t.Errorf("pathHasMoviesSegment(%q) = %v, want %v", path, got, want)
		}
	}
}

// The two exclusions mean the same thing to the match and differ only in what the log says, so the
// reason has to come back correctly labelled.
func TestAutomaticExclusionReason(t *testing.T) {
	cases := []struct {
		name    string
		relPath string
		want    string
	}{
		{"[Group] Some Show - 01 [1080p].mkv", "Some Show/ep01.mkv", ""},
		{"[Group] Some Show - OVA 01.mkv", "Some Show/ova.mkv", "special"},
		{"Some Show - SP01.mkv", "Some Show/sp01.mkv", "special"},
		{"[Group] Some Show Movie.mkv", "Some Show/movie.mkv", "movie"},
		{"feature.mkv", "Some Show/Movies/feature.mkv", "movie"},
		{"sp01.mkv", "Some Show/Specials/sp01.mkv", "special"},
	}
	for _, tt := range cases {
		if got := automaticExclusionReason(tt.name, tt.relPath); got != tt.want {
			t.Errorf("automaticExclusionReason(%q, %q) = %q, want %q", tt.name, tt.relPath, got, tt.want)
		}
	}
}
