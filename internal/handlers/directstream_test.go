package handlers

import (
	"reflect"
	"testing"
)

func TestDirectstreamSubtitleRefererCandidatesPreserveProviderRefererOrder(t *testing.T) {
	got := directstreamSubtitleRefererCandidates(
		map[string]string{
			"Origin":  "https://krussdomi.com",
			"Referer": "https://krussdomi.com/",
		},
		"https://subs.example/subtitle.vtt",
	)

	want := []string{
		"https://krussdomi.com/",
		"https://krussdomi.com",
		"",
		"https://subs.example/",
		"https://kickassanime.mx/",
		"https://kaa.mx/",
		"https://animetsu.net/",
		"https://megacloud.club/",
		"https://megacloud.tv/",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected referer candidates:\n got: %#v\nwant: %#v", got, want)
	}
}
