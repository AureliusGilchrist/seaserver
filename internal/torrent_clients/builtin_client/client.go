package builtin_client

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/util"
	"sync"
	"time"

	alog "github.com/anacrolix/log"
	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/storage"
	"github.com/rs/zerolog"
)

const (
	StatusDownloading = "downloading"
	StatusSeeding     = "seeding"
	StatusPaused      = "paused"
	StatusStopped     = "stopped"
	StatusError       = "error"

	seedDuration = 5 * time.Minute
)

type TorrentInfo struct {
	Hash        string  `json:"hash"`
	Name        string  `json:"name"`
	Seeds       int     `json:"seeds"`
	UpSpeed     string  `json:"upSpeed"`
	DownSpeed   string  `json:"downSpeed"`
	Progress    float64 `json:"progress"`
	Size        string  `json:"size"`
	Eta         string  `json:"eta"`
	Status      string  `json:"status"`
	ContentPath string  `json:"contentPath"`
}

type Client struct {
	logger      *zerolog.Logger
	db          *db.Database
	downloadDir string
	onComplete  func() // optional callback when a torrent finishes downloading

	mu               sync.RWMutex
	torrentClient    *torrent.Client
	activeTorrents   map[string]*torrent.Torrent // hash -> active torrent handle
	inactiveTorrents map[string]inactiveEntry    // hash -> paused/stopped entry
	speedTracker     map[string]*speedEntry
	seedTimerCancels map[string]context.CancelFunc
}

type inactiveEntry struct {
	magnet      string
	name        string
	downloadDir string
	status      string // StatusPaused or StatusStopped
}

type speedEntry struct {
	lastBytes   int64
	lastCheck   time.Time
	lastUpBytes int64
}

type NewClientOptions struct {
	Logger      *zerolog.Logger
	Database    *db.Database
	DownloadDir string
	OnComplete  func() // called when any torrent finishes downloading (before seed timeout)
}

func NewClient(opts *NewClientOptions) *Client {
	c := &Client{
		logger:           opts.Logger,
		db:               opts.Database,
		downloadDir:      opts.DownloadDir,
		activeTorrents:   make(map[string]*torrent.Torrent),
		inactiveTorrents: make(map[string]inactiveEntry),
		speedTracker:     make(map[string]*speedEntry),
		seedTimerCancels: make(map[string]context.CancelFunc),
	}
	if opts.OnComplete != nil {
		c.onComplete = opts.OnComplete
	}
	return c
}

func (c *Client) initialize() error {
	if c.torrentClient != nil {
		return nil
	}

	dir := c.downloadDir
	if dir == "" {
		cacheDir, err := os.UserCacheDir()
		if err != nil {
			dir = os.TempDir()
		} else {
			dir = filepath.Join(cacheDir, "seanime", "builtin-torrents")
		}
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("builtin torrent client: Failed to create download dir: %w", err)
	}

	cfg := torrent.NewDefaultClientConfig()
	cfg.Seed = true
	cfg.Logger = alog.Logger{}
	cfg.DefaultStorage = storage.NewFileByInfoHash(dir)

	client, err := torrent.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("builtin torrent client: Failed to create torrent client: %w", err)
	}

	c.torrentClient = client
	c.logger.Info().Str("dir", dir).Msg("builtin torrent client: Initialized")
	return nil
}

func (c *Client) Start() bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	if err := c.initialize(); err != nil {
		c.logger.Error().Err(err).Msg("builtin torrent client: Failed to initialize")
		return false
	}

	c.restoreFromDB()
	return true
}

func (c *Client) restoreFromDB() {
	if c.db == nil {
		return
	}

	items, err := c.db.GetBuiltinTorrentItems()
	if err != nil {
		c.logger.Error().Err(err).Msg("builtin torrent client: Failed to restore torrents from DB")
		return
	}

	for _, item := range items {
		if item.Status == StatusPaused || item.Status == StatusStopped {
			c.inactiveTorrents[item.Hash] = inactiveEntry{
				magnet:      item.Magnet,
				name:        item.Name,
				downloadDir: item.DownloadDir,
				status:      item.Status,
			}
			continue
		}
		if item.Magnet == "" {
			continue
		}
		dest := item.DownloadDir
		if dest == "" {
			dest = c.downloadDir
		}
		t, err := c.addMagnetInternal(item.Magnet, dest)
		if err != nil {
			c.logger.Warn().Err(err).Str("hash", item.Hash).Msg("builtin torrent client: Failed to restore torrent")
			continue
		}
		c.activeTorrents[item.Hash] = t
		go c.watchAndStopSeeding(t, item.Hash)
		c.logger.Debug().Str("hash", item.Hash).Msg("builtin torrent client: Restored torrent")
	}
}

