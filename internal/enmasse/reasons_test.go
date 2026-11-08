package enmasse

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/rs/zerolog"
)

func TestExplainSkips(t *testing.T) {
	for msg, want := range map[string]string{
		"already in the library":        ReasonInLibrary,
		"already downloading":           ReasonDownloading,
		"already lined up to be queued": ReasonLinedUp,
		"not aired yet":                 ReasonNotAired,
		"adult":                         ReasonAdult,
		"no AniList entry, so it could not be matched":                               ReasonNoAniList,
		"nothing to download (every episode is already in the library or the queue)": ReasonNothingToDownload,
	} {
		if got, _ := explainResult(onlineSkip{msg}); got != want {
			t.Errorf("%q: got %q, want %q", msg, got, want)
		}
	}
	if got, _ := explainResult(errors.New(`failed to resolve AniList: graphql: 404`)); got != ReasonAniListFailed {
		t.Errorf("anilist: %q", got)
	}
}

// The messages as the NAS logged them.
func TestExplainNotFoundFromMessage(t *testing.T) {
	reason, parts := explainResult(errors.New(`".hack//Sign" is listed on kickassanime but has no episodes; not found on anizone (last search error: anime not found); not found on animeheaven (tried 6 spellings) (the torrent keeps downloading)`))
	if reason != ReasonNoEpisodes || len(parts) != 3 {
		t.Fatalf("%q %+v", reason, parts)
	}
	want := []ProviderReason{
		{Provider: "kickassanime", Reason: ReasonNoEpisodes},
		{Provider: "anizone", Reason: ReasonNotFound},
		{Provider: "animeheaven", Reason: "Not found (6 spellings)"},
	}
	for i, w := range want {
		if parts[i].Provider != w.Provider || parts[i].Reason != w.Reason {
			t.Errorf("part %d: %+v, want %+v", i, parts[i], w)
		}
	}

	reason, parts = explainResult(errors.New(`not found on kickassanime (tried 3 spellings); "Kidou Senshi Z Gundam" on anizone has 24 episodes, the series has 50`))
	if reason != ReasonCountMismatch || parts[1].Reason != "Episode count mismatch (24 vs 50)" || parts[1].Provider != "anizone" {
		t.Fatalf("%q %+v", reason, parts)
	}
}

func TestExplainNotFoundRecorded(t *testing.T) {
	err := newNotFound([]ProviderReason{
		{Provider: "kickassanime", Detail: "found on kickassanime but could not queue it there: no source found for episode: video source not found; other; parts"},
		{Provider: "animepahe", Detail: "the provider is refusing this server: animepahe is refusing this server (Cloudflare check); not searched again until 10:52"},
	}, false, false)
	reason, parts := explainResult(err)
	if reason != ReasonVideoSourceNull || len(parts) != 2 || parts[0].Reason != ReasonVideoSourceNull || parts[1].Reason != ReasonRefused {
		t.Fatalf("%q %+v", reason, parts)
	}
}

// TestEveryResultIsKept: every series' result is kept and paged newest first; Stop and reset
// clears them at once, and the stopped run's last result is not recorded.
func TestEveryResultIsKept(t *testing.T) {
	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	d.results.reset()
	ctx := context.Background()
	for i := 0; i < 250; i++ {
		d.mu.Lock()
		d.currentAnime = &AnilistMinifiedItem{ID: i + 1, Title: fmt.Sprintf("S%d", i)}
		d.mu.Unlock()
		var err error
		if i%2 == 0 {
			err = onlineSkip{"already in the library"}
		}
		d.recordOnlineResult(ctx, fmt.Sprintf("S%d", i), err)
	}
	page := d.Results(0, 100, "all", "")
	if page.Total != 250 || len(page.Items) != 100 || page.Items[0].Title != "S249" {
		t.Fatalf("total %d, items %d, first %q", page.Total, len(page.Items), page.Items[0].Title)
	}
	skipped := d.Results(0, 500, "skipped", "")
	if skipped.Total != 125 || skipped.Items[0].Reason != ReasonInLibrary {
		t.Fatalf("skipped %d, reason %q", skipped.Total, skipped.Items[0].Reason)
	}
	// From the file, as after a restart.
	fresh := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	if got := fresh.Results(0, 10, "", "S24").Total; got != 11 { // S24, S240..S249
		t.Fatalf("after reload, search found %d", got)
	}

	d.isRunning = true
	d.Stop(false)
	d.recordOnlineResult(ctx, "late", nil)
	if c := d.results.counts(); c.Total != 0 {
		t.Fatalf("reset kept %d results", c.Total)
	}
}
