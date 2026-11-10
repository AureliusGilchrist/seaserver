package onlinestream_download

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/connectivity"
	"seanime/internal/events"
	"seanime/internal/onlinestream"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

const (
	// QueueUpdatedEvent carries the queue summary (see summary.go) whenever the queue changes.
	QueueUpdatedEvent = "onlinestream-download-queue-updated"

	progressEventInterval = 500 * time.Millisecond
	// keepFinished is how many finished items stay visible in the queue.
	keepFinished = 200
	// keepHistory is how many completed downloads the Downloaded list remembers.
	keepHistory = 5000
)

type Status string

const (
	StatusQueued      Status = "queued"
	StatusFetching    Status = "fetching"
	StatusDownloading Status = "downloading"
	StatusMuxing      Status = "muxing"
	StatusRegistering Status = "registering"
	StatusCompleted   Status = "completed"
	StatusFailed      Status = "failed"
	StatusCancelled   Status = "cancelled"
)

// Request is what the client asks to download: an episode, and the provider/server/quality the
// online player had selected.
// The download queue is two queues: the user's own downloads and the en masse downloader's. The
// worker takes them a series at a time, in turn: one en masse series, then one personal, and so
// on, so neither waits on the other's whole backlog.
const (
	QueuePersonal = "personal"
	QueueEnMasse  = "enmasse"
)

// normalizeQueue maps a queue name to one of the two queues; anything else (including items
// saved before the queues existed) is personal.
func normalizeQueue(q string) string {
	if q == QueueEnMasse {
		return QueueEnMasse
	}
	return QueuePersonal
}

type Request struct {
	MediaId       int    `json:"mediaId"`
	EpisodeNumber int    `json:"episodeNumber"`
	Provider      string `json:"provider"`
	Dubbed        bool   `json:"dubbed"`
	Server        string `json:"server,omitempty"`
	Quality       string `json:"quality,omitempty"`
	// SourceURL identifies the exact video source the player was playing, when known.
	SourceURL string `json:"sourceUrl,omitempty"`
	// SubtitleLanguage is the subtitle the player was showing; it becomes the default track.
	SubtitleLanguage string `json:"subtitleLanguage,omitempty"`
	// Overwrite replaces the episode's files already in the library. Without it, an episode the
	// library has is not downloaded again.
	Overwrite bool `json:"overwrite,omitempty"`
	// Queue is QueuePersonal (the default) or QueueEnMasse.
	Queue string `json:"queue,omitempty"`
}

// Item is one download in the queue as the client sees it.
type Item struct {
	ID            string `json:"id"`
	MediaId       int    `json:"mediaId"`
	EpisodeNumber int    `json:"episodeNumber"`
	EpisodeTitle  string `json:"episodeTitle,omitempty"`
	Provider      string `json:"provider"`
	Server        string `json:"server,omitempty"`
	Quality       string `json:"quality,omitempty"`
	Dubbed        bool   `json:"dubbed"`
	Title         string `json:"title"`
	Image         string `json:"image,omitempty"`
	Banner        string `json:"banner,omitempty"`
	Status        Status `json:"status"`
	// Queue is the queue the episode is in: QueuePersonal or QueueEnMasse.
	Queue string `json:"queue"`
	// Phase names the stream being downloaded: "Japanese", then "English dub" for dual audio.
	Phase string `json:"phase,omitempty"`
	// AudioTracks lists the file audio languages in order, Japanese first.
	AudioTracks   []string   `json:"audioTracks,omitempty"`
	Progress      float64    `json:"progress"` // 0..1 within the current status
	SegmentsDone  int        `json:"segmentsDone"`
	SegmentsTotal int        `json:"segmentsTotal"`
	Bytes         int64      `json:"bytes"`
	Speed         float64    `json:"speed"`      // bytes per second while downloading
	EtaSeconds    int        `json:"etaSeconds"` // estimated time left in the download step
	SubtitleCount int        `json:"subtitleCount"`
	Hardsubbed    bool       `json:"hardsubbed"`
	Warnings      []string   `json:"warnings,omitempty"`
	Error         string     `json:"error,omitempty"`
	Destination   string     `json:"destination,omitempty"`
	Attempts      int        `json:"attempts"`
	CreatedAt     time.Time  `json:"createdAt"`
	StartedAt     *time.Time `json:"startedAt,omitempty"`
	FinishedAt    *time.Time `json:"finishedAt,omitempty"`
	Req           Request    `json:"request"`

	cancel context.CancelFunc
	// stopping marks a cancel that comes from Stop: the item goes back to the queue and keeps its
	// downloaded segments, instead of ending as cancelled.
	stopping bool
	// dropWhenDone takes the item out of the queue once its run ends (its series was removed
	// while it was downloading).
	dropWhenDone bool
	phaseBase    float64   // episode progress before the current stream (0, or 0.5 during the dub)
	phaseWeight  float64   // share of the episode progress the current stream covers
	retryAt      time.Time // an automatic retry waits until then
	bytesBase    int64     // bytes of the streams already done in this download (the Japanese one, during the dub)
	rateAt       time.Time
	rateBytes    int64
	downloadAt   time.Time
}

