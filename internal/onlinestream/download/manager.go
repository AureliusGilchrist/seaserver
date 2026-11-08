// Package onlinestream_download downloads an episode through an online streaming provider and
// files it in the library as a Matroska file with the stream's own subtitles as soft tracks.
//
// Every request goes through RateLimitedClient (per provider and host: limited concurrency, a
// minimum gap between requests, backoff and retry on 429/5xx), and the Manager runs one episode
// at a time, so a queue of downloads never hammers a provider.
package onlinestream_download

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/events"
	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	"seanime/internal/onlinestream"
	"seanime/internal/util"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

const (
	// QueueUpdatedEvent carries the whole queue whenever it changes.
	QueueUpdatedEvent = "onlinestream-download-queue-updated"

	progressEventInterval = 500 * time.Millisecond
	// keepFinished is how many finished items stay visible in the queue.
	keepFinished = 30
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
}

// Item is one download in the queue as the client sees it.
type Item struct {
	ID            string    `json:"id"`
	MediaId       int       `json:"mediaId"`
	EpisodeNumber int       `json:"episodeNumber"`
	Provider      string    `json:"provider"`
	Server        string    `json:"server,omitempty"`
	Quality       string    `json:"quality,omitempty"`
	Dubbed        bool      `json:"dubbed"`
	Title         string    `json:"title"`
	Image         string    `json:"image,omitempty"`
	Status        Status    `json:"status"`
	Progress      float64   `json:"progress"` // 0..1 within the current status
	SegmentsDone  int       `json:"segmentsDone"`
	SegmentsTotal int       `json:"segmentsTotal"`
	Bytes         int64     `json:"bytes"`
	SubtitleCount int       `json:"subtitleCount"`
	Hardsubbed    bool      `json:"hardsubbed"`
	Warnings      []string  `json:"warnings,omitempty"`
	Error         string    `json:"error,omitempty"`
	Destination   string    `json:"destination,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`

	req    Request
	cancel context.CancelFunc
}

// RegisterFunc files a finished download in the library database, matched to its media and
// episode.
type RegisterFunc func(mediaId int, episode int, path string) error

type NewManagerOptions struct {
	Logger         *zerolog.Logger
	WSEventManager events.WSEventManagerInterface
	Repository     *onlinestream.Repository
	// WorkDir holds the segments of the episode being downloaded.
	WorkDir string
	// LibraryPath returns the library folder downloads go into.
	LibraryPath func() string
	// ExistingFolder returns the folder that already holds this media's episodes, if any.
	ExistingFolder func(mediaId int) string
	// FfmpegPath returns the ffmpeg binary to use.
	FfmpegPath func() string
	Register   RegisterFunc
}

type Manager struct {
	opts   NewManagerOptions
	logger *zerolog.Logger
	client *RateLimitedClient

	mu        sync.Mutex
	items     []*Item
	wake      chan struct{}
	lastEvent time.Time
	started   sync.Once
}

func NewManager(opts NewManagerOptions) *Manager {
	return &Manager{
		opts:   opts,
		logger: opts.Logger,
		client: NewRateLimitedClient(),
		wake:   make(chan struct{}, 1),
	}
}

// Enqueue adds a download to the end of the queue.
func (m *Manager) Enqueue(ctx context.Context, req Request) (*Item, error) {
	if req.MediaId <= 0 || req.EpisodeNumber < 0 || req.Provider == "" {
		return nil, errors.New("missing media, episode or provider")
	}
	if m.opts.LibraryPath() == "" {
		return nil, errors.New("set a library folder in the settings first")
	}

	media, err := m.opts.Repository.GetMedia(ctx, req.MediaId)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	for _, it := range m.items {
		if it.MediaId == req.MediaId && it.EpisodeNumber == req.EpisodeNumber && !it.finished() {
			m.mu.Unlock()
			return nil, fmt.Errorf("episode %d is already in the download queue", req.EpisodeNumber)
		}
	}
	item := &Item{
		ID:            uuid.NewString(),
		MediaId:       req.MediaId,
		EpisodeNumber: req.EpisodeNumber,
		Provider:      req.Provider,
		Server:        req.Server,
		Quality:       req.Quality,
		Dubbed:        req.Dubbed,
		Title:         mediaTitle(media),
		Image:         media.GetCoverImageSafe(),
		Status:        StatusQueued,
		CreatedAt:     time.Now(),
		req:           req,
	}
	m.items = append(m.items, item)
	m.mu.Unlock()

	m.started.Do(func() { go m.worker() })
	m.signal()
	m.emit(true)
	return item, nil
}

