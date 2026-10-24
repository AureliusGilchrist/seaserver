package torrent

import (
	"net/http"
	"net/http/httptest"
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
			got := CountTorrentContents(tt.info)
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
		if got := TorrentContentsKey("  ABCDEF  ", "https://example.test/x.torrent"); got != "abcdef" {
			t.Errorf("got %q, want %q", got, "abcdef")
		}
	})

	t.Run("the download URL stands in when there is no hash", func(t *testing.T) {
		if got := TorrentContentsKey("", " https://example.test/x.torrent "); got != "https://example.test/x.torrent" {
			t.Errorf("got %q", got)
		}
	})

	// Nothing to identify it by: the caller skips these rather than caching under an empty key,
	// which would make every unidentifiable torrent share one answer.
	t.Run("nothing to go on", func(t *testing.T) {
		if got := TorrentContentsKey("  ", ""); got != "" {
			t.Errorf("got %q, want empty", got)
		}
	})
}

// The list's API is faked on a local server so the decode and its quirks are tested without
// touching the network: redacted and empty hashes are skipped, a repeated release keeps the
// first record, and anything other than a 200 is an error rather than a silent empty answer.
func TestFetchSeaDexContents(t *testing.T) {
	const listPayload = `{
		"items": [
			{
				"expand": {
					"trs": [
						{ "infoHash": "ABCDEF1234567890ABCDEF1234567890ABCDEF12", "files": [{"name": "a.mkv"}, {"name": "b.mkv"}, {"name": "c.mkv"}] },
						{ "infoHash": "<redacted>", "files": [{"name": "x.mkv"}] },
						{ "infoHash": "", "files": [{"name": "y.mkv"}] },
						{ "infoHash": "abcdef1234567890abcdef1234567890abcdef12", "files": [{"name": "late.mkv"}] }
					]
				}
			},
			{
				"expand": {
					"trs": [
						{ "infoHash": "1111111111111111111111111111111111111111", "files": [
							"Show/Season 1/ep01.mkv",
							"Show/Season 1/ep02.mkv",
							"Show\\Season 2\\ep01.mkv",
							"readme.txt"
						] },
						{ "infoHash": "2222222222222222222222222222222222222222", "files": [
							{"path": "Pack/Specials/ova.mkv"},
							{"path": ["Pack", "Menus", "menu.mp4"]}
						] },
						{ "infoHash": "3333333333333333333333333333333333333333", "files": [
							{"url": "https://example.test/unreadable", "size": 1}
						] }
					]
				}
			}
		]
	}`

	original := seaDexContentsEndpoint
	defer func() { seaDexContentsEndpoint = original }()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("filter") {
		case `alID="1"`:
			w.Write([]byte(listPayload))
		case `alID="2"`:
			w.Write([]byte(`{"items": []}`))
		case `alID="3"`:
			w.WriteHeader(http.StatusServiceUnavailable)
		case `alID="4"`:
			w.Write([]byte(`not json`))
		case `alID="20"`:
			w.Write([]byte(listPayload))
		default:
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer server.Close()

	seaDexContentsEndpoint = server.URL + "/api/collections/entries/records"

	counts, err := fetchSeaDexContents(1)
	if err != nil {
		t.Fatalf("fetchSeaDexContents(1) returned error: %v", err)
	}
	if len(counts) != 4 {
		t.Fatalf("expected 4 usable releases, got %d", len(counts))
	}
	got, ok := counts["abcdef1234567890abcdef1234567890abcdef12"]
	if !ok {
		t.Fatalf("release keyed by lowercased hash missing from answer: %v", counts)
	}
	if got.Files != 3 {
		t.Errorf("expected 3 files counted, got %d", got.Files)
	}

	// File paths count their folders, deduplicated, whatever separator they were written with.
	counts, err = fetchSeaDexContents(20)
	if err != nil {
		t.Fatalf("fetchSeaDexContents(20) returned error: %v", err)
	}
	if got, ok := counts["1111111111111111111111111111111111111111"]; !ok {
		t.Errorf("string-path release missing from answer: %v", counts)
	} else {
		if got.Files != 4 {
			t.Errorf("string-path release: files = %d, want 4", got.Files)
		}
		// Show, Show/Season 1, Show/Season 2
		if got.Folders != 3 {
			t.Errorf("string-path release: folders = %d, want 3", got.Folders)
		}
	}
	if got, ok := counts["2222222222222222222222222222222222222222"]; !ok {
		t.Errorf("object-path release missing from answer: %v", counts)
	} else {
		if got.Files != 2 {
			t.Errorf("object-path release: files = %d, want 2", got.Files)
		}
		// Pack, Pack/Specials, Pack/Menus
		if got.Folders != 3 {
			t.Errorf("object-path release: folders = %d, want 3", got.Folders)
		}
	}
	// An entry shape nothing can read still counts as a file, since the list recorded one.
	if got, ok := counts["3333333333333333333333333333333333333333"]; !ok {
		t.Errorf("unreadable-entry release missing from answer: %v", counts)
	} else {
		if got.Files != 1 {
			t.Errorf("unreadable-entry release: files = %d, want 1", got.Files)
		}
		if got.Folders != 0 {
			t.Errorf("unreadable-entry release: folders = %d, want 0", got.Folders)
		}
	}

	counts, err = fetchSeaDexContents(2)
	if err != nil {
		t.Fatalf("fetchSeaDexContents(2) returned error: %v", err)
	}
	if len(counts) != 0 {
		t.Errorf("expected an empty answer for an unlisted anime, got %v", counts)
	}

	if _, err = fetchSeaDexContents(3); err == nil {
		t.Error("expected an error for a non-200 answer, got nil")
	}
	if _, err = fetchSeaDexContents(4); err == nil {
		t.Error("expected an error for a malformed answer, got nil")
	}
}