// HistoryEntry is a finished download, kept for the Downloaded list.
type HistoryEntry struct {
	MediaId       int       `json:"mediaId"`
	EpisodeNumber int       `json:"episodeNumber"`
	Title         string    `json:"title"`
	Image         string    `json:"image,omitempty"`
	Provider      string    `json:"provider"`
	Destination   string    `json:"destination"`
	Bytes         int64     `json:"bytes"`
	SubtitleCount int       `json:"subtitleCount"`
	CompletedAt   time.Time `json:"completedAt"`
}

// QueueState is what the queue event and endpoint return.
type QueueState struct {
	Paused bool    `json:"paused"`
	Items  []*Item `json:"items"`
	// Blocked says why downloads are waiting on the server's disk (read-only, full), if they are.
	Blocked string `json:"blocked,omitempty"`
}

// RegisterFunc files a finished download in the library database, matched to its media and
// episode.
type RegisterFunc func(mediaId int, episode int, path string) error

type NewManagerOptions struct {
	// EpisodeGap is the pause between episodes: 0 for the default, negative for none.
	EpisodeGap time.Duration
	// holdQueue keeps a restored queue from starting (tests).
	holdQueue bool

	Logger         *zerolog.Logger
	WSEventManager events.WSEventManagerInterface
	Repository     *onlinestream.Repository
	// WorkDir holds the segments of the episodes being downloaded.
	WorkDir string
	// StatePath is the JSON file the queue and history are kept in, so a restart (the nightly
	// update) resumes the queue instead of losing it.
	StatePath string
	// LibraryPath returns the library folder downloads go into.
	LibraryPath func() string
	// Destination returns the folder and file name (with the .mkv extension) the episode is filed
	// under — the same place and name a matched download from the Unmatched screen gets.
	Destination func(media *anilist.BaseAnime, episode int) (dir string, name string)
	// FfmpegPath returns the ffmpeg binary to use.
	FfmpegPath func() string
	// FfprobePath returns the ffprobe binary to use.
	FfprobePath func() string
	Register    RegisterFunc
	// EpisodeFiles lists the library files of an anime episode (any source, any name).
	EpisodeFiles func(mediaId int, episode int) []string
	// ReplaceOld removes an episode's other library files after an overwrite saved its new one
	// at keepPath: their library entries and the files themselves.
	ReplaceOld func(mediaId int, episode int, keepPath string) error
	// MapProvider makes sure a provider knows which of its entries an anime is (searching every
	// title and spelling and saving the match). It returns ErrNotOnProvider when the provider
	// does not have the anime.
	MapProvider func(ctx context.Context, provider string, mediaId int) error
	// SeriesFailing is told about an en masse series none of whose episodes download (several
	// failed, none completed), once; it may take the series out and get it another way.
	SeriesFailing func(mediaId int)
	// LibraryFileOwner reports the anime and episode a file is matched to in the library, if any.
	LibraryFileOwner func(path string) (mediaId int, episode int, found bool)
}

type Manager struct {
	opts   NewManagerOptions
	logger *zerolog.Logger
	client *RateLimitedClient

	mu        sync.Mutex
	items     []*Item
	history   []*HistoryEntry
	paused    bool
	wake      chan struct{}
	lastEvent time.Time
	started   sync.Once
	saveMu    sync.Mutex
	// rev counts structural changes; see QueueSummary.Rev.
	rev int64
	// blocked is set while downloads wait on the disk (see checkStorage).
	blocked string
	// curQueue and curMedia are the queue and series the worker is on. It finishes the series,
	// then turns to the other queue.
	curQueue string
	curMedia int
	// failingReported are the series already handed to SeriesFailing.
	failingReported map[int]bool

	// processOverride, when set (tests), replaces the download of one episode.
	// checkSourceOverride replaces checkSeriesSource (tests).
	checkSourceOverride func(ctx context.Context, req Request) error
	processOverride     func(ctx context.Context, it *Item, workDir string) (string, error)

	// onProgress, when set (tests), sees every progress value an item takes.
	onProgress func(p float64)
}

type persistedState struct {
	Paused  bool            `json:"paused"`
	Items   []*Item         `json:"items"`
	History []*HistoryEntry `json:"history"`
}

func NewManager(opts NewManagerOptions) *Manager {
	m := &Manager{
		opts:   opts,
		logger: opts.Logger,
		client: NewRateLimitedClient(),
		wake:   make(chan struct{}, 1),
	}
	m.load()
	m.cleanOrphanWorkDirs()

	m.mu.Lock()
	resume := !m.paused && m.hasQueuedLocked() && !opts.holdQueue
	m.mu.Unlock()
	if resume {
		m.ensureWorker()
		m.signal()
	}
	return m
}

