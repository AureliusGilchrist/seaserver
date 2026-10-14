package onlinestream_providers

import (
	"testing"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

func TestAnimeHeavenPrefersSourceForRequestedEpisode(t *testing.T) {
	const episodeID = "f47167b164de1bb884b773db04d49fbc"
	sources := []*hibikeonlinestream.VideoSource{
		{URL: "https://ax.animeheaven.me/video.mp4?fallback&token-a"},
		{URL: "https://ci.animeheaven.me/video.mp4?" + episodeID + "&token-b"},
	}

	sortAnimeHeavenSources(sources, episodeID)

	if sources[0].URL != "https://ci.animeheaven.me/video.mp4?"+episodeID+"&token-b" {
		t.Fatalf("expected episode-specific source first, got %s", sources[0].URL)
	}
}
