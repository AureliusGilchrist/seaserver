package handlers

import (
	"testing"

	"github.com/anacrolix/torrent/metainfo"
)

func TestCountTorrentContents(t *testing.T) {
	file := func(parts ...string) metainfo.FileInfo {
		return metainfo.FileInfo{Path: parts}
	}

	tests := []struct {
		name        string
		info        metainfo.Info
		wantFiles   int
		wantFolders int
	}{
		{
			// A single-file torrent has no Files list at all — the name *is* the file.
			name:        "a single file",
			info:        metainfo.Info{Name: "Some Movie.mkv"},
			wantFiles:   1,
			wantFolders: 0,
		},
		{
			// Paths are relative to the torrent's own folder, which is a folder the download creates
			// and so is counted.
			name: "flat season pack",
			info: metainfo.Info{
				Name:  "Some Show S01",
				Files: []metainfo.FileInfo{file("ep01.mkv"), file("ep02.mkv"), file("ep03.mkv")},
			},
			wantFiles:   3,
			wantFolders: 1,
		},
		{
			// Two seasons under the root: the root plus one folder each, and not one per file.
			name: "nested seasons",
			info: metainfo.Info{
				Name: "Some Show",
				Files: []metainfo.FileInfo{
					file("Season 1", "ep01.mkv"),
					file("Season 1", "ep02.mkv"),
					file("Season 2", "ep01.mkv"),
				},
			},
			wantFiles:   3,
			wantFolders: 3,
		},
		{
			// Every level counts, deduplicated across files that share a path.
			name: "deeply nested",
			info: metainfo.Info{
				Name: "Some Show",
				Files: []metainfo.FileInfo{
					file("Season 1", "Subs", "eng", "ep01.ass"),
					file("Season 1", "Subs", "eng", "ep02.ass"),
					file("Season 1", "ep01.mkv"),
				},
			},
			wantFiles: 3,
			// root + Season 1 + Season 1/Subs + Season 1/Subs/eng
			wantFolders: 4,
		},
		{
			// A multi-file torrent with everything at the root still creates its own folder.
			name: "extras beside the episodes",
			info: metainfo.Info{
				Name:  "Some Show",
				Files: []metainfo.FileInfo{file("ep01.mkv"), file("readme.nfo")},
			},
			wantFiles:   2,
			wantFolders: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := countTorrentContents(tt.info)
			if got.Files != tt.wantFiles {
				t.Errorf("files = %d, want %d", got.Files, tt.wantFiles)
			}
			if got.Folders != tt.wantFolders {
				t.Errorf("folders = %d, want %d", got.Folders, tt.wantFolders)
			}
		})
	}
}

func TestTorrentContentsKey(t *testing.T) {
	t.Run("the info hash names the contents, case aside", func(t *testing.T) {
		if got := torrentContentsKey("  ABCDEF  ", "https://example.test/x.torrent"); got != "abcdef" {
			t.Errorf("got %q, want %q", got, "abcdef")
		}
	})

	t.Run("the download URL stands in when there is no hash", func(t *testing.T) {
		if got := torrentContentsKey("", " https://example.test/x.torrent "); got != "https://example.test/x.torrent" {
			t.Errorf("got %q", got)
		}
	})

	// Nothing to identify it by: the caller skips these rather than caching under an empty key,
	// which would make every unidentifiable torrent share one answer.
	t.Run("nothing to go on", func(t *testing.T) {
		if got := torrentContentsKey("  ", ""); got != "" {
			t.Errorf("got %q, want empty", got)
		}
	})
}