func (m *Manager) load() {
	if m.opts.StatePath == "" {
		return
	}
	b, err := os.ReadFile(m.opts.StatePath)
	if err != nil {
		return
	}
	var st persistedState
	if err := json.Unmarshal(b, &st); err != nil {
		m.logger.Warn().Err(err).Msg("onlinestream download: Could not read the saved queue")
		return
	}
	for _, it := range st.Items {
		if it == nil {
			continue
		}
		// Series skipped by earlier versions stayed in the queue as cancelled; they go.
		if it.Status == StatusCancelled && strings.HasPrefix(it.Error, "Skipped: ") {
			continue
		}
		// Items from before the two queues existed belong to the personal one.
		it.Queue = normalizeQueue(it.Queue)
		// Whatever was running when the server stopped goes back to the queue.
		if !it.finished() && it.Status != StatusQueued {
			it.Status = StatusQueued
			it.Speed, it.EtaSeconds = 0, 0
		}
		m.items = append(m.items, it)
	}
	m.history = st.History
	// A Stop does not outlive the server: the queue exists to download what is in it, and a
	// restart (the nightly update) silently leaving it paused is how it sat idle for minutes.
	m.paused = false
	waiting := 0
	for _, it := range m.items {
		if it.Status == StatusQueued {
			waiting++
		}
	}
	m.logger.Info().Int("items", len(m.items)).Int("waiting", waiting).Str("file", m.opts.StatePath).
		Msg("onlinestream download: Restored the download queue")
}

// save writes the queue to disk. Progress is not worth a write; state changes are.
func (m *Manager) save() {
	if m.opts.StatePath == "" {
		return
	}
	m.mu.Lock()
	b, err := json.Marshal(persistedState{Paused: m.paused, Items: m.items, History: m.history})
	m.mu.Unlock()
	if err != nil {
		return
	}
	m.saveMu.Lock()
	defer m.saveMu.Unlock()
	_ = os.MkdirAll(filepath.Dir(m.opts.StatePath), 0o755)
	tmp := m.opts.StatePath + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		m.logger.Warn().Err(err).Msg("onlinestream download: Could not save the queue")
		return
	}
	_ = os.Rename(tmp, m.opts.StatePath)
}

func (m *Manager) cleanOrphanWorkDirs() {
	entries, err := os.ReadDir(m.opts.WorkDir)
	if err != nil {
		return
	}
	m.mu.Lock()
	known := make(map[string]bool, len(m.items))
	for _, it := range m.items {
		if !it.finished() || it.Status == StatusFailed {
			known[it.ID] = true
		}
	}
	m.mu.Unlock()
	for _, e := range entries {
		if !e.IsDir() || known[e.Name()] {
			continue
		}
		// Only folders nothing has written to for a while. A folder this queue does not know can
		// still be in use by another server process on the same cache (a restart that overlaps
		// the old process); deleting it pulled a running download's files out from under it.
		info, err := e.Info()
		if err != nil || time.Since(info.ModTime()) < staleWorkDirAge {
			continue
		}
		_ = os.RemoveAll(filepath.Join(m.opts.WorkDir, e.Name()))
	}
}

// staleWorkDirAge is how long a work folder no queue item owns must sit untouched before it is
// treated as left over and removed.
const staleWorkDirAge = 6 * time.Hour

// storageRetryDelay is how often a queue waiting on the disk checks it again.
const storageRetryDelay = time.Minute

// maxAutoAttempts is how many times an episode is tried before a failure is left for the user.
const maxAutoAttempts = 3

// finalError marks a failure that retrying cannot fix (the file is already in the library, the
// stream is DRM-protected), so the episode is not retried automatically.
type finalError struct{ error }

func (e finalError) Unwrap() error { return e.error }

func isFinal(err error) bool {
	var f finalError
	return errors.As(err, &f)
}

func (m *Manager) workDirFor(it *Item) string { return filepath.Join(m.opts.WorkDir, it.ID) }

func (m *Manager) ensureWorker() { m.started.Do(func() { go m.worker() }) }

// changed saves the queue and tells clients right away.
func (m *Manager) changed() {
	m.save()
	m.emit(true)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Enqueue adds a download to the end of the queue.
func (m *Manager) Enqueue(ctx context.Context, req Request) (*Item, error) {
	items, err := m.enqueueMany(ctx, []Request{req}, nil)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("episode %d is already in the download queue", req.EpisodeNumber)
	}
	return items[0], nil
}

// enqueueMany adds downloads for one media. Episodes already waiting or running are skipped.
func (m *Manager) enqueueMany(ctx context.Context, reqs []Request, titles map[int]string) ([]*Item, error) {
	if len(reqs) == 0 {
		return nil, nil
	}
	first := reqs[0]
	if first.MediaId <= 0 || first.Provider == "" {
		return nil, errors.New("missing media or provider")
	}
	if m.opts.LibraryPath() == "" {
		return nil, errors.New("set a library folder in the settings first")
	}
	media, err := m.opts.Repository.GetMedia(ctx, first.MediaId)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	out := make([]*Item, 0, len(reqs))
	for _, req := range reqs {
		if req.EpisodeNumber < 0 || m.activeLocked(req.MediaId, req.EpisodeNumber) != nil {
			continue
		}
		it := &Item{
			ID:            uuid.NewString(),
			MediaId:       req.MediaId,
			EpisodeNumber: req.EpisodeNumber,
			EpisodeTitle:  titles[req.EpisodeNumber],
			Provider:      req.Provider,
			Server:        req.Server,
			Quality:       req.Quality,
			Dubbed:        req.Dubbed,
			Title:         mediaTitle(media),
			Image:         media.GetCoverImageSafe(),
			Banner:        media.GetBannerImageSafe(),
			Status:        StatusQueued,
			Queue:         normalizeQueue(req.Queue),
			CreatedAt:     time.Now(),
			Req:           req,
		}
		// A finished item for the same episode would show twice; the new one replaces it.
		m.removeFinishedLocked(req.MediaId, req.EpisodeNumber)
		m.items = append(m.items, it)
		out = append(out, it)
	}
	m.mu.Unlock()

	if len(out) > 0 {
		m.mu.Lock()
		m.paused = false // adding episodes starts the queue
		m.mu.Unlock()
		m.ensureWorker()
		m.signal()
		m.changed()
	}
	return out, nil
}

