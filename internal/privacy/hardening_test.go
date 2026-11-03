package privacy

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/rs/zerolog"
)

func TestIsLocalAddress(t *testing.T) {
	local := []string{
		"localhost:8080", "127.0.0.1:8080", "[::1]:80", "192.168.1.10", "10.0.0.5:9000",
		"172.16.3.4", "169.254.119.91:43211", "nas", "nas.local:80", "router.lan",
		"box.home.arpa", "0.0.0.0", "[fd00::1]:80", "LOCALHOST.",
	}
	for _, a := range local {
		if !IsLocalAddress(a) {
			t.Errorf("%q should be local", a)
		}
	}
	remote := []string{
		"graphql.anilist.co:443", "1.1.1.1:443", "nyaa.si", "[2606:4700::1111]:443", "",
		"example.com", "8.8.8.8",
	}
	for _, a := range remote {
		if IsLocalAddress(a) {
			t.Errorf("%q should not be local", a)
		}
	}
}

func TestNormalize(t *testing.T) {
	s := &Settings{
		FailMode:          "bogus",
		TorrentEncryption: "",
		Socks5Port:        0,
		DoHProviders:      []string{" https://dns.quad9.net/dns-query ", "http://plain.example/dns-query", ""},
	}
	s.Normalize()
	if s.FailMode != "open" || s.TorrentEncryption != TorrentEncryptionPrefer || s.Socks5Port != 1080 {
		t.Fatalf("defaults not applied: %+v", s)
	}
	if len(s.DoHProviders) != 1 || s.DoHProviders[0] != "https://dns.quad9.net/dns-query" {
		t.Fatalf("non-HTTPS DoH provider kept: %v", s.DoHProviders)
	}

	s = &Settings{FailMode: "closed", TorrentEncryption: "require", Socks5Port: 9050}
	s.Normalize()
	if s.FailMode != "closed" || s.TorrentEncryption != TorrentEncryptionRequire || s.Socks5Port != 9050 {
		t.Fatalf("valid values changed: %+v", s)
	}
}

func TestModelRoundTrip(t *testing.T) {
	in := &Settings{
		DoHEnabled:        true,
		DoHProviders:      []string{"https://a.example/dns-query", "https://b.example/dns-query"},
		Socks5Enabled:     true,
		Socks5Address:     "127.0.0.1",
		Socks5Port:        1080,
		FailMode:          "closed",
		TorrentEncryption: TorrentEncryptionRequire,
	}
	row := in.ToModel()
	if row.ID != 1 {
		t.Fatalf("row id = %d", row.ID)
	}
	out := SettingsFromModel(row)
	if out.DoHProviders[1] != in.DoHProviders[1] || out.TorrentEncryption != in.TorrentEncryption || out.FailMode != "closed" {
		t.Fatalf("round trip lost data: %+v", out)
	}
	// Rows saved before torrentEncryption existed read as "prefer"
	row.TorrentEncryption = ""
	if SettingsFromModel(row).TorrentEncryption != TorrentEncryptionPrefer {
		t.Fatal("empty torrent encryption should read as prefer")
	}
}

func TestBlockedResolverRefusesLookups(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := blockedResolver.LookupHost(ctx, "example.com"); err == nil {
		t.Fatal("fail-closed resolver answered a DNS query")
	}
}

func TestFallbackResolver(t *testing.T) {
	logger := zerolog.Nop()
	open := NewDoHManager(nil, false, &logger)
	open.systemResolver = net.DefaultResolver
	if open.fallbackResolver() != net.DefaultResolver {
		t.Fatal("fail-open should fall back to the system resolver")
	}
	closed := NewDoHManager(nil, true, &logger)
	closed.systemResolver = net.DefaultResolver
	if closed.fallbackResolver() != blockedResolver {
		t.Fatal("fail-closed should fall back to the blocking resolver")
	}
}

func TestApplyTorrentConfig(t *testing.T) {
	logger := zerolog.Nop()
	m := NewManager(&logger)
	defer current.Store(nil)

	cfg := torrent.NewDefaultClientConfig()
	ApplyTorrentConfig(cfg)
	if !cfg.HeaderObfuscationPolicy.Preferred || cfg.HeaderObfuscationPolicy.RequirePreferred {
		t.Fatalf("default should prefer, not require: %+v", cfg.HeaderObfuscationPolicy)
	}
	if cfg.TrackerDialContext != nil {
		t.Fatal("no SOCKS5 configured, tracker dialer should stay default")
	}

	m.mu.Lock()
	m.settings.TorrentEncryption = TorrentEncryptionRequire
	m.mu.Unlock()
	cfg = torrent.NewDefaultClientConfig()
	ApplyTorrentConfig(cfg)
	if !cfg.HeaderObfuscationPolicy.RequirePreferred {
		t.Fatal("require mode should refuse unencrypted peers")
	}
}
