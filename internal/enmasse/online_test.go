package enmasse

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"

	"github.com/rs/zerolog"
)

func TestOnlineSearchQueries(t *testing.T) {
	q := onlineSearchQueries([]string{"Attack on Titan Season 2", "Shingeki no Kyojin Season 2", "進撃の巨人"})
	want := []string{"Attack on Titan Season 2", "Shingeki no Kyojin Season 2", "Attack on Titan 2nd Season"}
	for _, w := range want {
		found := false
		for _, v := range q {
			if v == w {
				found = true
			}
		}
		if !found {
			t.Errorf("missing %q in %v", w, q)
		}
	}
	for _, v := range q {
		if strings.Contains(v, "進撃") {
			t.Errorf("a non-Latin title was searched: %q", v)
		}
	}
	if len(q) > onlineMaxVariants {
		t.Errorf("%d variants, cap is %d", len(q), onlineMaxVariants)
	}

	q = onlineSearchQueries([]string{"Re:Zero kara Hajimeru Isekai Seikatsu", "Mobile Suit Gundam: The Witch from Mercury"})
	has := func(s string) bool {
		for _, v := range q {
			if strings.EqualFold(v, s) {
				return true
			}
		}
		return false
	}
	if !has("Mobile Suit Gundam") {
		t.Errorf("franchise name not searched: %v", q)
	}
}

func TestTitleSimilarity(t *testing.T) {
	titles := []string{"Attack on Titan Season 2", "Shingeki no Kyojin Season 2"}
	if s := bestTitleSimilarity("Attack on Titan 2nd Season", titles); s < onlineSureSimilarity {
		t.Errorf("same title, other season spelling: %.2f", s)
	}
	if s := bestTitleSimilarity("Attack on Titan Season 3", titles); s >= onlineSureSimilarity {
		t.Errorf("another season scored as sure: %.2f", s)
	}
	if s := bestTitleSimilarity("Bleach", []string{"BLEACH: Thousand-Year Blood War"}); s >= onlineMinSimilarity {
		t.Errorf("franchise accepted for a sequel: %.2f", s)
	}
	if s := bestTitleSimilarity("Pokémon", []string{"Pokemon"}); s != 1 {
		t.Errorf("accents: %.2f", s)
	}
}

func TestEpisodeCountFits(t *testing.T) {
	cases := []struct {
		item *AnilistMinifiedItem
		got  int
		want bool
	}{
		{&AnilistMinifiedItem{Episodes: 12, Status: "FINISHED", Format: "TV"}, 12, true},
		{&AnilistMinifiedItem{Episodes: 24, Status: "FINISHED", Format: "TV"}, 3, false},
		{&AnilistMinifiedItem{Episodes: 1, Status: "FINISHED", Format: "MOVIE"}, 1, true},
		{&AnilistMinifiedItem{Episodes: 1, Status: "FINISHED", Format: "MOVIE"}, 25, false},
		{&AnilistMinifiedItem{Episodes: 0, Status: "RELEASING", Format: "TV"}, 1100, true},
		{&AnilistMinifiedItem{Episodes: 24, Status: "RELEASING", Format: "TV"}, 5, true},
	}
	for i, c := range cases {
		if got := episodeCountFits(c.item, c.got); got != c.want {
			t.Errorf("case %d: got %v", i, got)
		}
	}
}

// TestProcessAnimeOnline runs one series through a fake provider: the first spelling finds
// nothing, a later one finds the series next to its sequel, and the series is queued whole
// after its match is saved.
func TestProcessAnimeOnline(t *testing.T) {
	onlineRequestGap, onlineSeriesGap = time.Millisecond, time.Millisecond
	defer func() { onlineRequestGap, onlineSeriesGap = 8*time.Second, 30*time.Second }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})

	var searched []string
	var mapped, queuedFor string
	hooks := &OnlineHooks{
		InLibrary:       func(int) bool { return false },
		InDownloadQueue: func(int) bool { return false },
		WaitingEpisodes: func() int { return 0 },
		Search: func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
			searched = append(searched, opts.Query)
			if !strings.Contains(strings.ToLower(opts.Query), "kusuriya") {
				return nil, nil
			}
			return []*hibikeonlinestream.SearchResult{
				{ID: "s2", Title: "Kusuriya no Hitorigoto 2nd Season"},
				{ID: "s1", Title: "Kusuriya no Hitorigoto"},
			}, nil
		},
		FindEpisodes: func(provider, id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
			return make([]*hibikeonlinestream.EpisodeDetails, 24), nil
		},
		SaveMapping: func(provider string, mediaId int, providerId string) error {
			mapped = providerId
			return nil
		},
		EnqueueSeries: func(ctx context.Context, provider string, mediaId int) (int, error) {
			queuedFor = provider
			return 24, nil
		},
	}

	item := &AnilistMinifiedItem{ID: 161645, TitleEnglish: "The Apothecary Diaries", TitleRomaji: "Kusuriya no Hitorigoto",
		Episodes: 24, Status: "FINISHED", Format: "TV"}
	match, err := d.findOnProvider(context.Background(), hooks, item, 2023)
	if err != nil {
		t.Fatal(err)
	}
	if match.ID != "s1" {
		t.Fatalf("matched %q (%s)", match.ID, match.Title)
	}
	if len(searched) < 2 || searched[0] != "The Apothecary Diaries" {
		t.Fatalf("searched %v", searched)
	}

	// The whole pipeline, from an offline database entry.
	d.resolveOverride = func(ctx context.Context, it *AnimeOfflineItem) (*AnilistMinifiedItem, error) { return item, nil }
	if err := d.processAnimeOnline(context.Background(), hooks, &AnimeOfflineItem{Title: "Kusuriya no Hitorigoto", AnilistID: 161645}); err != nil {
		t.Fatal(err)
	}
	if mapped != "s1" || queuedFor != OnlineProvider {
		t.Fatalf("mapped %q, queued with %q", mapped, queuedFor)
	}
	if got := d.GetStatus().Details.EpisodesQueued; got != 24 {
		t.Fatalf("episodes queued: %d", got)
	}

	// Already in the library: skipped without a single search.
	searched = nil
	hooks.InLibrary = func(int) bool { return true }
	err = d.processAnimeOnline(context.Background(), hooks, &AnimeOfflineItem{Title: "x", AnilistID: 161645})
	if !errors.Is(err, errOnlineSkipped) || len(searched) != 0 {
		t.Fatalf("library series: err %v, searches %d", err, len(searched))
	}
}
