package unmatched

import (
	"fmt"
	"path/filepath"
	"strings"
)

// LibraryDestination returns the folder and file name a match files one episode of an anime under:
// <Library>/<Title>/<Title> - Episode 005 - <Episode title><ext>, or <Title><ext> for a movie —
// the same rule MatchAndMoveFiles applies, so anything else that adds episodes to the library
// (online stream downloads) lands in the same folder under the same name as a matched download.
//
// title is the clean title a match would be given (the romaji title). format is the AniList format
// and is only consulted when Animap does not know the anime's type.
func (r *Repository) LibraryDestination(animeID int, title string, episode int, episodes int, format string, startYear int, ext string) (dir string, name string) {
	cleanTitle := sanitizeNamePreserveWhitespace(title)
	dir = filepath.Join(r.getAnimeBasePath(), cleanTitle)

	var episodeTitle string
	formatUpper := strings.ToUpper(format)
	if animeID > 0 {
		if meta, err := r.fetchAnimeMetadata(animeID); err == nil && meta != nil {
			if meta.Type != "" {
				formatUpper = strings.ToUpper(meta.Type)
			}
			if len(meta.Episodes) > episodes {
				episodes = len(meta.Episodes)
			}
			episodeTitle = episodeTitleFrom(meta, episode)
		} else if err != nil {
			r.logger.Warn().Err(err).Int("animeId", animeID).
				Msg("unmatched: Could not fetch Animap metadata for the episode title")
		}
	}

	// A movie file has no episode number, so only an anime of a single episode gets one: a
	// cinema-released series (Zoku Owarimonogatari, 6 episodes) would put every episode under the
	// same name.
	if formatUpper == "MOVIE" && episodes <= 1 && episode <= 1 {
		return dir, movieFileName(dir, cleanTitle, startYear, ext)
	}

	baseName := fmt.Sprintf("%s - Episode %03d", cleanTitle, episode)
	if episodeTitle != "" {
		baseName = fmt.Sprintf("%s - Episode %03d - %s", cleanTitle, episode, episodeTitle)
	}
	return dir, sanitizeNamePreserveWhitespace(baseName) + ext
}