// SeriesResult reports what a full-series request did.
type SeriesResult struct {
	Queued  []*Item `json:"queued"`
	Skipped []int   `json:"skipped"` // episodes in the library or already queued
	Total   int     `json:"total"`   // episodes the provider lists
	// Provider is the provider the series was queued from (set when it was picked automatically).
	Provider string `json:"provider,omitempty"`
}

// EnqueueSeries queues every episode the provider lists for the media. inLibrary reports
// episodes that are already downloaded, which are skipped unless includeExisting is set.
func (m *Manager) EnqueueSeries(ctx context.Context, base Request, inLibrary func(ep int) bool, overwrite map[int]bool) (*SeriesResult, error) {
	media, err := m.opts.Repository.GetMedia(ctx, base.MediaId)
	if err != nil {
		return nil, err
	}
	episodes, err := m.opts.Repository.GetMediaEpisodes(base.Provider, media, base.Dubbed)
	if err != nil {
		return nil, err
	}
	if len(episodes) == 0 {
		return nil, errors.New("the provider lists no episodes for this anime")
	}

	seen := make(map[int]bool)
	numbers := make([]int, 0, len(episodes))
	titles := make(map[int]string)
	for _, ep := range episodes {
		if ep == nil || seen[ep.Number] {
			continue
		}
		seen[ep.Number] = true
		numbers = append(numbers, ep.Number)
		titles[ep.Number] = ep.Title
	}
	sort.Ints(numbers)

	res := &SeriesResult{Total: len(numbers), Skipped: []int{}}
	reqs := make([]Request, 0, len(numbers))
	m.mu.Lock()
	for _, n := range numbers {
		if m.activeLocked(base.MediaId, n) != nil || (!overwrite[n] && inLibrary != nil && inLibrary(n)) {
			res.Skipped = append(res.Skipped, n)
			continue
		}
		r := base
		r.EpisodeNumber = n
		r.SourceURL = ""
		r.Overwrite = overwrite[n]
		reqs = append(reqs, r)
	}
	m.mu.Unlock()

	// A series whose episodes cannot be fetched from the provider or a fallback (Kickassanime,
	// AniZone, AnimeHeaven, AnimePahe) never
	// reaches the queue.
	if len(reqs) > 0 {
		if err := m.checkSeriesSource(ctx, reqs[0], media); err != nil {
			return nil, err
		}
	}

	res.Queued, err = m.enqueueMany(ctx, reqs, titles)
	if err != nil {
		return nil, err
	}
	if res.Queued == nil {
		res.Queued = []*Item{}
	}
	return res, nil
}

func (m *Manager) activeLocked(mediaId, ep int) *Item {
	for _, it := range m.items {
		if it.MediaId == mediaId && it.EpisodeNumber == ep && !it.finished() {
			return it
		}
	}
	return nil
}

func (m *Manager) removeFinishedLocked(mediaId, ep int) {
	kept := m.items[:0]
	for _, it := range m.items {
		if it.MediaId == mediaId && it.EpisodeNumber == ep && it.finished() {
			_ = os.RemoveAll(m.workDirFor(it))
			continue
		}
		kept = append(kept, it)
	}
	m.items = kept
}

func (m *Manager) hasQueuedLocked() bool {
	for _, it := range m.items {
		if it.Status == StatusQueued {
			return true
		}
	}
	return false
}

