package handlers

import "testing"

func TestIsDubTrailerFor(t *testing.T) {
	cases := []struct {
		video, show string
		want        bool
	}{
		{"Kill la Kill - Official English Dub Trailer", "Kill la Kill", true},
		{"BLEACH English Dub Trailer | Viz Media", "Bleach", true},
		{"Kill la Kill Official Trailer", "Kill la Kill", false}, // not a dub
		{"Naruto English Dub Trailer", "Kill la Kill", false},    // another show
		{"Bleach Dub Reaction Episode 1", "Bleach", false},       // not a trailer
		{"Attack on Titan Season 2 Dub Clip", "Attack on Titan", true},
	}
	for _, c := range cases {
		if got := isDubTrailerFor(c.video, c.show); got != c.want {
			t.Errorf("%q / %q: got %v", c.video, c.show, got)
		}
	}
}

func TestParseYoutubeResults(t *testing.T) {
	page := []byte(`<script>var ytInitialData = {"contents":{"x":[{"videoRenderer":{"videoId":"abcdefghijk","title":{"runs":[{"text":"Kill la Kill "},{"text":"English Dub Trailer"}]}}},{"videoRenderer":{"videoId":"bcdefghijkl","title":{"runs":[{"text":"Other"}]}}}]}};</script>`)
	res := parseYoutubeResults(page)
	if len(res) != 2 || res[0].id != "abcdefghijk" || res[0].title != "Kill la Kill English Dub Trailer" {
		t.Fatalf("got %+v", res)
	}
}

func TestIsJapaneseTrailerFor(t *testing.T) {
	cases := []struct {
		video, show string
		want        bool
	}{
		{"TVアニメ『キルラキル』PV第1弾", "キルラキル KILL la KILL", true},
		{"「BLEACH」アニメ 予告", "BLEACH", true},
		{"Kill la Kill - Official English Dub Trailer", "Kill la Kill", false},
		{"Kill la Kill PV", "Kill la Kill", true},
		{"Kill la Kill Reaction PV", "Kill la Kill", false},
		{"キルラキル 第1話 感想", "キルラキル", false}, // not a trailer
	}
	for _, c := range cases {
		if got := isJapaneseTrailerFor(c.video, c.show); got != c.want {
			t.Errorf("%q / %q: got %v", c.video, c.show, got)
		}
	}
}
