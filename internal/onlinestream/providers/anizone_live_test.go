package onlinestream_providers

import (
	"testing"
)

// TestAniZoneLive exercises the provider against the real site: search, episodes, and one episode's
// sources. It is the only way to know the extraction still matches the markup — every one of these
// steps reads a shape the site chooses, and a change there is invisible to any fixture.
//
// Skipped unless ANIZONE_LIVE=1, so the normal test run stays offline.
func TestAniZoneLive(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live provider test in short mode")
	}
	if !liveEnabled() {
		t.Skip("set ANIZONE_LIVE=1 to run the live AniZone test")
	}

	logger := testLogger()
	provider := NewAniZone(logger)

	results, err := provider.Search(hibikeSearchOptions("Naruto"))
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("search returned no results")
	}
	t.Logf("search returned %d results; first: %s (%s)", len(results), results[0].Title, results[0].ID)

	episodes, err := provider.FindEpisodes(results[0].ID)
	if err != nil {
		t.Fatalf("find episodes failed: %v", err)
	}
	if len(episodes) == 0 {
		t.Fatal("no episodes found")
	}
	t.Logf("found %d episodes; first: #%d %q", len(episodes), episodes[0].Number, episodes[0].Title)

	server, err := provider.FindEpisodeServer(episodes[0], "default")
	if err != nil {
		t.Fatalf("find episode server failed: %v", err)
	}
	if len(server.VideoSources) == 0 || server.VideoSources[0].URL == "" {
		t.Fatal("no video sources returned")
	}
	t.Logf("stream: %s (type %s), %d subtitles",
		server.VideoSources[0].URL, server.VideoSources[0].Type, len(server.VideoSources[0].Subtitles))
}
