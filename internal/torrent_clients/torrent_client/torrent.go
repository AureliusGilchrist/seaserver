package torrent_client

import (
	"seanime/internal/torrent_clients/qbittorrent/model"
	"seanime/internal/util"
	"strings"

	"github.com/hekmon/transmissionrpc/v3"
)

const (
	TorrentStatusDownloading TorrentStatus = "downloading"
	TorrentStatusSeeding     TorrentStatus = "seeding"
	TorrentStatusPaused      TorrentStatus = "paused"
	TorrentStatusOther       TorrentStatus = "other"
	TorrentStatusStopped     TorrentStatus = "stopped"
)

type (
	Torrent struct {
		Name        string        `json:"name"`
		Hash        string        `json:"hash"`
		Seeds       int           `json:"seeds"`
		UpSpeed     string        `json:"upSpeed"`
		DownSpeed   string        `json:"downSpeed"`
		Progress    float64       `json:"progress"`
		Size        string        `json:"size"`
		Eta         string        `json:"eta"`
		Status      TorrentStatus `json:"status"`
		ContentPath string        `json:"contentPath"`
		// The numbers behind the formatted strings above.
		SizeBytes      int64 `json:"sizeBytes"`
		DownSpeedBytes int64 `json:"downSpeedBytes"`
		UpSpeedBytes   int64 `json:"upSpeedBytes"`
		// AddedOn is a unix time in seconds, 0 when the client does not say.
		AddedOn int64   `json:"addedOn"`
		Ratio   float64 `json:"ratio"`
		Peers   int     `json:"peers"`
		// State says what Status flattens: Status stays the coarse value callers switch on.
		State TorrentState `json:"state"`
	}
	TorrentStatus string
	TorrentState  string

	// TorrentFile is one file inside a torrent. Index is its position in the client's file list.
	TorrentFile struct {
		Index    int     `json:"index"`
		Path     string  `json:"path"`
		Size     int64   `json:"size"`
		Progress float64 `json:"progress"`
		Wanted   bool    `json:"wanted"`
	}
)

const (
	TorrentStateDownloading TorrentState = "downloading"
	TorrentStateStalled     TorrentState = "stalled"
	TorrentStateMetadata    TorrentState = "metadata"
	TorrentStateChecking    TorrentState = "checking"
	TorrentStateQueued      TorrentState = "queued"
	TorrentStateSeeding     TorrentState = "seeding"
	TorrentStatePaused      TorrentState = "paused"
	TorrentStateStopped     TorrentState = "stopped"
	TorrentStateOther       TorrentState = "other"
)

//var torrentPool = util.NewPool[*Torrent](func() *Torrent {
//	return &Torrent{}
//})

func (r *Repository) FromTransmissionTorrents(t []transmissionrpc.Torrent) []*Torrent {
	ret := make([]*Torrent, 0, len(t))
	for _, t := range t {
		ret = append(ret, r.FromTransmissionTorrent(&t))
	}
	return ret
}

