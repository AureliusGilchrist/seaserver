package unmatched

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractEpisodeNumber(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		expected int
	}{
		{
			name:     "dash separated episode",
			filename: "[SubsPlease] Cowboy Bebop - 02 [1080p][HEVC].mkv",
			expected: 2,
		},
		{
			name:     "title with series number",
			filename: "[SubsPlease] 86 EIGHTY-SIX - 03 [1080p].mkv",
			expected: 3,
		},
		{
			name:     "title with large number in series name",
			filename: "[Group] The 100 Girlfriends Who Really, Really, Really, Really, Really Love You - 07 [1080p].mkv",
			expected: 7,
		},
		{
			name:     "explicit sxxexx wins",
			filename: "Kakegurui - S01E01 - The Woman Called Yumeko Jabami.mkv",
			expected: 1,
		},
		{
			name:     "season text ignored for generic match",
			filename: "[Group] Show Season 2 - 05 [1080p].mkv",
			expected: 5,
		},
		{
			name:     "ordinal season text ignored for generic match",
			filename: "[Group] Show 2nd Season - 06 [1080p].mkv",
			expected: 6,
		},
		{
			name:     "trailing number fallback",
			filename: "Show 03.mkv",
			expected: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := extractEpisodeNumber(tt.filename); got != tt.expected {
				t.Fatalf("extractEpisodeNumber(%q) = %d, want %d", tt.filename, got, tt.expected)
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

	// Only the exact legacy spelling counts — a different year is a different film.
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
