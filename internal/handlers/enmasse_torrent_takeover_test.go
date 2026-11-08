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

	// Added days ago, queued with no seeders and nothing coming in (Zipang after a restart):
	// stalled at once, without waiting out a fresh clock.
	dead := &torrent_client.Torrent{Hash: "d", State: torrent_client.TorrentStateQueued, Status: torrent_client.TorrentStatusDownloading,
		AddedOn: time.Now().Add(-96 * time.Hour).Unix()}
	tk.cacheList[4] = []*torrent_client.Torrent{dead}
	if !tk.TorrentStalled(4) {
		t.Error("a days-old dead torrent waits for the server to watch it")
	}
	// The same old torrent while it is actually downloading is not stalled.
	alive := *dead
	alive.Hash, alive.DownSpeedBytes, alive.Seeds = "e", 500000, 3
	tk.cacheList[5] = []*torrent_client.Torrent{&alive}
	if tk.TorrentStalled(5) {
		t.Error("an old but downloading torrent counts as stalled")
	}
}