func (c *Client) addMagnetInternal(magnet string, dest string) (*torrent.Torrent, error) {
	spec, err := torrent.TorrentSpecFromMagnetUri(magnet)
	if err != nil {
		return nil, err
	}

	if dest != "" {
		if err2 := os.MkdirAll(dest, 0755); err2 == nil {
			spec.Storage = storage.NewFile(dest)
		}
	}

	t, _, err := c.torrentClient.AddTorrentSpec(spec)
	if err != nil {
		return nil, err
	}

	t.AllowDataDownload()
	t.AllowDataUpload()
	return t, nil
}

// watchAndStopSeeding waits for a torrent to finish downloading, then stops seeding after seedDuration.
func (c *Client) watchAndStopSeeding(t *torrent.Torrent, hash string) {
	// Wait for metadata
	<-t.GotInfo()

	// Poll until download is complete or torrent is removed
	for {
		c.mu.RLock()
		_, active := c.activeTorrents[hash]
		c.mu.RUnlock()
		if !active {
			return
		}

		length := t.Length()
		completed := t.BytesCompleted()
		if length > 0 && completed >= length {
			break
		}
		time.Sleep(15 * time.Second)
	}

	c.logger.Info().Str("hash", hash).Dur("seed_duration", seedDuration).Msg("builtin torrent client: Download complete, seeding for limited time")

	// Notify external systems (e.g. trigger unmatched scanner)
	if c.onComplete != nil {
		go c.onComplete()
	}

	// Update DB to "seeding"
	if c.db != nil {
		_ = c.db.UpdateBuiltinTorrentStatus(hash, StatusSeeding)
	}

	// Seed for seedDuration then stop
	ctx, cancel := context.WithCancel(context.Background())
	c.mu.Lock()
	c.seedTimerCancels[hash] = cancel
	c.mu.Unlock()

	select {
	case <-ctx.Done():
		return // cancelled by remove/pause
	case <-time.After(seedDuration):
		c.doStopSeeding(hash)
	}
}

// doStopSeeding drops the torrent from the client and marks it stopped. Must NOT be called with lock held.
func (c *Client) doStopSeeding(hash string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	t, ok := c.activeTorrents[hash]
	if !ok {
		return
	}

	name := t.Name()
	magnet := ""
	downloadDir := c.downloadDir
	if c.db != nil {
		if dbItem, err := c.db.GetBuiltinTorrentItemByHash(hash); err == nil && dbItem != nil {
			magnet = dbItem.Magnet
			if dbItem.DownloadDir != "" {
				downloadDir = dbItem.DownloadDir
			}
		}
	}

	t.Drop()
	delete(c.activeTorrents, hash)
	delete(c.speedTracker, hash)
	delete(c.seedTimerCancels, hash)

	c.inactiveTorrents[hash] = inactiveEntry{
		magnet:      magnet,
		name:        name,
		downloadDir: downloadDir,
		status:      StatusStopped,
	}

	if c.db != nil {
		_ = c.db.UpdateBuiltinTorrentStatus(hash, StatusStopped)
	}

	c.logger.Info().Str("hash", hash).Msg("builtin torrent client: Stopped seeding after timeout")
}

func (c *Client) cancelSeedTimer(hash string) {
	if cancel, ok := c.seedTimerCancels[hash]; ok {
		cancel()
		delete(c.seedTimerCancels, hash)
	}
}

func (c *Client) TorrentExists(hash string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if _, ok := c.activeTorrents[hash]; ok {
		return true
	}
	if _, ok := c.inactiveTorrents[hash]; ok {
		return true
	}
	return false
}

func (c *Client) GetList() []*TorrentInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()

	list := make([]*TorrentInfo, 0, len(c.activeTorrents)+len(c.inactiveTorrents))

	for hash, t := range c.activeTorrents {
		info := c.torrentToInfo(hash, t)
		list = append(list, info)
	}

	for hash, entry := range c.inactiveTorrents {
		list = append(list, &TorrentInfo{
			Hash:        hash,
			Name:        entry.name,
			Status:      entry.status,
			ContentPath: entry.downloadDir,
			Progress:    1.0, // stopped/paused entries were at least partially downloaded
			Size:        "N/A",
			DownSpeed:   "0 B/s",
			UpSpeed:     "0 B/s",
			Eta:         "N/A",
		})
	}

	return list
}

