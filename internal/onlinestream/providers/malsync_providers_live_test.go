package onlinestream_providers

import (
	"testing"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

// TestMalsyncProvidersLive runs search → episodes → sources against the real sites for the
// providers added from the MALSync site index. Skipped unless ANIZONE_LIVE=1 (see liveEnabled), so
// the normal run stays offline.
func TestMalsyncProvidersLive(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live provider test in short mode")
	}
	if !liveEnabled() {
		t.Skip("set ANIZONE_LIVE=1 to run the live provider tests")
	}

	logger := testLogger()
	cases := map[string]hibikeonlinestream.Provider{
		"kickassanime": NewKickAssAnime(logger),
		"animeheaven":  NewAnimeHeaven(logger),
		"animegg":      NewAnimeGG(logger),
	}

	for name, provider := range cases {
		t.Run(name, func(t *testing.T) {
			results, err := provider.Search(hibikeSearchOptions("Frieren"))
			if err != nil || len(results) == 0 {
				t.Fatalf("search failed: %v (%d results)", err, len(results))
			}
			t.Logf("first result: %s (%s)", results[0].Title, results[0].ID)

			episodes, err := provider.FindEpisodes(results[0].ID)
			if err != nil || len(episodes) == 0 {
				t.Fatalf("episodes failed: %v (%d)", err, len(episodes))
			}
			t.Logf("%d episodes, first #%d", len(episodes), episodes[0].Number)

			server, err := provider.FindEpisodeServer(episodes[0], "default")
			if err != nil {
				t.Fatalf("sources failed: %v", err)
			}
			if len(server.VideoSources) == 0 || server.VideoSources[0].URL == "" {
				t.Fatal("no video sources")
			}
			t.Logf("source: %s (%s), %d subtitles", server.VideoSources[0].URL, server.VideoSources[0].Type, len(server.VideoSources[0].Subtitles))
		})
	}
}
