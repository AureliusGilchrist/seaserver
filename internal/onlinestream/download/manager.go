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
	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	"seanime/internal/onlinestream"
	"strconv"
	"strings"
	"sync"
	"time"
)

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
	req := it.Req

	media, err := m.opts.Repository.GetMedia(ctx, req.MediaId)
	if err != nil {
		return "", err
	}

	// Destination
	var folder, fileName string
	if m.opts.Destination != nil {
		folder, fileName = m.opts.Destination(media, req.EpisodeNumber)
	}
	if folder == "" || fileName == "" {
		title := sanitizeFileName(media.GetRomajiTitleSafe())
		if title == "" {
			title = "Anime " + strconv.Itoa(req.MediaId)
		}
		folder = filepath.Join(m.opts.LibraryPath(), title)
		fileName = fmt.Sprintf("%s - Episode %03d.mkv", title, req.EpisodeNumber)
	}
	dest := filepath.Join(folder, fileName)
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
				it.trackRate(time.Now())
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
			it.trackRate(time.Now())
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