func (m *Manager) find(id string) *Item {
	for _, it := range m.items {
		if it.ID == id {
			return it
		}
	}
	return nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Start resumes the queue.
func (m *Manager) Start() {
	m.mu.Lock()
	m.paused = false
	m.mu.Unlock()
	m.ensureWorker()
	m.signal()
	m.changed()
}

// Stop pauses the queue. The running episode goes back to the front of the queue and keeps its
// downloaded segments, so Start carries on where it left off.
func (m *Manager) Stop() {
	m.mu.Lock()
	m.paused = true
	for _, it := range m.items {
		if it.cancel != nil {
			it.stopping = true
			it.cancel()
			// Shown as waiting right away; a provider call that ignores cancellation can take a
			// moment to return, and the worker picks nothing else up until it does.
			it.Status = StatusQueued
			it.Progress = 0
			it.Speed, it.EtaSeconds = 0, 0
		}
	}
	m.mu.Unlock()
	m.changed()
}

// Cancel stops a running download or a queued one; it stays in the list as cancelled.
func (m *Manager) Cancel(id string) bool {
	m.mu.Lock()
	it := m.find(id)
	if it == nil || it.finished() {
		m.mu.Unlock()
		return false
	}
	if it.cancel != nil {
		it.cancel()
	}
	it.Status = StatusCancelled
	m.mu.Unlock()
	m.changed()
	return true
}

// Remove takes an item out of the list, cancelling it first if it is running.
func (m *Manager) Remove(id string) bool {
	m.mu.Lock()
	idx := -1
	for i, it := range m.items {
		if it.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		m.mu.Unlock()
		return false
	}
	it := m.items[idx]
	if it.cancel != nil {
		it.cancel()
	}
	it.Status = StatusCancelled
	m.items = append(m.items[:idx], m.items[idx+1:]...)
	m.mu.Unlock()
	if it.cancel == nil {
		_ = os.RemoveAll(m.workDirFor(it))
	}
	m.changed()
	return true
}

// Retry puts a failed or cancelled item back in the queue.
func (m *Manager) Retry(id string) bool {
	m.mu.Lock()
	it := m.find(id)
	ok := it != nil && (it.Status == StatusFailed || it.Status == StatusCancelled)
	if ok {
		resetForQueue(it)
		m.paused = false
	}
	m.mu.Unlock()
	if ok {
		m.ensureWorker()
		m.signal()
		m.changed()
	}
	return ok
}

// RetryMedia puts the failed and cancelled episodes of one anime back in the queue.
func (m *Manager) RetryMedia(mediaId int) int {
	m.mu.Lock()
	n := 0
	for _, it := range m.items {
		if it.MediaId == mediaId && (it.Status == StatusFailed || it.Status == StatusCancelled) {
			resetForQueue(it)
			n++
		}
	}
	if n > 0 {
		m.paused = false
	}
	m.mu.Unlock()
	if n > 0 {
		m.ensureWorker()
		m.signal()
		m.changed()
	}
	return n
}

// ResetErrored puts every failed item back in the queue.
func (m *Manager) ResetErrored() int {
	m.mu.Lock()
	n := 0
	for _, it := range m.items {
		if it.Status == StatusFailed {
			resetForQueue(it)
			n++
		}
	}
	if n > 0 {
		m.paused = false
	}
	m.mu.Unlock()
	if n > 0 {
		m.ensureWorker()
		m.signal()
		m.changed()
	}
	return n
}

func resetForQueue(it *Item) {
	it.Status = StatusQueued
	it.retryAt = time.Time{}
	it.Error = ""
	it.Progress = 0
	it.Speed, it.EtaSeconds = 0, 0
	it.FinishedAt = nil
}

// MoveToTop makes a queued item the next one to download.
func (m *Manager) MoveToTop(id string) bool {
	m.mu.Lock()
	idx := -1
	for i, it := range m.items {
		if it.ID == id && it.Status == StatusQueued {
			idx = i
			break
		}
	}
	if idx < 0 {
		m.mu.Unlock()
		return false
	}
	it := m.items[idx]
	rest := append(append([]*Item{}, m.items[:idx]...), m.items[idx+1:]...)
	// After whatever is running, before every other queued item.
	pos := 0
	for pos < len(rest) && rest[pos].Status != StatusQueued {
		pos++
	}
	m.items = append(append(append([]*Item{}, rest[:pos]...), it), rest[pos:]...)
	m.mu.Unlock()
	m.changed()
	return true
}

// ClearFinished drops completed, failed and cancelled items from the list.
func (m *Manager) ClearFinished() {
	m.clearWhere(func(it *Item) bool { return it.finished() })
}

// ClearAll drops everything except the episode being downloaded right now.
func (m *Manager) ClearAll() {
	m.clearWhere(func(it *Item) bool { return it.cancel == nil })
}

// ClearMedia drops the waiting and finished items of one anime.
// RemoveSeries takes an anime out of the queue altogether: its waiting and finished episodes
// go now, the one downloading is stopped and goes when it has.
func (m *Manager) RemoveSeries(mediaId int) {
	m.mu.Lock()
	for _, it := range m.items {
		if it.MediaId == mediaId && it.cancel != nil {
			it.cancel()
			it.Status = StatusCancelled
			it.dropWhenDone = true
		}
	}
	m.mu.Unlock()
	m.clearWhere(func(it *Item) bool { return it.MediaId == mediaId && it.cancel == nil })
}

func (m *Manager) ClearMedia(mediaId int) {
	m.clearWhere(func(it *Item) bool { return it.MediaId == mediaId && it.cancel == nil })
}

func (m *Manager) clearWhere(drop func(it *Item) bool) {
	m.mu.Lock()
	kept := make([]*Item, 0, len(m.items))
	for _, it := range m.items {
		if drop(it) {
			_ = os.RemoveAll(m.workDirFor(it))
			continue
		}
		kept = append(kept, it)
	}
	m.items = kept
	m.mu.Unlock()
	m.changed()
}

// GetQueue returns a snapshot of the queue.
func (m *Manager) GetQueue() *QueueState {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked()
}

// GetHistory returns the completed downloads, newest first.
func (m *Manager) GetHistory() []*HistoryEntry {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*HistoryEntry, len(m.history))
	for i, h := range m.history {
		out[len(m.history)-1-i] = h
	}
	return out
}

func (m *Manager) snapshotLocked() *QueueState {
	out := make([]*Item, 0, len(m.items))
	for _, it := range m.items {
		c := *it
		c.Warnings = append([]string(nil), it.Warnings...)
		c.cancel = nil
		out = append(out, &c)
	}
	return &QueueState{Paused: m.paused, Items: out, Blocked: m.blocked}
}

