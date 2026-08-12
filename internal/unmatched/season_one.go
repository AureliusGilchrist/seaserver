package unmatched

import (
	"path/filepath"
	"strings"
)

// A batch is very often not one season. Franchise packs, "complete series" releases and anything a
// tracker files under the parent entry arrive as a folder per season, and an automatic match walks
// all of it: every file is selected, sorted, and numbered end to end, so season 2 episode 1 becomes
// episode 13 of season 1 and the library quietly acquires a season that does not exist.
//
// "Match Season 1 automatically" is the narrow answer to that. It does not try to work out which
// season each file belongs to and file them separately — that is the manual match's job, with a
// person looking at it. It answers one question: which files in this download are season 1, and is
// that answer obvious enough to act on without asking?
//
// The rules, in the order they are applied:
//
//   - Folders that only ever hold non-episode content — Extras, Specials, OVA, Bonus, Movies and the
//     rest of specialsDirNames and moviesDirNames — are set aside first and never count as
//     structure. A download whose only subfolder is "Specials" is a flat download with a Specials
//     folder in it, which is exactly how a person reads it.
//   - A single wrapper folder holding everything is descended into rather than treated as a season.
//     Torrent clients save a torrent's own root folder inside the destination, so almost every batch
//     has one, and calling it "a folder, therefore seasons" would mean nothing ever matched.
//   - No folders left: the download is one season's worth of files, and everything outside the
//     specials folders is matched.
//   - Folders left: only the one that names itself season 1 is matched. If none does, nothing is —
//     the download is structured in some way this cannot read, and guessing is what the toggle
//     exists to stop.

// seasonOneSelection is what the rules above concluded about a download.
type seasonOneSelection struct {
	// files are the video files to match, relative paths as they appear on the torrent.
	files []*UnmatchedFile
	// found is false when the download has season folders but none of them is season 1. The caller
	// must not fall back to matching everything: that is the very thing being prevented.
	found bool
	// reason describes the shape that was recognised, for the log line.
	reason string
}

// selectSeasonOneFiles narrows a download's video files to the ones that are season 1.
func selectSeasonOneFiles(files []*UnmatchedFile) seasonOneSelection {
	// Only ever the video files; sample clips and stray artwork are not structure either.
	candidates := make([]*UnmatchedFile, 0, len(files))
	for _, f := range files {
		if f == nil || !f.IsVideo {
			continue
		}
		// Specials, extras and movie folders are set aside wholesale. Files that merely *look* like
		// specials or films by name are left in — automaticExclusionReason judges those later,
		// during the match, and doing it twice would only disagree with itself.
		if pathHasSpecialsSegment(f.RelativePath) || pathHasExtraSegment(f.RelativePath) || pathHasMoviesSegment(f.RelativePath) {
			continue
		}
		candidates = append(candidates, f)
	}

	if len(candidates) == 0 {
		return seasonOneSelection{found: false, reason: "no episode files outside the specials folders"}
	}

	// Descend through wrapper folders: one folder holding everything, named for the release rather
	// than for a season.
	depth := 0
	for {
		folders := topLevelFolders(candidates, depth)
		if len(folders) == 0 {
			// Flat from here down. Everything left is the season.
			return seasonOneSelection{files: candidates, found: true, reason: "no season folders"}
		}

		if len(folders) == 1 && !folders[0].isSeason && !anyFileAtDepth(candidates, depth) {
			depth++
			continue
		}

		for _, folder := range folders {
			if folder.season == 1 {
				return seasonOneSelection{
					files:  folder.files,
					found:  true,
					reason: "matched the season 1 folder (" + folder.name + ")",
				}
			}
		}

		return seasonOneSelection{
			found:  false,
			reason: "this download has season folders but none of them is season 1",
		}
	}
}

// folderAtDepth is one directory sitting at a given depth in the download, with everything beneath it.
type folderAtDepth struct {
	name     string
	season   int
	isSeason bool
	files    []*UnmatchedFile
}

// topLevelFolders groups files by the directory segment at the given depth. Files that *are* at that
// depth — no further directory beneath — belong to no folder and are not returned here.
func topLevelFolders(files []*UnmatchedFile, depth int) []folderAtDepth {
	order := make([]string, 0)
	byName := make(map[string]*folderAtDepth)

	for _, f := range files {
		segments := pathSegments(f.RelativePath)
		// Needs a directory at this depth and a file below it.
		if len(segments) <= depth+1 {
			continue
		}
		name := segments[depth]
		folder, ok := byName[name]
		if !ok {
			season := extractSeasonNumber(name)
			folder = &folderAtDepth{name: name, season: season, isSeason: season > 0}
			byName[name] = folder
			order = append(order, name)
		}
		folder.files = append(folder.files, f)
	}

	out := make([]folderAtDepth, 0, len(order))
	for _, name := range order {
		out = append(out, *byName[name])
	}
	return out
}

// anyFileAtDepth reports whether any file sits directly at this depth rather than inside a folder at
// it. A wrapper folder is only a wrapper when it holds everything — episodes beside it mean the
// layout is something else, and something else is not descended into.
func anyFileAtDepth(files []*UnmatchedFile, depth int) bool {
	for _, f := range files {
		if len(pathSegments(f.RelativePath)) == depth+1 {
			return true
		}
	}
	return false
}

func pathSegments(relPath string) []string {
	cleaned := strings.Trim(filepath.ToSlash(relPath), "/")
	if cleaned == "" {
		return nil
	}
	return strings.Split(cleaned, "/")
}
