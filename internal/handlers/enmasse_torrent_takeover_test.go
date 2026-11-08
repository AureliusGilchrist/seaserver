package handlers

import (
	"seanime/internal/torrent_clients/torrent_client"
	"testing"
	"time"
)

func TestTorrentStalled(t *testing.T) {
	old := time.Now().Add(-2 * time.Hour).Unix()
	stalled := &torrent_client.Torrent{Hash: "a", State: torrent_client.TorrentStateStalled, Status: torrent_client.TorrentStatusDownloading, AddedOn: old}
	healthy := &torrent_client.Torrent{Hash: "b", State: torrent_client.TorrentStateDownloading, Status: torrent_client.TorrentStatusDownloading, DownSpeedBytes: 900000, Seeds: 4, AddedOn: old}
	if !looksStalled(stalled) || looksStalled(healthy) {
		t.Fatal("looksStalled")
	}

	tk := &torrentTakeovers{
		cacheAt:      time.Now(),
		cacheList:    map[int][]*torrent_client.Torrent{1: {stalled}, 2: {stalled, healthy}},
		stalledSince: map[string]time.Time{"a": time.Now().Add(-20 * time.Minute)},
	}
	if !tk.TorrentStalled(1) {
		t.Error("a torrent stalled for 20 minutes is not stalled")
	}
	if tk.TorrentStalled(2) {
		t.Error("a series with a healthy torrent counts as stalled")
	}
	tk.stalledSince["a"] = time.Now().Add(-2 * time.Minute)
	if tk.TorrentStalled(1) {
		t.Error("a 2-minute stall counts as stalled")
	}
}