func (it *Item) finished() bool {
	return it.Status == StatusCompleted || it.Status == StatusFailed || it.Status == StatusCancelled
}

func (m *Manager) signal() {
	select {
	case m.wake <- struct{}{}:
	default:
	}
}

// emit sends the queue summary to clients after a change of state.
func (m *Manager) emit(force bool) {
	if m.opts.WSEventManager == nil {
		return
	}
	m.mu.Lock()
	m.rev++
	summary := m.summaryLocked()
	m.mu.Unlock()
	m.opts.WSEventManager.SendEvent(QueueUpdatedEvent, summary)
}

// emitProgress sends just the episode downloading now, a few times a second at most: the
// summary stays put while bytes come in.
func (m *Manager) emitProgress(it *Item) {
	if m.opts.WSEventManager == nil {
		return
	}
	m.mu.Lock()
	if time.Since(m.lastEvent) < progressEventInterval {
		m.mu.Unlock()
		return
	}
	m.lastEvent = time.Now()
	c := copyItem(it)
	m.mu.Unlock()
	m.opts.WSEventManager.SendEvent(ProgressEvent, c)
}

func (m *Manager) update(it *Item, fn func(it *Item), force bool) {
	m.mu.Lock()
	// A stopped or cancelled item keeps the state Stop/Cancel gave it while its run winds down.
	if it.stopping || it.Status == StatusCancelled {
		m.mu.Unlock()
		return
	}
	fn(it)
	p := it.Progress
	m.mu.Unlock()
	if m.onProgress != nil {
		m.onProgress(p)
	}
	if force {
		m.emit(true)
	} else {
		m.emitProgress(it)
	}
}

// trackRate updates the speed (smoothed) and the time left from the item's byte count and
// progress. Called with m.mu held.
func (it *Item) trackRate(now time.Time) {
	if it.downloadAt.IsZero() {
		it.downloadAt = now
		it.rateAt, it.rateBytes = now, it.Bytes
		return
	}
	if dt := now.Sub(it.rateAt).Seconds(); dt >= 1 {
		inst := float64(it.Bytes-it.rateBytes) / dt
		if it.Speed == 0 {
			it.Speed = inst
		} else {
			it.Speed = it.Speed*0.7 + inst*0.3
		}
		it.rateAt, it.rateBytes = now, it.Bytes
	}
	if it.Progress > 0.01 {
		elapsed := now.Sub(it.downloadAt).Seconds()
		it.EtaSeconds = int(elapsed / it.Progress * (1 - it.Progress))
	}
}

// worker runs the queue one episode at a time.
func (m *Manager) worker() {
	// The timer is a safety net: whatever is waiting gets picked up within a minute even if a
	// signal was missed, so an item never sits in the queue with nothing downloading it.
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for {
		it := m.nextQueued()
		if it == nil {
			select {
			case <-m.wake:
			case <-tick.C:
			}
			continue
		}
		m.runSafely(it)
		m.trimFinished()
		// A breather between episodes: a series queued whole (or a whole catalogue, by the en
		// masse downloader) is still one provider being asked for episode after episode.
		if gap := m.episodeGap(); gap > 0 {
			t := time.NewTimer(gap)
			<-t.C
		}
	}
}

// offlineMessage is what the queue says while there is no internet connection.
const offlineMessage = "No internet connection: downloads wait until it is back"

// offlineRetryDelay is how often a waiting episode looks for the connection again.
var offlineRetryDelay = 15 * time.Second

// defaultEpisodeGap is the pause between two episode downloads.
const defaultEpisodeGap = 15 * time.Second

func (m *Manager) episodeGap() time.Duration {
	switch {
	case m.opts.EpisodeGap < 0:
		return 0
	case m.opts.EpisodeGap == 0:
		return defaultEpisodeGap
	}
	return m.opts.EpisodeGap
}

// runSafely runs one episode. A panic fails that episode instead of ending the worker, which
// would leave the rest of the queue waiting until the server restarts.
func (m *Manager) runSafely(it *Item) {
	defer func() {
		if r := recover(); r != nil {
			m.logger.Error().Interface("panic", r).Int("mediaId", it.MediaId).Int("episode", it.EpisodeNumber).
				Msg("onlinestream download: Crashed while downloading; the episode is marked failed")
			m.mu.Lock()
			now := time.Now()
			it.cancel = nil
			it.Status = StatusFailed
			it.Error = fmt.Sprintf("internal error: %v", r)
			it.FinishedAt = &now
			m.mu.Unlock()
			m.changed()
		}
	}()
	m.run(it)
}

func (m *Manager) nextQueued() *Item {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.paused {
		return nil
	}
	return m.pickLocked(time.Now())
}