func (c *Client) torrentToInfo(hash string, t *torrent.Torrent) *TorrentInfo {
	now := time.Now()

	tracker, ok := c.speedTracker[hash]
	if !ok {
		tracker = &speedEntry{lastCheck: now}
		c.speedTracker[hash] = tracker
	}

	bytesCompleted := t.BytesCompleted()
	totalLength := t.Length()

	elapsed := now.Sub(tracker.lastCheck).Seconds()
	downSpeed := "0 B/s"
	upSpeed := "0 B/s"

	if elapsed > 0 {
		downBPS := float64(bytesCompleted-tracker.lastBytes) / elapsed
		if downBPS > 0 {
			downSpeed = fmt.Sprintf("%s/s", util.Bytes(uint64(downBPS)))
		}
		stats := t.Stats()
		upBPS := float64(stats.BytesWrittenData.Int64()-tracker.lastUpBytes) / elapsed
		if upBPS > 0 {
			upSpeed = fmt.Sprintf("%s/s", util.Bytes(uint64(upBPS)))
		}
		tracker.lastUpBytes = stats.BytesWrittenData.Int64()
	}

	tracker.lastBytes = bytesCompleted
	tracker.lastCheck = now

	progress := 0.0
	if totalLength > 0 {
		progress = float64(bytesCompleted) / float64(totalLength)
	}

	status := StatusDownloading
	if progress >= 1.0 {
		status = StatusSeeding
	}

	eta := "???"
	if elapsed > 0 && bytesCompleted > 0 {
		remaining := totalLength - bytesCompleted
		downBPS := float64(bytesCompleted-tracker.lastBytes) / elapsed
		if downBPS > 0 && remaining > 0 {
			etaSecs := int(float64(remaining) / downBPS)
			eta = util.FormatETA(etaSecs)
		}
	}
	if status == StatusSeeding {
		eta = "N/A"
	}

	name := t.Name()
	if name == "" {
		name = hash
	}

	size := "N/A"
	if totalLength > 0 {
		size = util.Bytes(uint64(totalLength))
	}

	return &TorrentInfo{
		Hash:        hash,
		Name:        name,
		Seeds:       len(t.PeerConns()),
		DownSpeed:   downSpeed,
		UpSpeed:     upSpeed,
		Progress:    progress,
		Size:        size,
		Eta:         eta,
		Status:      status,
		ContentPath: c.downloadDir,
	}
}

func (c *Client) AddMagnets(magnets []string, dest string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if err := c.initialize(); err != nil {
		return err
	}

	for _, magnet := range magnets {
		spec, err := torrent.TorrentSpecFromMagnetUri(magnet)
		if err != nil {
			c.logger.Error().Err(err).Str("magnet", magnet).Msg("builtin torrent client: Failed to parse magnet")
			return err
		}

		hash := spec.InfoHash.HexString()

		t, err := c.addMagnetInternal(magnet, dest)
		if err != nil {
			c.logger.Error().Err(err).Str("hash", hash).Msg("builtin torrent client: Failed to add magnet")
			return err
		}

		c.activeTorrents[hash] = t

		name := t.Name()
		if name == "" {
			name = hash
		}

		item := &models.BuiltinTorrentItem{
			Hash:        hash,
			Magnet:      magnet,
			Name:        name,
			DownloadDir: dest,
			Status:      StatusDownloading,
		}
		if c.db != nil {
			if err := c.db.UpsertBuiltinTorrentItem(item); err != nil {
				c.logger.Warn().Err(err).Str("hash", hash).Msg("builtin torrent client: Failed to persist torrent to DB")
			}
		}

		// Update name once info is available, then start seed timer
		go func(t *torrent.Torrent, hash string, magnet string, dest string) {
			<-t.GotInfo()
			name := t.Name()
			if name != "" && c.db != nil {
				dbItem := &models.BuiltinTorrentItem{
					Hash:        hash,
					Magnet:      magnet,
					Name:        name,
					DownloadDir: dest,
					Status:      StatusDownloading,
				}
				_ = c.db.UpsertBuiltinTorrentItem(dbItem)
				c.logger.Debug().Str("hash", hash).Str("name", name).Msg("builtin torrent client: Got torrent info, updated name")
			}
		}(t, hash, magnet, dest)

		go c.watchAndStopSeeding(t, hash)

		c.logger.Info().Str("hash", hash).Str("dest", dest).Msg("builtin torrent client: Added magnet")
	}

	return nil
}

