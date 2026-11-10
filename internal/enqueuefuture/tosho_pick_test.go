package enqueuefuture

import "testing"

func TestCleanReleaseTitle(t *testing.T) {
	for name, want := range map[string]string{
		"[Erai-raws] Slam Dunk (1993) - 01 ~ 101 [1080p][Multiple Subtitle]": "slam dunk",
		"[DB] Blood+ [Dual Audio 10bit 720p][HEVC-x265]":                     "blood",
		"Mushishi.S01.1080p.BluRay.FLAC.x264-GROUP":                          "mushishi",
		"[Judas] Texhnolyze (Batch) [BD 1080p][HEVC x265 10bit]":             "texhnolyze",
	} {
		if got := cleanReleaseTitle(name); got != want {
			t.Errorf("%q: got %q, want %q", name, got, want)
		}
	}
}

func TestTitleScore(t *testing.T) {
	titles := []string{"Slam Dunk", "SLAM DUNK"}
	if s := titleScore(cleanReleaseTitle("[Erai-raws] Slam Dunk - 01 ~ 101 [1080p]"), titles); s < toshoMinTitleScore {
		t.Fatalf("the right series scored %.2f", s)
	}
	if s := titleScore(cleanReleaseTitle("[SubsPlease] The First Slam Dunk (2022) [1080p]"), titles); s >= toshoMinTitleScore {
		t.Fatalf("the film scored %.2f against the series", s)
	}
	if s := titleScore(cleanReleaseTitle("[Group] Dunk Masters - 01 [720p]"), titles); s >= toshoMinTitleScore {
		t.Fatalf("another title scored %.2f", s)
	}
}

func TestEpisodesFit(t *testing.T) {
	for _, c := range []struct {
		files, episodes int
		show, want      bool
	}{
		{101, 101, true, true},
		{110, 101, true, true}, // more is fine
		{95, 101, true, true},  // a few short (specials, recap) is allowed
		{12, 101, true, false},
		{1, 12, true, false},
		{1, 1, false, true},
	} {
		if got := episodesFit(c.files, c.episodes, c.show); got != c.want {
			t.Errorf("%d files for %d episodes: got %v", c.files, c.episodes, got)
		}
	}
}

func TestEnglishDualAudio(t *testing.T) {
	for name, want := range map[string]bool{
		"Slam Dunk [AV1 1080p][Dual Audio Jap-Esp][MultiSubs ENG-SPA-VOSTFR] (Batch)":        false,
		"Slam Dunk 1080P HEVC 10 BIT Dual Audio BDRIP Bluury":                                true,
		"[Cleo] Texhnolyze [Dual Audio DVD480p][HEVC-x265]":                                  true,
		"[a4e] Texhnolyze dual audio[english,japanese]":                                      true,
		"[Erai-raws] Slam Dunk - 001 ~ 101 [1080p][BATCH][Multiple Subtitle]":                false,
		"Mobile Suit Z Gundam (BDRip 1492x1080p x265 HEVC FLACx2 2.0x2)(Dual Audio)[sxales]": true,
	} {
		if got := englishDualAudio(name); got != want {
			t.Errorf("%q: got %v, want %v", name, got, want)
		}
	}
}

func TestNamedPartial(t *testing.T) {
	for name, want := range map[string]bool{
		"[Obscurerips] Slam Dunk Episode 1-20 (DVDrip) [Dual Audio (Geneon dub)]": true,
		"[Erai-raws] Slam Dunk - 001 ~ 101 [1080p][BATCH]":                        false,
		"[eldon] Slam Dunk Seasons 1-4 (CR WEB-DL 1080p x264 AAC)":                false,
		"[BBT-RMX] Slam Dunk [BDRip 1440x1080 x264 Hi10P FLAC]":                   false,
		"Corrector Yui (1999) - S02 [Bluray-1080p]":                               false,
	} {
		if got := namedPartial(name, 101); got != want {
			t.Errorf("%q: got %v, want %v", name, got, want)
		}
	}
}

func TestReleaseResolution(t *testing.T) {
	for name, want := range map[string]int{
		"[Cleo] Texhnolyze [Dual Audio DVD480p]":      480,
		"Texhnolyze | Dual Audio | 10bit HEVC | 720p": 720,
		"[BBT-RMX] Slam Dunk [BDRip 1440x1080 x264]":  1080,
		"[Pariah] Texhnolyze (R2J DVDRip x264 FLAC)":  0,
	} {
		if got := releaseResolution(name); got != want {
			t.Errorf("%q: got %d, want %d", name, got, want)
		}
	}
}
