package unmatched

import "testing"

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