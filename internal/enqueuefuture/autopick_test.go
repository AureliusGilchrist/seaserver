package enqueuefuture

import (
	"testing"

	"seanime/internal/api/anilist"
)

func TestIsDualAudio(t *testing.T) {
	yes := []string{
		"[EMBER] Show S01 (1080p) [Dual Audio]",
		"Show.S01.1080p.Dual.Audio.BDRip",
		"Show S01 Dual-Audio",
		"Show DUALAUDIO",
	}
	no := []string{"[SubsPlease] Show - 01 (1080p)", "Show Multi-Subs", "Dual Show Audio"}
	for _, n := range yes {
		if !IsDualAudio(n) {
			t.Errorf("expected dual audio: %q", n)
		}
	}
	for _, n := range no {
		if IsDualAudio(n) {
			t.Errorf("did not expect dual audio: %q", n)
		}
	}
}

func TestIsTVShow(t *testing.T) {
	tv, movie, ona := anilist.MediaFormatTv, anilist.MediaFormatMovie, anilist.MediaFormatOna
	one, twelve := 1, 12
	cases := []struct {
		media *anilist.BaseAnime
		want  bool
	}{
		{&anilist.BaseAnime{Format: &tv, Episodes: &twelve}, true},
		{&anilist.BaseAnime{Format: &tv}, true},
		{&anilist.BaseAnime{Format: &ona, Episodes: &one}, false},
		{&anilist.BaseAnime{Format: &movie, Episodes: &one}, false},
		{nil, false},
	}
	for i, c := range cases {
		if got := isTVShow(c.media); got != c.want {
			t.Errorf("case %d: got %v want %v", i, got, c.want)
		}
	}
}
