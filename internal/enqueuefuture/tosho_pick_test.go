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
