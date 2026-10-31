package torrent_client

import (
	"encoding/json"
	"seanime/internal/torrent_clients/qbittorrent/model"
	"testing"

	"github.com/hekmon/transmissionrpc/v3"
)

func TestQbittorrentFileListDecodesEveryField(t *testing.T) {
	var contents []*qbittorrent_model.TorrentContent
	raw := `[{"name":"Show/Season 1/01.mkv","size":100,"progress":0.5,"priority":0,"is_seed":true,"piece_range":[1,4],"availability":2}]`
	if err := json.Unmarshal([]byte(raw), &contents); err != nil {
		t.Fatal(err)
	}
	if !contents[0].IsSeed || len(contents[0].PieceRange) != 2 {
		t.Fatalf("fields with underscores were dropped: %+v", contents[0])
	}

	files := filesFromQbit(contents)
	if files[0].Path != "Show/Season 1/01.mkv" || files[0].Size != 100 || files[0].Progress != 0.5 || files[0].Wanted {
		t.Fatalf("got %+v", files[0])
	}
}

func TestQbittorrentArrayPositionIsTheFileIndex(t *testing.T) {
	files := filesFromQbit([]*qbittorrent_model.TorrentContent{{Name: "a"}, {Name: "b", Priority: qbittorrent_model.PriorityNormal}})
	if files[1].Index != 1 || !files[1].Wanted {
		t.Fatalf("got %+v", files[1])
	}
}

func TestTransmissionFiles(t *testing.T) {
	files := filesFromTransmission(
		[]transmissionrpc.TorrentFile{
			{Name: "Show/01.mkv", Length: 200, BytesCompleted: 50},
			{Name: "Show/empty", Length: 0},
			{Name: "Show/03.mkv", Length: 10},
		},
		[]transmissionrpc.TorrentFileStat{{Wanted: false}, {Wanted: true}},
	)
	if files[0].Progress != 0.25 || files[0].Wanted {
		t.Fatalf("got %+v", files[0])
	}
	if files[1].Progress != 0 {
		t.Fatalf("an empty file has no progress to divide, got %+v", files[1])
	}
	if !files[2].Wanted {
		t.Fatal("a file with no flag counts as wanted")
	}
}

func TestQbittorrentStateNarrowsStatusWithoutChangingIt(t *testing.T) {
	cases := []struct {
		state  qbittorrent_model.TorrentState
		status TorrentStatus
		want   TorrentState
	}{
		{qbittorrent_model.StateStalledDL, TorrentStatusDownloading, TorrentStateStalled},
		{qbittorrent_model.StateMetaDL, TorrentStatusDownloading, TorrentStateMetadata},
		{qbittorrent_model.StateCheckingDL, TorrentStatusDownloading, TorrentStateChecking},
		{qbittorrent_model.StateQueuedDL, TorrentStatusDownloading, TorrentStateQueued},
		{qbittorrent_model.StateQueuedUP, TorrentStatusSeeding, TorrentStateQueued},
		{qbittorrent_model.StateDownloading, TorrentStatusDownloading, TorrentStateDownloading},
		{qbittorrent_model.StateStalledUP, TorrentStatusSeeding, TorrentStateSeeding},
		{qbittorrent_model.StatePausedDL, TorrentStatusPaused, TorrentStatePaused},
	}
	for _, c := range cases {
		if got := fromQbitTorrentStatus(c.state); got != c.status {
			t.Errorf("%s: status changed to %s", c.state, got)
		}
		if got := fromQbitTorrentState(c.state, c.status); got != c.want {
			t.Errorf("%s: got %s, want %s", c.state, got, c.want)
		}
	}
}
