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

	// Source: the Japanese (sub) version first, always. The dub is only the main stream when
	// the provider has no Japanese version of the episode and the dub was asked for.
	mainReq := req
	mainReq.Dubbed = false
	primaryDubbed := false
	source, err := m.findSource(ctx, mainReq, media, false)
	if err != nil {
		if !req.Dubbed || ctx.Err() != nil {
			return "", err
		}
		mainReq.Dubbed = true
		primaryDubbed = true
		if source, err = m.findSource(ctx, mainReq, media, false); err != nil {
			return "", err
		}
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

	// Video and audio. The Japanese stream is the main one: its video, its audio as the first
	// and default track. When the provider also has a dub of this episode, the dub's audio is
	// added as a second track (dual audio), provided it lines up with the Japanese version.
	in := &muxInput{
		Subtitles:  assSubs,
		DefaultSub: chooseDefaultSubtitle(assSubs, req.SubtitleLanguage),
		Title:      fmt.Sprintf("%s - %02d", mediaTitle(media), req.EpisodeNumber),
	}
	mainLang := "jpn"
	mainPhase := "Japanese"
	if primaryDubbed {
		mainLang, mainPhase = "eng", "English dub"
	}

	mainDir := filepath.Join(workDir, "video")
	mainFiles, err := m.downloadStream(ctx, it, d, source, mainDir, mainLang, mainPhase, true)
	if err != nil && !errors.Is(err, context.Canceled) && isExpiredLinkError(err) {
		// Stream links expire. Fetch fresh ones once and start over.
		m.logger.Debug().Err(err).Msg("onlinestream download: Source rejected the request, refreshing the source")
		fresh, ferr := m.findSource(ctx, mainReq, media, true)
		if ferr == nil {
			source = fresh
			d.headers = fresh.Headers
			_ = os.RemoveAll(mainDir)
			mainFiles, err = m.downloadStream(ctx, it, d, source, mainDir, mainLang, mainPhase, true)
		}
	}
	if err != nil {
		return "", err
	}
	in.VideoPath, in.VideoHLS = mainFiles.VideoPath, mainFiles.HLS
	in.Audio = mainFiles.Audio

	if !primaryDubbed && !hasLanguage(in.Audio, "eng") {
		dubTracks, dubWarning := m.downloadDubAudio(ctx, it, req, media, workDir, source.URL, mainFiles.Duration)
		if dubWarning != "" {
			m.update(it, func(it *Item) { it.Warnings = append(it.Warnings, dubWarning) }, true)
		}
		in.Audio = mergeAudio(in.Audio, dubTracks)
	}
	if ctx.Err() != nil {
		return "", ctx.Err()
	}

	orderAudio(in.Audio)
	m.update(it, func(it *Item) {
		it.Phase = ""
		it.AudioTracks = make([]string, 0, len(in.Audio))
		for _, a := range in.Audio {
			it.AudioTracks = append(it.AudioTracks, a.Language)
		}
	}, true)

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

// findSource picks the best video source on the server the player had selected (any server if
// that one has none): the highest resolution, preferring a source with separate subtitles when two
// are equally good. Downloads always take the best quality; the player's quality setting is a
// playback choice and is ignored here.
func (m *Manager) findSource(ctx context.Context, req Request, media *anilist.BaseAnime, refresh bool) (*onlinestream.VideoSource, error) {
	sources, err := m.opts.Repository.GetEpisodeSources(ctx, req.Provider, req.MediaId, req.EpisodeNumber, req.Dubbed, media.GetStartYearSafe(), refresh)
	if err != nil {
		return nil, err
	}
	if sources == nil || len(sources.VideoSources) == 0 {
		return nil, onlinestream.ErrNoVideoSourceFound
	}
	candidates := make([]*onlinestream.VideoSource, 0, len(sources.VideoSources))
	if req.Server != "" {
		for _, s := range sources.VideoSources {
			if s != nil && s.Server == req.Server {
				candidates = append(candidates, s)
			}
		}
	}
	if len(candidates) == 0 {
		for _, s := range sources.VideoSources {
			if s != nil {
				candidates = append(candidates, s)
			}
		}
	}
	return bestSource(candidates), nil
}

// sourceRank orders sources by quality. A source with an explicit resolution ranks by it. One
// without ("auto", "default") that is an HLS playlist is usually the master with every variant,
// the best of which is taken later, so it ranks as 1080p — above anything lower and level with
// 1080p, where the explicit one wins the tie.
func sourceRank(s *onlinestream.VideoSource) float64 {
	for _, label := range []string{s.Quality, s.Label} {
		if m := qualityHeightRe.FindStringSubmatch(label); m != nil {
			h, _ := strconv.Atoi(m[1])
			return float64(h)
		}
		l := strings.ToLower(label)
		if strings.Contains(l, "4k") || strings.Contains(l, "uhd") {
			return 2160
		}
	}
	if isHLS(s) {
		return 1079.5
	}
	return 0
}

func bestSource(candidates []*onlinestream.VideoSource) *onlinestream.VideoSource {
	var best *onlinestream.VideoSource
	bestRank := -1.0
	for _, s := range candidates {
		r := sourceRank(s)
		if len(s.Subtitles) > 0 {
			r += 0.1 // soft subtitles break ties
		}
		if r > bestRank {
			best, bestRank = s, r
		}
	}
	return best
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

// streamFiles is one downloaded stream: its video, and every audio track it carries.
type streamFiles struct {
	VideoPath string
	HLS       bool
	// Audio lists the stream's audio tracks. An entry with no Path is the audio muxed into the
	// video file itself; the others are separate HLS audio renditions.
	Audio []*muxAudio
	// Duration is the length in seconds, used to check a dub lines up before its audio is added.
	Duration float64
}

// downloadStream downloads a source into dir: the best video variant and, for HLS, every audio
// rendition of that variant. phase names the step in the queue ("Japanese", "English dub").
func (m *Manager) downloadStream(ctx context.Context, it *Item, d *downloader, source *onlinestream.VideoSource, dir string, defaultLang string, phase string, setQuality bool) (*streamFiles, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	m.update(it, func(it *Item) {
		it.Phase = phase
		it.SegmentsDone, it.SegmentsTotal, it.Progress = 0, 0, 0
	}, true)

	if !isHLS(source) {
		out := filepath.Join(dir, "source.mp4")
		if err := d.downloadFile(ctx, source.URL, out, func(done, total int64) {
			m.update(it, func(it *Item) {
				it.Bytes = it.bytesBase + done
				if total > 0 {
					it.Progress = float64(done) / float64(total)
				}
				it.trackRate(time.Now())
			}, false)
		}); err != nil {
			return nil, err
		}
		return &streamFiles{
			VideoPath: out,
			Audio:     []*muxAudio{{Language: defaultLang}},
			Duration:  probeDuration(ctx, m.ffprobePath(), out),
		}, nil
	}

	body, err := d.client.GetBytes(ctx, d.provider, source.URL, d.headers, maxPlaylistSize)
	if err != nil {
		return nil, fmt.Errorf("fetch stream playlist: %w", err)
	}

	videoURL := source.URL
	var renditions []*hlsRendition
	if isMasterPlaylist(body) {
		base, _ := url.Parse(source.URL)
		master := parseMaster(body, base)
		v := pickVariant(master.Variants, "")
		if v == nil {
			return nil, errors.New("the stream playlist has no video variants")
		}
		videoURL = v.URL
		if v.Height > 0 && setQuality {
			m.update(it, func(it *Item) { it.Quality = fmt.Sprintf("%dp", v.Height) }, true)
		}
		seen := make(map[string]bool)
		for _, r := range master.Audio[v.AudioGroup] {
			if r.URL != "" && !seen[r.URL] {
				seen[r.URL] = true
				renditions = append(renditions, r)
			}
		}
	}

	// Progress counts the segments of every playlist of this stream together.
	var (
		pmu   sync.Mutex
		done  = make(map[string]int)
		total = make(map[string]int)
		bytes = make(map[string]int64)
	)
	progressFor := func(key string) progressFn {
		return func(dn, tt int, b int64) {
			pmu.Lock()
			done[key], total[key], bytes[key] = dn, tt, b
			var sd, st int
			var sb int64
			for k := range total {
				sd, st, sb = sd+done[k], st+total[k], sb+bytes[k]
			}
			pmu.Unlock()
			m.update(it, func(it *Item) {
				it.SegmentsDone, it.SegmentsTotal, it.Bytes = sd, st, it.bytesBase+sb
				if st > 0 {
					it.Progress = float64(sd) / float64(st)
				}
				it.trackRate(time.Now())
			}, false)
		}
	}

	out := &streamFiles{HLS: true}
	for i, r := range renditions {
		key := fmt.Sprintf("a%d_", i)
		pl, err := d.downloadMediaPlaylist(ctx, r.URL, dir, key, progressFor(key))
		if err != nil {
			return nil, fmt.Errorf("audio track %s: %w", labelOr(firstNonEmpty(r.Name, r.Language)), err)
		}
		lang := languageCode(r.Language)
		if lang == "und" {
			lang = languageCode(r.Name)
		}
		if lang == "und" {
			lang = defaultLang
		}
		out.Audio = append(out.Audio, &muxAudio{Path: pl.Path, HLS: true, Language: lang, Title: r.Name, Default: r.Default})
	}

	pl, err := d.downloadMediaPlaylist(ctx, videoURL, dir, "v_", progressFor("v_"))
	if err != nil {
		return nil, err
	}
	out.VideoPath = pl.Path
	out.Duration = pl.Duration
	if len(out.Audio) == 0 {
		out.Audio = []*muxAudio{{Language: defaultLang}}
	}
	return out, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func (m *Manager) ffprobePath() string {
	if m.opts.FfprobePath != nil {
		if p := m.opts.FfprobePath(); p != "" {
			return p
		}
	}
	return "ffprobe"
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