// Cancel stops a running download or removes a queued one.
func (m *Manager) Cancel(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, it := range m.items {
		if it.ID != id || it.finished() {
			continue
		}
		if it.cancel != nil {
			it.cancel()
		}
		it.Status = StatusCancelled
		go m.emit(true)
		return true
	}
	return false
}

// ClearFinished drops completed, failed and cancelled items from the list.
func (m *Manager) ClearFinished() {
	m.mu.Lock()
	kept := m.items[:0]
	for _, it := range m.items {
		if !it.finished() {
			kept = append(kept, it)
		}
	}
	m.items = kept
	m.mu.Unlock()
	m.emit(true)
}

// GetQueue returns a snapshot of the queue.
func (m *Manager) GetQueue() []*Item {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked()
}

func (m *Manager) snapshotLocked() []*Item {
	out := make([]*Item, 0, len(m.items))
	for _, it := range m.items {
		c := *it
		c.Warnings = append([]string(nil), it.Warnings...)
		c.cancel = nil
		out = append(out, &c)
	}
	return out
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

// emit sends the queue to clients. Progress updates are throttled; state changes are not.
func (m *Manager) emit(force bool) {
	if m.opts.WSEventManager == nil {
		return
	}
	m.mu.Lock()
	if !force && time.Since(m.lastEvent) < progressEventInterval {
		m.mu.Unlock()
		return
	}
	m.lastEvent = time.Now()
	snap := m.snapshotLocked()
	m.mu.Unlock()
	m.opts.WSEventManager.SendEvent(QueueUpdatedEvent, snap)
}

func (m *Manager) update(it *Item, fn func(it *Item), force bool) {
	m.mu.Lock()
	fn(it)
	m.mu.Unlock()
	m.emit(force)
}

// worker runs the queue one episode at a time.
func (m *Manager) worker() {
	defer util.HandlePanicInModuleThen("onlinestream_download/worker", func() {})
	for {
		it := m.nextQueued()
		if it == nil {
			<-m.wake
			continue
		}
		m.run(it)
		m.trimFinished()
	}
}

func (m *Manager) nextQueued() *Item {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, it := range m.items {
		if it.Status == StatusQueued {
			return it
		}
	}
	return nil
}

func (m *Manager) trimFinished() {
	m.mu.Lock()
	defer m.mu.Unlock()
	finished := 0
	for i := len(m.items) - 1; i >= 0; i-- {
		if m.items[i].finished() {
			finished++
			if finished > keepFinished {
				m.items = append(m.items[:i], m.items[i+1:]...)
			}
		}
	}
}

func (m *Manager) run(it *Item) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	m.mu.Lock()
	if it.Status != StatusQueued { // cancelled while waiting
		m.mu.Unlock()
		return
	}
	it.cancel = cancel
	it.Status = StatusFetching
	m.mu.Unlock()
	m.emit(true)

	workDir := filepath.Join(m.opts.WorkDir, it.ID)
	defer os.RemoveAll(workDir)

	dest, err := m.process(ctx, it, workDir)

	m.mu.Lock()
	it.cancel = nil
	switch {
	case ctx.Err() != nil || it.Status == StatusCancelled:
		it.Status = StatusCancelled
	case err != nil:
		it.Status = StatusFailed
		it.Error = err.Error()
	default:
		it.Status = StatusCompleted
		it.Progress = 1
		it.Destination = dest
	}
	m.mu.Unlock()
	m.emit(true)

	if err != nil && ctx.Err() == nil {
		m.logger.Error().Err(err).Int("mediaId", it.MediaId).Int("episode", it.EpisodeNumber).
			Str("provider", it.Provider).Msg("onlinestream download: Failed")
	}
}

// downloader carries the per-download request context: the provider (the limiter key) and the
// headers the video source needs.
type downloader struct {
	client   *RateLimitedClient
	provider string
	headers  map[string]string
}

