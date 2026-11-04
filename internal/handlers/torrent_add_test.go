package handlers

import (
	"strings"
	"testing"

	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/torrent_clients/torrent_client"
)

func TestMagnetFromInfoHash(t *testing.T) {
	hash := "648BE0E12087F2D06A0A1EE2EA9B2F3389AE0374"
	magnet, ok := magnetFromInfoHash(hibiketorrent.AnimeTorrent{Name: "[Headpatter] Omamori Himari Season 1 (BD 1080p)", InfoHash: hash})
	if !ok {
		t.Fatal("expected a magnet from a valid info hash")
	}
	if !strings.HasPrefix(magnet, "magnet:?xt=urn:btih:648be0e12087f2d06a0a1ee2ea9b2f3389ae0374&dn=") || !strings.Contains(magnet, "&tr=") {
		t.Fatalf("unexpected magnet: %s", magnet)
	}
	// The rest of the app reads the hash back out of it, for the already-in-client check.
	if got := torrent_client.MagnetInfoHash(magnet); !strings.EqualFold(got, hash) {
		t.Fatalf("MagnetInfoHash read %q back", got)
	}

	for _, bad := range []string{"", "<redacted>", "1234", strings.Repeat("z", 40)} {
		if _, ok := magnetFromInfoHash(hibiketorrent.AnimeTorrent{InfoHash: bad}); ok {
			t.Errorf("did not expect a magnet from %q", bad)
		}
	}
}
