package unmatched

import (
	"path/filepath"
	"sort"
	"testing"
)

// files builds the video-file list for a download from a set of relative paths.
func files(relPaths ...string) []*UnmatchedFile {
	out := make([]*UnmatchedFile, 0, len(relPaths))
	for _, rel := range relPaths {
		out = append(out, &UnmatchedFile{
			Name:         filepath.Base(rel),
			RelativePath: filepath.FromSlash(rel),
			IsVideo:      true,
		})
	}
	return out
}

func selectedPaths(sel seasonOneSelection) []string {
	out := make([]string, 0, len(sel.files))
	for _, f := range sel.files {
		out = append(out, filepath.ToSlash(f.RelativePath))
	}
	sort.Strings(out)
	return out
}

func TestSeasonOneSelection(t *testing.T) {
	tests := []struct {
		name  string
		files []*UnmatchedFile
		want  []string
		found bool
	}{
		{
			name:  "a flat download is one season, so everything is matched",
			files: files("ep01.mkv", "ep02.mkv", "ep03.mkv"),
			want:  []string{"ep01.mkv", "ep02.mkv", "ep03.mkv"},
			found: true,
		},
		{
			// The whole point of the "unless it's Extra or Specials" rule: a specials folder is not
			// structure, so this is still a flat download and everything outside it is matched.
			name:  "specials and extras folders do not make it a structured download",
			files: files("ep01.mkv", "ep02.mkv", "Specials/sp01.mkv", "Extra/NCOP.mkv", "OVA/ova01.mkv"),
			want:  []string{"ep01.mkv", "ep02.mkv"},
			found: true,
		},
		{
			// Torrent clients save the torrent's own root folder inside the destination, so nearly
			// every batch has one. Treating it as season structure would mean nothing ever matched.
			name:  "a single wrapper folder is descended into, not read as a season",
			files: files("Some Show [1080p]/ep01.mkv", "Some Show [1080p]/ep02.mkv"),
			want:  []string{"Some Show [1080p]/ep01.mkv", "Some Show [1080p]/ep02.mkv"},
			found: true,
		},
		{
			name:  "wrapper folder with specials beside the episodes",
			files: files("Some Show/ep01.mkv", "Some Show/Specials/sp01.mkv"),
			want:  []string{"Some Show/ep01.mkv"},
			found: true,
		},
		{
			name: "season folders: only season 1 is matched",
			files: files(
				"Season 1/ep01.mkv", "Season 1/ep02.mkv",
				"Season 2/ep01.mkv", "Season 3/ep01.mkv",
			),
			want:  []string{"Season 1/ep01.mkv", "Season 1/ep02.mkv"},
			found: true,
		},
		{
			name: "season folders inside a wrapper are still found",
			files: files(
				"Some Show Complete/S01/ep01.mkv",
				"Some Show Complete/S02/ep01.mkv",
			),
			want:  []string{"Some Show Complete/S01/ep01.mkv"},
			found: true,
		},
		{
			// Nothing here says which folder is season 1, and guessing is exactly what the toggle
			// exists to prevent. The download waits for a person.
			name:  "folders but no season 1 means nothing is matched",
			files: files("Part A/ep01.mkv", "Part B/ep01.mkv"),
			found: false,
		},
		{
			name:  "season folders with no season 1 among them",
			files: files("Season 2/ep01.mkv", "Season 3/ep01.mkv"),
			found: false,
		},
		{
			// Episodes beside a folder mean the layout is something other than a wrapper, so it is
			// not descended into — and with no season 1 folder, there is nothing to match.
			name:  "a folder beside loose episodes is not a wrapper",
			files: files("ep01.mkv", "Bonus Disc/thing.mkv"),
			found: false,
		},
		{
			name:  "nothing but specials leaves nothing to match",
			files: files("Specials/sp01.mkv", "Extra/NCOP.mkv"),
			found: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := selectSeasonOneFiles(tt.files)
			if got.found != tt.found {
				t.Fatalf("found = %v, want %v (reason: %s)", got.found, tt.found, got.reason)
			}
			if !tt.found {
				return
			}
			paths := selectedPaths(got)
			if len(paths) != len(tt.want) {
				t.Fatalf("got %v, want %v", paths, tt.want)
			}
			for i := range paths {
				if paths[i] != tt.want[i] {
					t.Fatalf("got %v, want %v", paths, tt.want)
				}
			}
		})
	}
}

// Non-video files are not structure either — a stray sample or a folder of artwork must not turn a
// flat download into one the selection refuses to read.
func TestSeasonOneSelectionIgnoresNonVideo(t *testing.T) {
	fs := files("ep01.mkv")
	fs = append(fs, &UnmatchedFile{Name: "cover.jpg", RelativePath: filepath.FromSlash("Artwork/cover.jpg")})

	got := selectSeasonOneFiles(fs)
	if !got.found || len(got.files) != 1 {
		t.Fatalf("got %d files (found=%v, reason=%s), want just the episode", len(got.files), got.found, got.reason)
	}
}

// A Movies folder is no more season structure than a Specials one.
func TestSeasonOneSelectionIgnoresMovieFolders(t *testing.T) {
	got := selectSeasonOneFiles(files("ep01.mkv", "ep02.mkv", "Movies/Some Show Movie.mkv"))
	if !got.found || len(got.files) != 2 {
		t.Fatalf("got %d files (found=%v, reason=%s), want the two episodes", len(got.files), got.found, got.reason)
	}
}