type subtitleSource struct {
	URL       string
	Language  string
	IsDefault bool
}

func (m *Manager) process(ctx context.Context, it *Item, workDir string) (string, error) {
	req := it.req

	media, err := m.opts.Repository.GetMedia(ctx, req.MediaId)
	if err != nil {
		return "", err
	}

	// Destination
	folder := ""
	if m.opts.ExistingFolder != nil {
		folder = m.opts.ExistingFolder(req.MediaId)
	}
	title := sanitizeFileName(media.GetRomajiTitleSafe())
	if title == "" {
		title = sanitizeFileName(mediaTitle(media))
	}
	if title == "" {
		title = "Anime " + strconv.Itoa(req.MediaId)
	}
	if folder == "" {
		folder = filepath.Join(m.opts.LibraryPath(), title)
	}
	dest := filepath.Join(folder, fmt.Sprintf("%s - %02d.mkv", title, req.EpisodeNumber))
	if _, err := os.Stat(dest); err == nil {
		return "", fmt.Errorf("%s is already in the library", filepath.Base(dest))
	}

	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return "", err
	}

	// Source
	source, err := m.findSource(ctx, req, media, false)
	if err != nil {
		return "", err
	}

	d := &downloader{client: m.client, provider: req.Provider, headers: source.Headers}

	// Subtitles the stream serves
	subs := make([]*subtitleSource, 0, len(source.Subtitles))
	for _, s := range source.Subtitles {
		if s != nil {
			subs = append(subs, &subtitleSource{URL: s.URL, Language: s.Language, IsDefault: s.IsDefault})
		}
	}
	downloadedSubs, warnings := d.downloadSubtitles(ctx, subs, workDir)
	if ctx.Err() != nil {
		return "", ctx.Err()
	}

	ffmpeg := m.opts.FfmpegPath()
	assSubs := make([]*downloadedSubtitle, 0, len(downloadedSubs))
	for i, s := range downloadedSubs {
		out := filepath.Join(workDir, fmt.Sprintf("conv%02d.ass", i))
		if err := convertSubtitleToASS(ctx, ffmpeg, s.Path, out); err != nil {
			if ctx.Err() != nil {
				return "", ctx.Err()
			}
			warnings = append(warnings, fmt.Sprintf("The %s subtitles could not be converted: %v", labelOr(s.Label), err))
			continue
		}
		c := *s
		c.Path = out
		assSubs = append(assSubs, &c)
	}

	m.update(it, func(it *Item) {
		it.SubtitleCount = len(assSubs)
		it.Hardsubbed = true
		for _, s := range subs {
			if s.URL != "" && !isThumbnailTrack(s.Language) {
				it.Hardsubbed = false
				break
			}
		}
		if it.Hardsubbed {
			warnings = append([]string{"This source has no separate subtitles — any subtitles are burnt into the video."}, warnings...)
		}
		it.Warnings = warnings
		it.Server = source.Server
		it.Quality = source.Quality
		it.Status = StatusDownloading
	}, true)

	// Video
	in := &muxInput{
		Subtitles:     assSubs,
		DefaultSub:    chooseDefaultSubtitle(assSubs, req.SubtitleLanguage),
		AudioLanguage: "jpn",
		Title:         fmt.Sprintf("%s - %02d", mediaTitle(media), req.EpisodeNumber),
	}
	if req.Dubbed {
		in.AudioLanguage = "eng"
	}

	err = m.downloadVideo(ctx, it, d, source, workDir, in)
	if err != nil && !errors.Is(err, context.Canceled) && isExpiredLinkError(err) {
		// Stream links expire. Fetch fresh ones once and start over.
		m.logger.Debug().Err(err).Msg("onlinestream download: Source rejected the request, refreshing the source")
		fresh, ferr := m.findSource(ctx, req, media, true)
		if ferr == nil {
			source = fresh
			d.headers = fresh.Headers
			_ = os.RemoveAll(filepath.Join(workDir, "video"))
			err = m.downloadVideo(ctx, it, d, source, workDir, in)
		}
	}
	if err != nil {
		return "", err
	}

	// Mux
	m.update(it, func(it *Item) { it.Status = StatusMuxing; it.Progress = 0 }, true)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return "", err
	}
	tmpOut := dest + ".tmp"
	in.OutputPath = tmpOut
	if err := mux(ctx, ffmpeg, in); err != nil {
		_ = os.Remove(tmpOut)
		return "", err
	}
	if err := os.Rename(tmpOut, dest); err != nil {
		_ = os.Remove(tmpOut)
		return "", err
	}

	// Library
	m.update(it, func(it *Item) { it.Status = StatusRegistering }, true)
	if m.opts.Register != nil {
		if err := m.opts.Register(req.MediaId, req.EpisodeNumber, dest); err != nil {
			return dest, fmt.Errorf("the file was saved to %s but could not be added to the library: %w", dest, err)
		}
	}

	m.logger.Info().Str("path", dest).Int("mediaId", req.MediaId).Int("episode", req.EpisodeNumber).
		Int("subtitles", len(assSubs)).Msg("onlinestream download: Episode added to the library")
	return dest, nil
}