func (r *Repository) FromTransmissionTorrent(t *transmissionrpc.Torrent) *Torrent {
	torrent := &Torrent{}

	torrent.Name = "N/A"
	if t.Name != nil {
		torrent.Name = *t.Name
	}

	torrent.Hash = "N/A"
	if t.HashString != nil {
		torrent.Hash = *t.HashString
	}

	torrent.Seeds = 0
	if t.PeersSendingToUs != nil {
		torrent.Seeds = int(*t.PeersSendingToUs)
	}

	if t.PeersConnected != nil {
		torrent.Peers = int(*t.PeersConnected)
	}

	if t.UploadRatio != nil && *t.UploadRatio > 0 {
		torrent.Ratio = *t.UploadRatio
	}

	if t.AddedDate != nil {
		torrent.AddedOn = t.AddedDate.Unix()
	}

	torrent.UpSpeed = "0 KB/s"
	if t.RateUpload != nil {
		torrent.UpSpeed = util.ToHumanReadableSpeed(int(*t.RateUpload))
		torrent.UpSpeedBytes = *t.RateUpload
	}

	torrent.DownSpeed = "0 KB/s"
	if t.RateDownload != nil {
		torrent.DownSpeed = util.ToHumanReadableSpeed(int(*t.RateDownload))
		torrent.DownSpeedBytes = *t.RateDownload
	}

	torrent.Progress = 0.0
	if t.PercentDone != nil {
		torrent.Progress = *t.PercentDone
	}

	torrent.Size = "N/A"
	if t.TotalSize != nil {
		// TotalSize is held in bits.
		torrent.SizeBytes = int64(t.TotalSize.Byte())
		torrent.Size = util.Bytes(uint64(torrent.SizeBytes))
	}

	torrent.Eta = "???"
	if t.ETA != nil {
		torrent.Eta = util.FormatETA(int(*t.ETA))
	}

	torrent.ContentPath = ""
	if t.DownloadDir != nil {
		torrent.ContentPath = *t.DownloadDir
	}

	torrent.Status = TorrentStatusOther
	if t.Status != nil && t.IsFinished != nil {
		torrent.Status = fromTransmissionTorrentStatus(*t.Status, *t.IsFinished)
	}
	torrent.State = transmissionTorrentState(t, torrent.Status)

	return torrent
}

// fromTransmissionTorrentStatus returns a normalized status for the torrent.
func fromTransmissionTorrentStatus(st transmissionrpc.TorrentStatus, isFinished bool) TorrentStatus {
	if st == transmissionrpc.TorrentStatusSeed || st == transmissionrpc.TorrentStatusSeedWait {
		return TorrentStatusSeeding
	} else if st == transmissionrpc.TorrentStatusStopped && isFinished {
		return TorrentStatusStopped
	} else if st == transmissionrpc.TorrentStatusStopped && !isFinished {
		return TorrentStatusPaused
	} else if st == transmissionrpc.TorrentStatusDownload || st == transmissionrpc.TorrentStatusDownloadWait {
		return TorrentStatusDownloading
	} else {
		return TorrentStatusOther
	}
}

// transmissionTorrentState narrows status down to what the torrent is actually doing.
func transmissionTorrentState(t *transmissionrpc.Torrent, status TorrentStatus) TorrentState {
	if t.Status != nil {
		switch *t.Status {
		case transmissionrpc.TorrentStatusCheck, transmissionrpc.TorrentStatusCheckWait:
			return TorrentStateChecking
		case transmissionrpc.TorrentStatusDownloadWait, transmissionrpc.TorrentStatusSeedWait:
			return TorrentStateQueued
		}
	}
	if status == TorrentStatusDownloading {
		if t.MetadataPercentComplete != nil && *t.MetadataPercentComplete < 1 {
			return TorrentStateMetadata
		}
		if t.RateDownload != nil && *t.RateDownload == 0 {
			return TorrentStateStalled
		}
	}
	return stateFromStatus(status)
}

// stateFromStatus is the state of a torrent nothing more specific is known about.
func stateFromStatus(status TorrentStatus) TorrentState {
	switch status {
	case TorrentStatusDownloading:
		return TorrentStateDownloading
	case TorrentStatusSeeding:
		return TorrentStateSeeding
	case TorrentStatusPaused:
		return TorrentStatePaused
	case TorrentStatusStopped:
		return TorrentStateStopped
	default:
		return TorrentStateOther
	}
}

