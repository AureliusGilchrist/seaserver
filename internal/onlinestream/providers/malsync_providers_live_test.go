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
			for i, source := range server.VideoSources {
				t.Logf("source %d: %s (%s)", i, source.URL, source.Type)
			}
			t.Logf("%d subtitles", len(server.VideoSources[0].Subtitles))
			t.Logf("headers: %v", server.Headers)
			checkPlayable(t, server.VideoSources[0].URL, server.Headers)
			if name == "kickassanime" && len(server.VideoSources[0].Subtitles) > 0 {
				subtitle := server.VideoSources[0].Subtitles[0]
				for _, candidate := range server.VideoSources[0].Subtitles {
					if candidate.IsDefault {
						subtitle = candidate
						break
					}
				}
				t.Logf("checking %s subtitle", subtitle.Language)
				checkSubtitlePlayable(t, subtitle.URL, server.Headers)
			}
			if name == "kickassanime" && len(episodes) > 1 {
				secondServer, err := provider.FindEpisodeServer(episodes[1], "default")
				if err != nil {
					t.Fatalf("second episode sources failed: %v", err)
				}
				if len(secondServer.VideoSources) == 0 {
					t.Fatal("second episode has no video sources")
				}
				t.Logf("second episode has %d subtitles", len(secondServer.VideoSources[0].Subtitles))
				var defaultSubtitle *hibikeonlinestream.VideoSubtitle
				for _, candidate := range secondServer.VideoSources[0].Subtitles {
					if candidate.IsDefault {
						defaultSubtitle = candidate
						break
					}
				}
				if defaultSubtitle == nil {
					t.Fatal("second episode has no default English subtitle")
				}
				t.Logf("checking second episode default subtitle language %q", defaultSubtitle.Language)
				checkSubtitlePlayable(t, defaultSubtitle.URL, secondServer.Headers)
			}
		})
	}
}
