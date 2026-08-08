package enqueuefuture

import (
	"testing"

	"seanime/internal/api/anilist"
)

func format(f anilist.MediaFormat) *anilist.MediaFormat { return &f }

func TestRejectReason(t *testing.T) {
	tests := []struct {
		name           string
		title          string
		format         *anilist.MediaFormat
		episodes       int
		notYetReleased bool
		wantRejected   bool
	}{
		// Promotional material — the entries that were filling the queue.
		{name: "PV", title: "Attack on Titan PV", format: format(anilist.MediaFormatSpecial), episodes: 1, wantRejected: true},
		{name: "CM", title: "Bleach CM", format: format(anilist.MediaFormatSpecial), episodes: 1, wantRejected: true},
		{name: "TVCM", title: "Naruto TVCM Collection", format: format(anilist.MediaFormatSpecial), episodes: 1, wantRejected: true},
		{name: "plural PVs", title: "Gundam PVs", format: format(anilist.MediaFormatSpecial), episodes: 2, wantRejected: true},
		{name: "trailer", title: "Some Movie Trailer", format: format(anilist.MediaFormatSpecial), episodes: 1, wantRejected: true},
		{name: "teaser", title: "Show Teaser", format: format(anilist.MediaFormatSpecial), episodes: 1, wantRejected: true},
		{name: "commercial", title: "Show Commercial Collection", format: format(anilist.MediaFormatSpecial), episodes: 1, wantRejected: true},
		{name: "promotional video", title: "Show Promotional Video", format: format(anilist.MediaFormatOna), episodes: 1, wantRejected: true},
		{name: "special program", title: "Show Special Program", format: format(anilist.MediaFormatSpecial), episodes: 1, wantRejected: true},
		{name: "pilot film", title: "Show Pilot Film", format: format(anilist.MediaFormatSpecial), episodes: 1, wantRejected: true},

		// Formats that are not things to download from a recommendation walk.
		{name: "music video", title: "Show Opening Theme", format: format(anilist.MediaFormatMusic), episodes: 1, wantRejected: true},
		{name: "manga", title: "Some Manga", format: format(anilist.MediaFormatManga), episodes: 0, wantRejected: true},
		{name: "novel", title: "Some Novel", format: format(anilist.MediaFormatNovel), episodes: 0, wantRejected: true},

		// No episodes and nothing out yet.
		{name: "no episodes", title: "Perfectly Normal Title", format: format(anilist.MediaFormatTv), episodes: 0, wantRejected: true},
		{name: "not yet released", title: "Upcoming Show", format: format(anilist.MediaFormatTv), episodes: 12, notYetReleased: true, wantRejected: true},

		// Real shows must survive. The two-letter tokens are the dangerous ones.
		{name: "ordinary TV", title: "Cowboy Bebop", format: format(anilist.MediaFormatTv), episodes: 26},
		{name: "movie", title: "Your Name", format: format(anilist.MediaFormatMovie), episodes: 1},
		{name: "OVA", title: "Some OVA", format: format(anilist.MediaFormatOva), episodes: 4},
		{name: "special with episodes", title: "Show Specials", format: format(anilist.MediaFormatSpecial), episodes: 6},
		{name: "PV inside a word", title: "Spverse Chronicles", format: format(anilist.MediaFormatTv), episodes: 12},
		{name: "CM inside a word", title: "CMDR Legend", format: format(anilist.MediaFormatTv), episodes: 12},
		{name: "no format given", title: "Unknown Format Show", format: nil, episodes: 13},
		// "Preview" as a token is rejected, but these near-misses must not be.
		{name: "previewing is not preview", title: "Previewing the Future", format: format(anilist.MediaFormatTv), episodes: 12},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reason := rejectReason(tt.title, tt.format, tt.episodes, tt.notYetReleased)
			if tt.wantRejected && reason == "" {
				t.Errorf("rejectReason(%q) = accepted, want rejected", tt.title)
			}
			if !tt.wantRejected && reason != "" {
				t.Errorf("rejectReason(%q) = rejected (%s), want accepted", tt.title, reason)
			}
		})
	}
}

// The purge only has a title to go on, so it must be the narrower check — an ordinary show with no
// episode count listed is not something to delete from a queue it is already in.
func TestIsJunkTitle(t *testing.T) {
	junk := []string{"Show PV", "Show CM 2", "Show Trailer", "Show Special Program"}
	for _, title := range junk {
		if !isJunkTitle(title) {
			t.Errorf("expected %q to be treated as promotional", title)
		}
	}

	keep := []string{"Cowboy Bebop", "Your Name", "", "Previewing the Future", "CMDR Legend", "Show Specials"}
	for _, title := range keep {
		if isJunkTitle(title) {
			t.Errorf("expected %q to be kept", title)
		}
	}
}