func (c *Client) RemoveTorrents(hashes []string, deleteData bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, hash := range hashes {
		c.cancelSeedTimer(hash)

		if t, ok := c.activeTorrents[hash]; ok {
			if deleteData {
				var paths []string
				if info := t.Info(); info != nil {
					for _, f := range t.Files() {
						paths = append(paths, filepath.Join(c.downloadDir, f.Path()))
					}
				}
				t.Drop()
				for _, p := range paths {
					_ = os.RemoveAll(p)
				}
			} else {
				t.Drop()
			}
			delete(c.activeTorrents, hash)
			delete(c.speedTracker, hash)
		}
		delete(c.inactiveTorrents, hash)

		if c.db != nil {
			if err := c.db.DeleteBuiltinTorrentItemByHash(hash); err != nil {
				c.logger.Warn().Err(err).Str("hash", hash).Msg("builtin torrent client: Failed to delete torrent from DB")
			}
		}

		c.logger.Info().Str("hash", hash).Msg("builtin torrent client: Removed torrent")
	}

	return nil
}

func (c *Client) PauseTorrents(hashes []string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, hash := range hashes {
		c.cancelSeedTimer(hash)

		if t, ok := c.activeTorrents[hash]; ok {
			name := t.Name()
			magnet := ""
			downloadDir := c.downloadDir
			if c.db != nil {
				if dbItem, err := c.db.GetBuiltinTorrentItemByHash(hash); err == nil && dbItem != nil {
					magnet = dbItem.Magnet
					if dbItem.DownloadDir != "" {
						downloadDir = dbItem.DownloadDir
					}
				}
			}

			t.Drop()
			delete(c.activeTorrents, hash)
			delete(c.speedTracker, hash)

			c.inactiveTorrents[hash] = inactiveEntry{
				magnet:      magnet,
				name:        name,
				downloadDir: downloadDir,
				status:      StatusPaused,
			}

			if c.db != nil {
				_ = c.db.UpdateBuiltinTorrentStatus(hash, StatusPaused)
			}

			c.logger.Info().Str("hash", hash).Msg("builtin torrent client: Paused torrent")
		}
	}

	return nil
}

func (c *Client) ResumeTorrents(hashes []string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if err := c.initialize(); err != nil {
		return err
	}

	for _, hash := range hashes {
		if entry, ok := c.inactiveTorrents[hash]; ok {
			if entry.magnet == "" {
				c.logger.Warn().Str("hash", hash).Msg("builtin torrent client: No magnet stored for paused torrent, cannot resume")
				continue
			}

			t, err := c.addMagnetInternal(entry.magnet, entry.downloadDir)
			if err != nil {
				c.logger.Error().Err(err).Str("hash", hash).Msg("builtin torrent client: Failed to resume torrent")
				continue
			}

			c.activeTorrents[hash] = t
			delete(c.inactiveTorrents, hash)

			if c.db != nil {
				_ = c.db.UpdateBuiltinTorrentStatus(hash, StatusDownloading)
			}

			go c.watchAndStopSeeding(t, hash)

			c.logger.Info().Str("hash", hash).Msg("builtin torrent client: Resumed torrent")
		}
	}

	return nil
}

func (c *Client) GetFiles(hash string) ([]string, error) {
	c.mu.RLock()
	t, ok := c.activeTorrents[hash]
	c.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("builtin torrent client: Torrent %s not found", hash)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	select {
	case <-t.GotInfo():
	case <-ctx.Done():
		return nil, fmt.Errorf("builtin torrent client: Timeout waiting for torrent info")
	}

	files := t.Files()
	result := make([]string, 0, len(files))
	for _, f := range files {
		result = append(result, f.Path())
	}

	return result, nil
}

func (c *Client) Shutdown() {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, cancel := range c.seedTimerCancels {
		cancel()
	}
	c.seedTimerCancels = make(map[string]context.CancelFunc)

	if c.torrentClient != nil {
		c.torrentClient.Close()
		c.torrentClient = nil
	}
}
