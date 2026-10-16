package onlinestream_providers

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

func TestAnimetsuSearchAndDubEpisodeSources(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/api/anime/search":
			if got := r.URL.Query().Get("year"); got != "any" {
				t.Errorf("expected unknown year to be sent as 'any', got %q", got)
			}
			if got := r.URL.Query().Get("query"); got != "Series" {
				t.Errorf("expected query 'Series', got %q", got)
			}
			w.Header().Set("Content-Type", "application/json")
			if r.URL.Query().Get("page") == "1" {
				_, _ = fmt.Fprint(w, `{"last_page":2,"results":[{"id":"series-id","title":{"english":"English title","romaji":"Romaji title","native":"Native title"}}]}`)
				return
			}
			_, _ = fmt.Fprint(w, `{"last_page":2,"results":[{"id":"series-id-2","title":{"romaji":"Romaji only"}}]}`)
		case "/v2/api/anime/eps/series-id":
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprint(w, `[{"id":"episode-id","ep_num":1,"name":"Episode 1"}]`)
		case "/v2/api/anime/oppai/series-id/1":
			if got := r.URL.Query().Get("source_type"); got != "dub" {
				t.Errorf("expected dub source type, got %q", got)
			}
			if got := r.URL.Query().Get("server"); got != "pahe" {
				t.Errorf("expected pahe server, got %q", got)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprint(w, `{"sources":[{"url":"playlist.m3u8","quality":"1080p","subtitles":[{"url":"subtitle.vtt","lang":"en"}]}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := NewAnimetsu(testLogger()).(*Animetsu)
	provider.Url = server.URL
	provider.BlobDomain = server.URL
	provider.Client = server.Client()

	results, err := provider.Search(hibikeonlinestream.SearchOptions{
		Media: hibikeonlinestream.Media{RomajiTitle: "Series"},
		Query: "Series",
		Dub:   true,
	})
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected results from both pages, got %d", len(results))
	}
	if results[0].ID != "series-id/dub" || results[0].Title != "English title" {
		t.Fatalf("unexpected first result: %#v", results[0])
	}
	if results[0].URL != server.URL+"/anime/series-id" {
		t.Fatalf("unexpected first result URL: %q", results[0].URL)
	}
	if results[1].ID != "series-id-2/dub" || results[1].Title != "Romaji only" {
		t.Fatalf("unexpected second result: %#v", results[1])
	}

	episodes, err := provider.FindEpisodes(results[0].ID)
	if err != nil {
		t.Fatalf("find episodes failed: %v", err)
	}
	if len(episodes) != 1 || episodes[0].ID != "animeid=series-id&ep_id=episode-id/dub" {
		t.Fatalf("unexpected dub episode: %#v", episodes)
	}

	episodeServer, err := provider.FindEpisodeServer(episodes[0], "pahe")
	if err != nil {
		t.Fatalf("find episode server failed: %v", err)
	}
	if len(episodeServer.VideoSources) != 1 {
		t.Fatalf("expected one video source, got %d", len(episodeServer.VideoSources))
	}
	if got, want := episodeServer.VideoSources[0].URL, server.URL+"/playlist.m3u8"; got != want {
		t.Fatalf("expected source URL %q, got %q", want, got)
	}
}
