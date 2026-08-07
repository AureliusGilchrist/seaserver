package unmatched

import (
	"path/filepath"
	"strings"
)

// A download and the record of what it is are joined by one thing: the staging directory. The
// torrent client is told to save into UnmatchedBasePath/<sanitized torrent name>, and the sidecar
// naming that anime is written into the same directory.
//
// Going back the other way — from a torrent the client is reporting to the directory it belongs
// to — used to be done by name alone, which only works while the client's idea of the torrent's
// name matches the name the search result had. It often doesn't: the client takes the name from
// the torrent's own metadata, while the directory was created from the release title in the
// search result. Where the client is *writing* is not a guess, so that is tried first.

// StagingDirName returns the staging directory a path belongs to — the first segment below the
// Unmatched base. Reports false for paths outside the staging area, and for the base itself.
func StagingDirName(path string) (string, bool) {
	if path == "" {
		return "", false
	}

	base, err := filepath.Abs(UnmatchedBasePath)
	if err != nil {
		return "", false
	}
	target, err := filepath.Abs(path)
	if err != nil {
		return "", false
	}

	rel, err := filepath.Rel(base, target)
	if err != nil {
		return "", false
	}
	if rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}

	// The first segment is the torrent's own directory; anything deeper is its contents.
	segments := strings.Split(filepath.ToSlash(rel), "/")
	if len(segments) == 0 || segments[0] == "" {
		return "", false
	}
	return segments[0], true
}

// StagingDirForTorrent resolves the staging directory of a torrent the client is reporting, using
// the path it is writing to and falling back to its name.
//
// savePath is whatever the client reports — a save path, a content path, or nothing at all.
func StagingDirForTorrent(name, savePath string) (string, bool) {
	if dir, ok := StagingDirName(savePath); ok {
		return dir, true
	}
	if name == "" {
		return "", false
	}
	return sanitizeNamePreserveWhitespace(name), true
}

// IsVideoFileName reports whether a filename is one of the video types a match moves.
func IsVideoFileName(name string) bool { return isVideoFile(name) }

// IsTempFileName reports whether a filename is one a torrent client uses for a file it is still
// writing. Absence of these proves nothing — see the Scanner type comment — but their presence is
// conclusive.
func IsTempFileName(name string) bool { return isTempFileName(name) }

// MetadataForTorrent loads what is known about a torrent the client is reporting. Resolves it by
// save path first, so a client whose name for the torrent differs from the release title the
// download was started from still finds its anime.
func (r *Repository) MetadataForTorrent(name, savePath string) *TorrentMetadata {
	if dir, ok := StagingDirName(savePath); ok {
		if metadata := r.GetTorrentMetadata(dir); metadata != nil {
			return metadata
		}
	}
	if name == "" {
		return nil
	}
	return r.GetTorrentMetadata(name)
}