// pickLocked chooses the next episode: the rest of the series the worker is on, then the first
// waiting series of the other queue, so the two queues take turns a series at a time (en masse
// first). A queue with nothing waiting is passed over.
func (m *Manager) pickLocked(now time.Time) *Item {
	ready := func(it *Item) bool { return it.Status == StatusQueued && !now.Before(it.retryAt) }

	if m.curMedia != 0 {
		for _, it := range m.items {
			if ready(it) && it.MediaId == m.curMedia && normalizeQueue(it.Queue) == m.curQueue {
				return it
			}
		}
	}
	other := QueueEnMasse
	if m.curQueue == QueueEnMasse {
		other = QueuePersonal
	}
	for _, q := range []string{other, normalizeQueue(m.curQueue)} {
		for _, it := range m.items {
			if ready(it) && normalizeQueue(it.Queue) == q {
				m.curQueue, m.curMedia = q, it.MediaId
				return it
			}
		}
	}
	return nil
}

func (m *Manager) trimFinished() {
	m.mu.Lock()
	finished := 0
	for i := len(m.items) - 1; i >= 0; i-- {
		if m.items[i].finished() {
			finished++
			if finished > keepFinished {
				m.items = append(m.items[:i], m.items[i+1:]...)
			}
		}
	}
	if len(m.history) > keepHistory {
		m.history = m.history[len(m.history)-keepHistory:]
	}
	m.mu.Unlock()
}

func (m *Manager) run(it *Item) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// The disk first: an episode started on a read-only or full disk only fails, and the next
	// one after it, until the whole queue is failed. Waiting keeps them all.
	if problem := m.checkStorage(); problem != "" {
		m.mu.Lock()
		changed := m.blocked != problem
		m.blocked = problem
		it.retryAt = time.Now().Add(storageRetryDelay)
		m.mu.Unlock()
		if changed {
			m.logger.Warn().Str("reason", problem).Msg("onlinestream download: Waiting for the disk")
			m.changed()
		}
		return
	}

	// No internet: nothing can download. The episode waits (without using up an attempt) and the
	// queue says why, until the connection is back.
	if connectivity.IsOffline() {
		m.mu.Lock()
		changed := m.blocked != offlineMessage
		m.blocked = offlineMessage
		it.retryAt = time.Now().Add(offlineRetryDelay)
		m.mu.Unlock()
		if changed {
			m.logger.Warn().Msg("onlinestream download: No internet connection; downloads wait until it is back")
			m.changed()
		}
		return
	}

	m.mu.Lock()
	if it.Status != StatusQueued || m.paused { // cancelled or stopped while waiting
		m.mu.Unlock()
		return
	}
	cleared := m.blocked != ""
	m.blocked = ""
	if cleared {
		m.logger.Info().Msg("onlinestream download: The disk is writable again; downloads resume")
	}
	now := time.Now()
	it.cancel = cancel
	it.stopping = false
	it.Status = StatusFetching
	it.Error = ""
	it.Attempts++
	it.StartedAt = &now
	it.downloadAt = time.Time{}
	it.bytesBase = 0
	it.phaseBase, it.phaseWeight = 0, 1
	it.Phase = ""
	m.mu.Unlock()
	m.changed()

	workDir := m.workDirFor(it)
	process := m.process
	if m.processOverride != nil {
		process = m.processOverride
	}
	dest, err := process(ctx, it, workDir)
	if err != nil && connectivity.IsNetworkError(err) {
		connectivity.ReportNetworkFailure()
	}

	m.mu.Lock()
	it.cancel = nil
	it.Speed, it.EtaSeconds = 0, 0
	finishedAt := time.Now()
	keepWork := false
	switch {
	case it.stopping:
		// Stopped: back to the queue, segments kept for the resume.
		it.stopping = false
		it.Status = StatusQueued
		it.Progress = 0
		keepWork = true
	case ctx.Err() != nil || it.Status == StatusCancelled:
		it.Status = StatusCancelled
		it.FinishedAt = &finishedAt
	case isSkipSeries(err):
		// Neither provider has the series: this episode and the series' other waiting ones
		// leave the queue rather than each failing in turn, or sitting in it as skipped.
		it.Status = StatusCancelled
		it.Error = "Skipped: " + err.Error()
		it.FinishedAt = &finishedAt
		kept := m.items[:0]
		for _, other := range m.items {
			if other.MediaId == it.MediaId && (other == it || other.Status == StatusQueued) {
				if other != it {
					_ = os.RemoveAll(m.workDirFor(other))
				}
				continue
			}
			kept = append(kept, other)
		}
		m.items = kept
		m.logger.Warn().Int("mediaId", it.MediaId).Str("title", it.Title).Err(err).
			Msg("onlinestream download: Removed the series from the queue, no provider has it")
	case isStorageError(err):
		// The disk failed, not the download: back to the queue, without using up an attempt,
		// and the queue waits for the disk (checkStorage) before trying anything else.
		it.Status = StatusQueued
		it.Progress = 0
		it.Attempts--
		it.retryAt = finishedAt.Add(storageRetryDelay)
		m.blocked = storageMessage(m.opts.WorkDir, err)
		keepWork = true
	case err != nil && connectivity.IsNetworkError(err) && connectivity.IsOffline():
		// The connection dropped: back to the queue without using up an attempt, segments kept.
		it.stopping = false
		it.Status = StatusQueued
		it.Progress = 0
		it.Attempts--
		it.retryAt = finishedAt.Add(offlineRetryDelay)
		m.blocked = offlineMessage
		keepWork = true
	case err != nil && !isFinal(err) && it.Attempts < maxAutoAttempts:
		// Retried by itself after a pause, from the segments it already has: a dropped
		// connection or a provider hiccup should not need the user to press Retry.
		delay := time.Duration(it.Attempts) * 30 * time.Second
		it.Status = StatusQueued
		it.Progress = 0
		it.retryAt = finishedAt.Add(delay)
		it.Warnings = append(it.Warnings, fmt.Sprintf("Attempt %d failed (%v); retrying in %s.", it.Attempts, err, delay))
		keepWork = true
	case err != nil:
		it.Status = StatusFailed
		it.Error = err.Error()
		it.FinishedAt = &finishedAt
		// Out of attempts: the partial download goes, so failed episodes do not pile up on the
		// disk. A manual retry starts that episode over.
	default:
		it.Status = StatusCompleted
		it.Progress = 1
		it.Destination = dest
		it.FinishedAt = &finishedAt
		m.history = append(m.history, &HistoryEntry{
			MediaId:       it.MediaId,
			EpisodeNumber: it.EpisodeNumber,
			Title:         it.Title,
			Image:         it.Image,
			Provider:      it.Provider,
			Destination:   dest,
			Bytes:         it.Bytes,
			SubtitleCount: it.SubtitleCount,
			CompletedAt:   finishedAt,
		})
	}
	var finished *Item
	if it.Status == StatusCompleted || it.Status == StatusFailed {
		finished = copyItem(it)
	}
	if it.dropWhenDone {
		m.dropLocked(it)
	}
	failingSeries := 0
	if it.Status == StatusFailed && normalizeQueue(it.Queue) == QueueEnMasse && m.opts.SeriesFailing != nil && m.seriesFailingLocked(it.MediaId) {
		failingSeries = it.MediaId
	}
	m.mu.Unlock()
	if failingSeries > 0 {
		m.logger.Warn().Int("mediaId", failingSeries).Str("title", it.Title).
			Msg("onlinestream download: Every episode of this en masse series fails so far; handing it to the torrent fallback")
		go m.opts.SeriesFailing(failingSeries)
	}
	if !keepWork {
		_ = os.RemoveAll(workDir)
	}
	m.changed()
	if finished != nil && m.opts.WSEventManager != nil {
		m.opts.WSEventManager.SendEvent(FinishedEvent, finished)
	}

	if err != nil && ctx.Err() == nil {
		m.logger.Error().Err(err).Int("mediaId", it.MediaId).Int("episode", it.EpisodeNumber).
			Str("provider", it.Provider).Msg("onlinestream download: Failed")
	}
}