func (r *Repository) FromQbitTorrents(t []*qbittorrent_model.Torrent) []*Torrent {
	ret := make([]*Torrent, 0, len(t))
	for _, t := range t {
		ret = append(ret, r.FromQbitTorrent(t))
	}
	return ret
}
func (r *Repository) FromQbitTorrent(t *qbittorrent_model.Torrent) *Torrent {
	torrent := &Torrent{}

	torrent.Name = t.Name
	torrent.Hash = t.Hash
	torrent.Seeds = t.NumSeeds
	torrent.UpSpeed = util.ToHumanReadableSpeed(t.Upspeed)
	torrent.DownSpeed = util.ToHumanReadableSpeed(t.Dlspeed)
	torrent.Progress = t.Progress
	torrent.Size = util.Bytes(uint64(t.Size))
	torrent.Eta = util.FormatETA(t.Eta)
	torrent.ContentPath = t.ContentPath
	torrent.Status = fromQbitTorrentStatus(t.State)
	torrent.SizeBytes = int64(t.Size)
	torrent.DownSpeedBytes = int64(t.Dlspeed)
	torrent.UpSpeedBytes = int64(t.Upspeed)
	torrent.AddedOn = int64(t.AddedOn)
	torrent.Ratio = t.Ratio
	torrent.Peers = t.NumLeechs
	torrent.State = fromQbitTorrentState(t.State, torrent.Status)

	return torrent
}

// fromQbitTorrentState narrows status down to what the torrent is actually doing.
func fromQbitTorrentState(st qbittorrent_model.TorrentState, status TorrentStatus) TorrentState {
	switch st {
	case qbittorrent_model.StateStalledDL:
		return TorrentStateStalled
	case qbittorrent_model.StateMetaDL:
		return TorrentStateMetadata
	case qbittorrent_model.StateCheckingDL, qbittorrent_model.StateCheckingUP, qbittorrent_model.StateCheckingResumeData:
		return TorrentStateChecking
	case qbittorrent_model.StateQueuedDL, qbittorrent_model.StateQueuedUP:
		return TorrentStateQueued
	default:
		return stateFromStatus(status)
	}
}

// filesFromQbit converts qBittorrent's file list. Array position is the file's index.
func filesFromQbit(contents []*qbittorrent_model.TorrentContent) []*TorrentFile {
	ret := make([]*TorrentFile, 0, len(contents))
	for i, f := range contents {
		ret = append(ret, &TorrentFile{
			Index:    i,
			Path:     strings.ReplaceAll(f.Name, "\\", "/"),
			Size:     int64(f.Size),
			Progress: f.Progress,
			Wanted:   f.Priority != qbittorrent_model.PriorityDoNotDownload,
		})
	}
	return ret
}

// filesFromTransmission converts Transmission's file list. Its wanted flags arrive in a separate list
// in the same order; a file with no flag counts as wanted.
func filesFromTransmission(files []transmissionrpc.TorrentFile, stats []transmissionrpc.TorrentFileStat) []*TorrentFile {
	ret := make([]*TorrentFile, 0, len(files))
	for i, f := range files {
		file := &TorrentFile{
			Index:  i,
			Path:   strings.ReplaceAll(f.Name, "\\", "/"),
			Size:   f.Length,
			Wanted: i >= len(stats) || stats[i].Wanted,
		}
		if f.Length > 0 {
			file.Progress = float64(f.BytesCompleted) / float64(f.Length)
		}
		ret = append(ret, file)
	}
	return ret
}

// fromQbitTorrentStatus returns a normalized status for the torrent.
func fromQbitTorrentStatus(st qbittorrent_model.TorrentState) TorrentStatus {
	if st == qbittorrent_model.StateQueuedUP ||
		st == qbittorrent_model.StateStalledUP ||
		st == qbittorrent_model.StateForcedUP ||
		st == qbittorrent_model.StateCheckingUP ||
		st == qbittorrent_model.StateUploading {
		return TorrentStatusSeeding
	} else if st == qbittorrent_model.StatePausedDL || st == qbittorrent_model.StateStoppedDL {
		return TorrentStatusPaused
	} else if st == qbittorrent_model.StateDownloading ||
		st == qbittorrent_model.StateCheckingDL ||
		st == qbittorrent_model.StateStalledDL ||
		st == qbittorrent_model.StateQueuedDL ||
		st == qbittorrent_model.StateMetaDL ||
		st == qbittorrent_model.StateAllocating ||
		st == qbittorrent_model.StateForceDL {
		return TorrentStatusDownloading
	} else if st == qbittorrent_model.StatePausedUP || st == qbittorrent_model.StateStoppedUP {
		return TorrentStatusStopped
	} else {
		return TorrentStatusOther
	}
}
