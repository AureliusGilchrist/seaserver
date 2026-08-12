package unmatched

import (
	"path/filepath"
	"regexp"
	"strings"
)

// A film sitting in a batch is not an episode of the season, and an automatic match has no way to
// tell that from the numbering alone. Franchise packs carry them constantly — the compilation film
// between two seasons, the sequel movie, the three theatrical cuts of the first arc — and every one
// of them is a video file with no episode number, which is precisely the shape that gets swept up
// and filed as "episode 13" of a twelve-episode season.
//
// So they are recognised by name and left out of automatic matches, exactly as OVAs and specials
// are: set aside, never deleted. A film is something somebody chose to download, and it belongs to
// its own AniList entry, which is where matching it by hand puts it.
//
// The boundaries are "not a letter or digit" rather than \b, for the same reason as the specials
// patterns: Go counts the underscore as a word character, and releases separate tokens with
// underscores constantly, so \bMovie\b never matches "Show_-_Movie_01".

// movieTokenRegex matches the standalone markers that name a film.
//
// MOVIE covers "The Movie", "Movie 2" and the bare form. GEKIJOUBAN is the romanisation of 劇場版 —
// "theatrical version" — and turns up in raw and Japanese-titled releases with every spelling of the
// long vowel, so all of them are listed. The kanji itself is matched separately below, since its
// characters are neither letters nor digits to this pattern's boundaries.
var movieTokenRegex = regexp.MustCompile(
	`(?i)(?:^|[^A-Za-z0-9])(MOVIES?|GEKIJOU-?BAN|GEKIJYOU-?BAN|GEKIJOU?BAN|GEKIJOUBAN)(?:[^A-Za-z0-9]|$)`,
)

// movieKanji is 劇場版, the marker as it appears in an untranslated release name.
const movieKanji = "劇場版"

// moviesDirNames are folder names that hold films rather than episodes. Same treatment as the
// specials folders next door: their contents are kept out of the episode numbering.
var moviesDirNames = []string{"movie", "movies", "film", "films", "gekijouban"}

// isMovieName reports whether a file names itself a film.
//
// The name is normalised the way isSpecialName normalises it — the parsed episode title and release
// group blanked out — so an episode called "Movie Night" and a group called "Movie-Raws" cannot
// trigger it. What is left is the structural part of the name, which is where a real marker lives.
//
// The anime's own title is deliberately *not* blanked: a film's marker almost always hangs off the
// title ("Some Show Movie", "Gekijouban Some Show"), so blanking it would remove the very thing
// being looked for.
func isMovieName(name string) bool {
	normalized := normalizedForTagMatching(name)
	if strings.Contains(normalized, movieKanji) {
		return true
	}
	return movieTokenRegex.MatchString(normalized)
}

// pathHasMoviesSegment reports whether any folder in the file's path marks its contents as films.
func pathHasMoviesSegment(relPath string) bool {
	segments := strings.Split(filepath.ToSlash(relPath), "/")
	// The last segment is the file itself, which isMovieName judges on its own terms.
	for i := 0; i < len(segments)-1; i++ {
		seg := strings.ToLower(strings.TrimSpace(segments[i]))
		for _, candidate := range moviesDirNames {
			if seg == candidate {
				return true
			}
		}
		if strings.Contains(seg, movieKanji) {
			return true
		}
	}
	return false
}

// isMovieContent is the question an automatic match asks of every file, alongside isSpecialContent:
// is this a film rather than an episode of the anime being matched to?
func isMovieContent(name, relPath string) bool {
	return isMovieName(name) || pathHasMoviesSegment(relPath)
}

// automaticExclusionReason names why a file is left out of an automatic match, or "" when it is an
// ordinary episode and belongs in one.
//
// Both exclusions mean the same thing — this is not an episode of the season being numbered — and
// both leave the file where it is. They are named apart only so the log says which it was, because
// "left 3 files out" and "left 3 films out" are different things to read at three in the morning.
func automaticExclusionReason(name, relPath string) string {
	if isSpecialContent(name, relPath) {
		return "special"
	}
	if isMovieContent(name, relPath) {
		return "movie"
	}
	return ""
}