func isExpiredLinkError(err error) bool {
	var se *HTTPStatusError
	if errors.As(err, &se) {
		return se.Status == http.StatusForbidden || se.Status == http.StatusUnauthorized || se.Status == http.StatusNotFound || se.Status == http.StatusGone
	}
	return false
}

// findSource picks the video source the player had selected: the same URL, else the same server
// and quality, else the same server, else the best available.
func (m *Manager) findSource(ctx context.Context, req Request, media *anilist.BaseAnime, refresh bool) (*onlinestream.VideoSource, error) {
	sources, err := m.opts.Repository.GetEpisodeSources(ctx, req.Provider, req.MediaId, req.EpisodeNumber, req.Dubbed, media.GetStartYearSafe(), refresh)
	if err != nil {
		return nil, err
	}
	if sources == nil || len(sources.VideoSources) == 0 {
		return nil, onlinestream.ErrNoVideoSourceFound
	}
	vs := sources.VideoSources
	if req.SourceURL != "" && !refresh {
		for _, s := range vs {
			if s.URL == req.SourceURL {
				return s, nil
			}
		}
	}
	if req.Server != "" {
		for _, s := range vs {
			if s.Server == req.Server && req.Quality != "" && s.Quality == req.Quality {
				return s, nil
			}
		}
		for _, s := range vs {
			if s.Server == req.Server {
				return s, nil
			}
		}
	}
	if req.Quality != "" {
		for _, s := range vs {
			if s.Quality == req.Quality {
				return s, nil
			}
		}
	}
	// Prefer a source that carries subtitles: it is the one without burnt-in subs.
	for _, s := range vs {
		if len(s.Subtitles) > 0 {
			return s, nil
		}
	}
	return vs[0], nil
}

func isHLS(source *onlinestream.VideoSource) bool {
	if source.Type == hibikeonlinestream.VideoSourceM3U8 {
		return true
	}
	if source.Type == hibikeonlinestream.VideoSourceMP4 {
		return false
	}
	u, err := url.Parse(source.URL)
	if err != nil {
		return strings.Contains(source.URL, ".m3u8")
	}
	return strings.EqualFold(path.Ext(u.Path), ".m3u8") || strings.Contains(source.URL, "m3u8")
}

