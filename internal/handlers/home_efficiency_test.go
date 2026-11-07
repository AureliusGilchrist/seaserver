package handlers

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"seanime/internal/library/anime"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"golang.org/x/sync/singleflight"
)

func TestCompactLibraryResponse(t *testing.T) {
	h := &Handler{}
	collection := &anime.LibraryCollection{Stats: &anime.LibraryCollectionStats{TotalFiles: 42}}
	request := func(query string) (int, struct {
		Data struct {
			Fingerprint string                   `json:"fingerprint"`
			Unchanged   bool                     `json:"unchanged"`
			Collection  *anime.LibraryCollection `json:"collection"`
		} `json:"data"`
	}) {
		t.Helper()
		e := echo.New()
		rec := httptest.NewRecorder()
		c := e.NewContext(httptest.NewRequest("GET", "/?"+query, nil), rec)
		if err := h.respondCompactLibraryCollection(c, collection); err != nil {
			t.Fatal(err)
		}
		var response struct {
			Data struct {
				Fingerprint string                   `json:"fingerprint"`
				Unchanged   bool                     `json:"unchanged"`
				Collection  *anime.LibraryCollection `json:"collection"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return rec.Body.Len(), response
	}
	fullSize, first := request("")
	if first.Data.Unchanged || first.Data.Collection == nil || first.Data.Collection.Stats.TotalFiles != 42 || len(first.Data.Fingerprint) != 64 {
		t.Fatalf("unexpected first response: %+v", first.Data)
	}
	compactSize, second := request("known=" + first.Data.Fingerprint)
	if !second.Data.Unchanged || second.Data.Collection != nil || compactSize >= fullSize {
		t.Fatalf("unchanged response: %+v; sizes %d >= %d", second.Data, compactSize, fullSize)
	}
	collection.Stats.TotalFiles++
	_, changed := request("known=" + first.Data.Fingerprint)
	if changed.Data.Unchanged || changed.Data.Collection.Stats.TotalFiles != 43 || changed.Data.Fingerprint == first.Data.Fingerprint {
		t.Fatalf("changed response: %+v", changed.Data)
	}
	t.Logf("unchanged response %d bytes versus %d bytes for a small full response", compactSize, fullSize)
}

func TestCoalesceProfileMissingEpisodesErrors(t *testing.T) {
	group := &singleflight.Group{}
	want := errors.New("profile collection unavailable")
	_, err := coalesceProfileMissingEpisodes(group, "profile-1", func() (*anime.MissingEpisodes, error) {
		return nil, want
	})
	if !errors.Is(err, want) {
		t.Fatalf("got %v, want %v", err, want)
	}
	_, err = coalesceProfileMissingEpisodes(group, "profile-1", func() (*anime.MissingEpisodes, error) {
		return nil, nil
	})
	if err == nil || !strings.Contains(err.Error(), "invalid missing episodes") {
		t.Fatalf("expected invalid result error, got %v", err)
	}
}

func TestCoalesceProfileMissingEpisodesSeparatesProfiles(t *testing.T) {
	group := &singleflight.Group{}
	started := make(chan struct{})
	release := make(chan struct{})
	done := make(chan error, 1)
	first := &anime.MissingEpisodes{Episodes: []*anime.Episode{{}}}
	go func() {
		result, err := coalesceProfileMissingEpisodes(group, "profile-1", func() (*anime.MissingEpisodes, error) {
			close(started)
			<-release
			return first, nil
		})
		if err == nil && result != first {
			err = errors.New("profile 1 received the wrong result")
		}
		done <- err
	}()
	<-started
	second := &anime.MissingEpisodes{}
	result, err := coalesceProfileMissingEpisodes(group, "profile-2", func() (*anime.MissingEpisodes, error) {
		return second, nil
	})
	close(release)
	if err != nil || result != second {
		t.Fatalf("profile 2 got %v, %v", result, err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestCoalesceProfileMissingEpisodesSharesConcurrentWork(t *testing.T) {
	group := &singleflight.Group{}
	started := make(chan struct{})
	release := make(chan struct{})
	done := make(chan *anime.MissingEpisodes, 1)
	expected := &anime.MissingEpisodes{}
	go func() {
		result, _ := coalesceProfileMissingEpisodes(group, "profile-1", func() (*anime.MissingEpisodes, error) {
			close(started)
			<-release
			return expected, nil
		})
		done <- result
	}()
	<-started
	waiting := group.DoChan("profile-1", func() (interface{}, error) {
		return nil, errors.New("duplicate calculation was run")
	})
	close(release)
	if result := <-done; result != expected {
		t.Fatal("first request returned the wrong result")
	}
	result := <-waiting
	if result.Err != nil || result.Val != expected || !result.Shared {
		t.Fatalf("concurrent request was not shared: %+v", result)
	}
}
