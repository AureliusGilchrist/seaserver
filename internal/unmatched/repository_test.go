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
		// --- The shapes the old parser already handled. ---
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

		// --- Hashes after the episode number. ---
		{
			name:     "crc32 hash in brackets after the episode",
			filename: "[Group] Show - 12 [1080p][A1B2C3D4].mkv",
			expected: 12,
		},
		{
			name:     "hash in parentheses after the episode",
			filename: "[SubsPlease] Show - 05 (1080p) [A1B2C3D4].mkv",
			expected: 5,
		},
		{
			name:     "bare hash token after the episode",
			filename: "[Group] Show - 05 A1B2C3D4.mkv",
			expected: 5,
		},
		{
			name:     "scene-style name with codecs and a hash",
			filename: "Show.E05.1080p.WEB-DL.AAC2.0.H.264.DEADBEEF.mkv",
			expected: 5,
		},
		{
			name:     "scene-style name with a digit-bearing hash",
			filename: "Show.S02E05.1080p.WEB-DL.x264.A1B2C3D4.mkv",
			expected: 5,
		},

		// --- Numbers everywhere, only one of them the episode. ---
		{
			name:     "year and season and resolution around the episode",
			filename: "[Group] Show 2 (2023) - 12 [1080p] [x265 10bit] [A1B2C3D4].mkv",
			expected: 12,
		},
		{
			name:     "audio channels are not the episode",
			filename: "Show - 05 [1080p][FLAC 5.1][AAC 2.0].mkv",
			expected: 5,
		},
		{
			name:     "resolution lost its p and is still not the episode",
			filename: "[Group] Show - 05 1080.mkv",
			expected: 5,
		},
		{
			name:     "dash number may itself be a resolution-sized episode",
			filename: "One Piece - 1080.mkv",
			expected: 1080,
		},
		{
			name:     "bit depth and codec noise",
			filename: "[Group] Show - 05 [Ma10p_1080p][FLACx2][10bit].mkv",
			expected: 5,
		},

		// --- Version tags. ---
		{
			name:     "version suffix on the episode",
			filename: "[Group] Show - 05v2 [720p].mkv",
			expected: 5,
		},
		{
			name:     "version as its own token",
			filename: "[Judas] Show - 11 v2 [1080p][AAC].mkv",
			expected: 11,
		},

		// --- Explicit and labelled forms. ---
		{
			name:     "sxxexx with a hash after it",
			filename: "[Group] Show S02E13 [F8A3B2C1].mkv",
			expected: 13,
		},
		{
			name:     "multi-episode sxxexx takes the first",
			filename: "Show S01E05E06.mkv",
			expected: 5,
		},
		{
			name:     "us-style 1x05",
			filename: "Show 1x05.mkv",
			expected: 5,
		},
		{
			name:     "episode word label",
			filename: "Show 2nd Season Episode 11 [1080p].mkv",
			expected: 11,
		},
		{
			name:     "ep prefix without a dash",
			filename: "[Group] Show EP24 [1080p].mkv",
			expected: 24,
		},
		{
			name:     "e prefix attached to the number",
			filename: "[Group] Show.E12.1080p.mkv",
			expected: 12,
		},
		{
			name:     "hash-prefixed numbering",
			filename: "[Group] Show - #05 [1080p].mkv",
			expected: 5,
		},
		{
			name:     "ova number",
			filename: "Show - OVA 2 [1080p].mkv",
			expected: 2,
		},
		{
			name:     "cjk episode marker",
			filename: "[Group] Show 第05话 [1080p].mkv",
			expected: 5,
		},

		// --- Ranges, separators and bracketed numbers. ---
		{
			name:     "tight range takes the first episode",
			filename: "[Group] Show - 01-02 [1080p].mkv",
			expected: 1,
		},
		{
			name:     "season-episode without letters is the episode",
			filename: "Show 2-05.mkv",
			expected: 5,
		},
		{
			name:     "bracketed number",
			filename: "Show [05].mkv",
			expected: 5,
		},
		{
			name:     "en dash separator",
			filename: "[Group] Show – 08 [1080p].mkv",
			expected: 8,
		},
		{
			name:     "trailing end marker",
			filename: "Show - 12 END.mkv",
			expected: 12,
		},
		{
			name:     "dot-separated episode",
			filename: "Show.12.1080p.mkv",
			expected: 12,
		},
		{
			name:     "large number in the title is not the episode",
			filename: "[Erai-raws] 5-toubun no Hanayome - 09 [720p][Multiple Subtitle].mkv",
			expected: 9,
		},

		// --- Nothing to read: the caller falls back to the file's position. ---
		{
			name:     "resolution only",
			filename: "[Group] Show [1080p].mkv",
			expected: 0,
		},
		{
			name:     "year only",
			filename: "Show 2023.mkv",
			expected: 0,
		},
		{
			name:     "no numbers at all",
			filename: "[Group] Show - Complete [1080p].mkv",
			expected: 0,
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
