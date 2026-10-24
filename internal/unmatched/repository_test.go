package unmatched

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// episodeNumberCase mirrors one entry of testdata/episode_number_cases.json.
type episodeNumberCase struct {
	Name     string `json:"name"`
	Filename string `json:"filename"`
	Expected int    `json:"expected"`
}

// loadEpisodeNumberCases reads the shared fixture. It is shared with the TypeScript copy of
// extractEpisodeNumber in the web match modal â€” when a pattern needs fixing, fix it there too
// and add the shape here so both implementations are pinned to the same behaviour.
func loadEpisodeNumberCases(t *testing.T) []episodeNumberCase {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "episode_number_cases.json"))
	if err != nil {
		t.Fatalf("failed to read episode number cases: %v", err)
	}
	// Some editors save JSON with a byte-order mark; the decoder refuses it.
	data = []byte(strings.TrimPrefix(string(data), "\xef\xbb\xbf"))
	var cases []episodeNumberCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatalf("failed to parse episode number cases: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("episode number cases fixture is empty")
	}
	return cases
}

func TestExtractEpisodeNumber(t *testing.T) {
	for _, tt := range loadEpisodeNumberCases(t) {
		tt := tt
		t.Run(tt.Name, func(t *testing.T) {
			if got := extractEpisodeNumber(tt.Filename); got != tt.Expected {
				t.Fatalf("extractEpisodeNumber(%q) = %d, want %d", tt.Filename, got, tt.Expected)
			}
		})
	}
}

// A movie is filed under its title alone, except where the older naming is already on disk.
func TestMovieFileName(t *testing.T) {
	t.Run("the title and nothing else", func(t *testing.T) {
		got := movieFileName(t.TempDir(), "The Wind Rises", 2013, ".mkv")
		if got != "The Wind Rises.mkv" {
			t.Errorf("got %q, want %q", got, "The Wind Rises.mkv")
		}
	})

	t.Run("no year to drop", func(t *testing.T) {
		got := movieFileName(t.TempDir(), "The Wind Rises", 0, ".mkv")
		if got != "The Wind Rises.mkv" {
			t.Errorf("got %q, want %q", got, "The Wind Rises.mkv")
		}
	})

	// The backwards-compatible case: a movie already filed the old way keeps its name, so matching
	// it again replaces that file rather than putting a second copy beside it.
	t.Run("an existing legacy name wins", func(t *testing.T) {
		dir := t.TempDir()
		legacy := filepath.Join(dir, "The Wind Rises (2013).mkv")
		if err := os.WriteFile(legacy, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		got := movieFileName(dir, "The Wind Rises", 2013, ".mkv")
		if got != "The Wind Rises (2013).mkv" {
			t.Errorf("got %q, want the existing %q", got, "The Wind Rises (2013).mkv")
		}
	})

	// Only the exact legacy spelling counts â€” a different year is a different film.
	t.Run("another film's file is not mistaken for it", func(t *testing.T) {
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "The Wind Rises (1999).mkv"), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		got := movieFileName(dir, "The Wind Rises", 2013, ".mkv")
		if got != "The Wind Rises.mkv" {
			t.Errorf("got %q, want %q", got, "The Wind Rises.mkv")
		}
	})
}