func (m *Manager) downloadVideo(ctx context.Context, it *Item, d *downloader, source *onlinestream.VideoSource, workDir string, in *muxInput) error {
	dir := filepath.Join(workDir, "video")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	if !isHLS(source) {
		out := filepath.Join(dir, "source.mp4")
		if err := d.downloadFile(ctx, source.URL, out, func(done, total int64) {
			m.update(it, func(it *Item) {
				it.Bytes = done
				if total > 0 {
					it.Progress = float64(done) / float64(total)
				}
			}, false)
		}); err != nil {
			return err
		}
		in.VideoPath = out
		in.VideoHLS = false
		return nil
	}

	body, err := d.client.GetBytes(ctx, d.provider, source.URL, d.headers, maxPlaylistSize)
	if err != nil {
		return fmt.Errorf("fetch stream playlist: %w", err)
	}

	videoURL := source.URL
	audioURL := ""
	if isMasterPlaylist(body) {
		base, _ := url.Parse(source.URL)
		master := parseMaster(body, base)
		v := pickVariant(master.Variants, source.Quality)
		if v == nil {
			return errors.New("the stream playlist has no video variants")
		}
		videoURL = v.URL
		if renditions := master.Audio[v.AudioGroup]; len(renditions) > 0 {
			chosen := renditions[0]
			for _, r := range renditions {
				if r.Default {
					chosen = r
					break
				}
			}
			audioURL = chosen.URL
			if c := languageCode(chosen.Language); c != "und" {
				in.AudioLanguage = c
			}
		}
	}

	// Progress: the audio rendition (if any) is small; count both in one segment total.
	var (
		pmu            sync.Mutex
		vDone, vTotal  int
		aDone, aTotal  int
		vBytes, aBytes int64
	)
	report := func() {
		pmu.Lock()
		done, total, b := vDone+aDone, vTotal+aTotal, vBytes+aBytes
		pmu.Unlock()
		m.update(it, func(it *Item) {
			it.SegmentsDone, it.SegmentsTotal, it.Bytes = done, total, b
			if total > 0 {
				it.Progress = float64(done) / float64(total)
			}
		}, false)
	}

	if audioURL != "" {
		pl, err := d.downloadMediaPlaylist(ctx, audioURL, dir, "a_", func(done, total int, bytes int64) {
			pmu.Lock()
			aDone, aTotal, aBytes = done, total, bytes
			pmu.Unlock()
			report()
		})
		if err != nil {
			return fmt.Errorf("audio: %w", err)
		}
		in.AudioPath = pl.Path
	}

	pl, err := d.downloadMediaPlaylist(ctx, videoURL, dir, "v_", func(done, total int, bytes int64) {
		pmu.Lock()
		vDone, vTotal, vBytes = done, total, bytes
		pmu.Unlock()
		report()
	})
	if err != nil {
		return err
	}
	in.VideoPath = pl.Path
	in.VideoHLS = true
	m.emit(true)
	return nil
}

// downloadFile downloads a progressive (MP4) source, resuming with a Range request when the
// connection drops part way.
func (d *downloader) downloadFile(ctx context.Context, rawURL string, out string, onProgress func(done, total int64)) error {
	f, err := os.Create(out)
	if err != nil {
		return err
	}
	defer f.Close()

	var written, total int64
	headersFn := func() map[string]string {
		h := make(map[string]string, len(d.headers)+1)
		for k, v := range d.headers {
			h[k] = v
		}
		if written > 0 {
			h["Range"] = fmt.Sprintf("bytes=%d-", written)
		}
		return h
	}

	return d.client.DoDynamic(ctx, d.provider, rawURL, headersFn, func(resp *http.Response) error {
		if resp.StatusCode != http.StatusPartialContent || written == 0 {
			// A full body (or the first request): start from the beginning.
			written = 0
			if err := f.Truncate(0); err != nil {
				return &PermanentError{Err: err}
			}
			if _, err := f.Seek(0, 0); err != nil {
				return &PermanentError{Err: err}
			}
			total = resp.ContentLength
		}
		buf := make([]byte, 256*1024)
		for {
			n, rerr := resp.Body.Read(buf)
			if n > 0 {
				if _, werr := f.Write(buf[:n]); werr != nil {
					return &PermanentError{Err: werr}
				}
				written += int64(n)
				onProgress(written, total)
			}
			if rerr != nil {
				if errors.Is(rerr, context.Canceled) {
					return rerr
				}
				if errors.Is(rerr, io.EOF) {
					if total > 0 && written < total {
						return errors.New("connection closed early")
					}
					return nil
				}
				return rerr
			}
		}
	})
}

func mediaTitle(media *anilist.BaseAnime) string {
	if media == nil {
		return ""
	}
	if t := media.GetTitleSafe(); t != "" {
		return t
	}
	return media.GetRomajiTitleSafe()
}

// sanitizeFileName makes a title safe as a folder and file name on every OS the server runs on.
func sanitizeFileName(s string) string {
	s = strings.Map(func(r rune) rune {
		switch r {
		case '<', '>', ':', '"', '/', '\\', '|', '?', '*':
			return ' '
		}
		if r < 32 {
			return -1
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	s = strings.TrimRight(s, ". ")
	if r := []rune(s); len(r) > 120 {
		s = strings.TrimRight(string(r[:120]), ". ")
	}
	return s
}
