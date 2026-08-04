package scanner

import (
	"path/filepath"
	"seanime/internal/library/anime"
	"seanime/internal/unmatched"

	"github.com/rs/zerolog"
)

// sidecarLookupDepth is how many parent directories are searched for the sidecar, starting at
// the file's own folder. A downloaded torrent lands as `<anime>/[Season]/episode.mkv` at worst,
// so three levels covers it without wandering up into the library root.
const sidecarLookupDepth = 3

// MatchLocalFilesFromSidecars matches files the title comparison couldn't place by reading the
// `.seanime-metadata.json` sidecar written when the download was started.
//
// Those files are not really unknown: whatever queued the download recorded the anime, and the
// sidecar travels with the files into the library. Falling back to it means a torrent whose
// release name doesn't resemble any AniList title is matched anyway, instead of being handed
// back to the user to sort out by hand.
//
// Returns the number of files matched this way.
func MatchLocalFilesFromSidecars(localFiles []*anime.LocalFile, logger *zerolog.Logger, scanLogger *ScanLogger) int {
	// One sidecar covers every file in a folder — read each folder at most once.
	cache := make(map[string]int)

	lookup := func(dir string) int {
		if id, ok := cache[dir]; ok {
			return id
		}

		mediaId := 0
		current := dir
		for i := 0; i < sidecarLookupDepth; i++ {
			if id, ok := unmatched.AnimeIDFromSidecar(current); ok {
				mediaId = id
				break
			}
			parent := filepath.Dir(current)
			if parent == current {
				break
			}
			current = parent
		}

		cache[dir] = mediaId
		return mediaId
	}

	matched := 0
	for _, lf := range localFiles {
		if lf == nil || lf.MediaId != 0 || lf.Ignored {
			continue
		}

		mediaId := lookup(filepath.Dir(lf.Path))
		if mediaId == 0 {
			continue
		}

		lf.MediaId = mediaId
		matched++

		if scanLogger != nil {
			scanLogger.LogMatcher(zerolog.DebugLevel).
				Str("filename", lf.Name).
				Int("mediaId", mediaId).
				Msg("Matched from metadata sidecar")
		}
	}

	if matched > 0 && logger != nil {
		logger.Info().Int("count", matched).Msg("scanner: Matched local files from metadata sidecars")
	}

	return matched
}
