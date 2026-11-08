package enmasse

import (
	"errors"
	"testing"
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