// HasActive reports whether an anime has episodes waiting or downloading.
func (m *Manager) HasActive(mediaId int) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, it := range m.items {
		if it.MediaId == mediaId && !it.finished() {
			return true
		}
	}
	return false
}

// WaitingCount is how many episodes are waiting or downloading.
func (m *Manager) WaitingCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, it := range m.items {
		if !it.finished() {
			n++
		}
	}
	return n
}

// WaitingSeriesCount is how many series have episodes waiting or downloading.
func (m *Manager) WaitingSeriesCount() int {
	return m.waitingSeries("")
}

// WaitingEnMasseSeries is how many en masse series have episodes waiting or downloading.
func (m *Manager) WaitingEnMasseSeries() int {
	return m.waitingSeries(QueueEnMasse)
}

// WaitingEnMasseEpisodes is how many en masse episodes are waiting or downloading.
func (m *Manager) WaitingEnMasseEpisodes() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, it := range m.items {
		if !it.finished() && normalizeQueue(it.Queue) == QueueEnMasse {
			n++
		}
	}
	return n
}

func (m *Manager) waitingSeries(queue string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	seen := make(map[int]bool)
	for _, it := range m.items {
		if !it.finished() && (queue == "" || normalizeQueue(it.Queue) == queue) {
			seen[it.MediaId] = true
		}
	}
	return len(seen)
}

// SeriesState counts an anime's episodes still waiting or downloading, and those that failed or
// were cancelled.
func (m *Manager) SeriesState(mediaId int) (active int, failed int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, it := range m.items {
		if it.MediaId != mediaId {
			continue
		}
		switch {
		case !it.finished():
			active++
		case it.Status == StatusFailed || it.Status == StatusCancelled:
			failed++
		}
	}
	return active, failed
}

// failingSeriesAfter is how many episodes of an en masse series must have failed (and none
// completed) for the series to go to the torrent fallback instead.
const failingSeriesAfter = 3

// seriesFailingLocked reports, once per series, an en masse series whose episodes all fail.
func (m *Manager) seriesFailingLocked(mediaId int) bool {
	if m.failingReported == nil {
		m.failingReported = map[int]bool{}
	}
	if m.failingReported[mediaId] {
		return false
	}
	failed, completed := 0, 0
	for _, x := range m.items {
		if x.MediaId != mediaId {
			continue
		}
		switch x.Status {
		case StatusFailed:
			failed++
		case StatusCompleted:
			completed++
		}
	}
	if failed >= failingSeriesAfter && completed == 0 {
		m.failingReported[mediaId] = true
		return true
	}
	return false
}

func (m *Manager) dropLocked(it *Item) {
	kept := m.items[:0]
	for _, x := range m.items {
		if x != it {
			kept = append(kept, x)
		}
	}
	m.items = kept
}
