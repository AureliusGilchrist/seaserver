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

func TestLooksLikeSpecialRelease(t *testing.T) {
	cases := []struct {
		name     string
		files    int
		episodes int
		want     bool
	}{
		{"[o7] Ebiten Specials (BD 1080p x264 10-bit FLAC)", 40, 1, true},
		{"[Group] Show OVA (BD 1080p)", 0, 1, true},
		{"[Group] Show - SP01 (1080p)", 0, 1, true},
		{"[Group] Toradora! Bentou no Gokui (BD 1080p)", 3, 1, true},
		{"[Group] Show Season 1 (BD 1080p) [Dual Audio]", 26, 1, false},
		{"[Group] Show Season 1 (BD 1080p)", 0, 1, false},
		{"[Group] Spy x Family S01 (BD 1080p)", 25, 1, false},
	}
	for _, c := range cases {
		if got := looksLikeSpecialRelease(c.name, c.files, c.episodes); got != c.want {
			t.Errorf("%q files=%d eps=%d: got %v want %v", c.name, c.files, c.episodes, got, c.want)
		}
	}
}

func TestIsSpecialEntry(t *testing.T) {
	special, ova, tv := anilist.MediaFormatSpecial, anilist.MediaFormatOva, anilist.MediaFormatTv
	if !isSpecialEntry(&anilist.BaseAnime{Format: &special}) || !isSpecialEntry(&anilist.BaseAnime{Format: &ova}) {
		t.Error("specials and OVAs should count as specials")
	}
	if isSpecialEntry(&anilist.BaseAnime{Format: &tv}) || isSpecialEntry(nil) {
		t.Error("a TV series is not a special")
	}
}
