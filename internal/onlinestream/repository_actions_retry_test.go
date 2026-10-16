package onlinestream

import (
	"errors"
	"testing"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

type retryTestProvider struct {
	calls int
}

func (p *retryTestProvider) Search(hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
	return nil, nil
}

func (p *retryTestProvider) FindEpisodes(string) ([]*hibikeonlinestream.EpisodeDetails, error) {
	return nil, nil
}

func (p *retryTestProvider) FindEpisodeServer(*hibikeonlinestream.EpisodeDetails, string) (*hibikeonlinestream.EpisodeServer, error) {
	p.calls++
	if p.calls == 1 {
		return nil, errors.New("temporary provider failure")
	}
	return &hibikeonlinestream.EpisodeServer{Server: "default"}, nil
}

func (p *retryTestProvider) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{EpisodeServers: []string{"default"}}
}

func TestFindEpisodeServerWithRetry(t *testing.T) {
	provider := &retryTestProvider{}
	episode := &hibikeonlinestream.EpisodeDetails{Number: 2}

	server, err := findEpisodeServerWithRetry(provider, episode, "default")
	if err != nil {
		t.Fatalf("expected retry to recover, got error: %v", err)
	}
	if server == nil || server.Server != "default" {
		t.Fatalf("expected default server, got %#v", server)
	}
	if provider.calls != 2 {
		t.Fatalf("expected 2 provider calls, got %d", provider.calls)
	}
}

func TestProviderSearchesMediaAliases(t *testing.T) {
	for _, provider := range []string{
		"anizone",
		"animegg",
		"animeheaven",
		"animepahe",
		"gojowtf",
		"kickassanime",
	} {
		if !providerSearchesMediaAliases(provider) {
			t.Errorf("expected %q to search media aliases", provider)
		}
	}
	if providerSearchesMediaAliases("external-provider") {
		t.Fatal("external providers should retain title-by-title searches")
	}
}
