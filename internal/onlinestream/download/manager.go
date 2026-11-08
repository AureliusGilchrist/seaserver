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

	// The episode may be in the library under any name (a torrent, an earlier download). It is
	// only downloaded again when the user chose to overwrite it.
	if !req.Overwrite && m.opts.EpisodeFiles != nil {
		for _, p := range m.opts.EpisodeFiles(req.MediaId, req.EpisodeNumber) {
			if !samePath(p, dest) {
				return "", finalError{fmt.Errorf("episode %d is already in your library (%s); download it again and choose Overwrite to replace it", req.EpisodeNumber, filepath.Base(p))}
			}
		}
	}

	if _, err := os.Stat(dest); err == nil {
		// A file is already there. It blocks the download only while the library has it: matched
		// to this episode it is a duplicate, matched to something else it is not ours to replace.
		// A file nothing points at any more (left behind by unmatching) is replaced.
		if m.opts.LibraryFileOwner != nil {
			if ownerMedia, ownerEp, found := m.opts.LibraryFileOwner(dest); found {
				if ownerMedia == req.MediaId && ownerEp == req.EpisodeNumber && !req.Overwrite {
					return "", finalError{fmt.Errorf("episode %d is already in your library (%s)", req.EpisodeNumber, filepath.Base(dest))}
				}
				if ownerMedia != req.MediaId || ownerEp != req.EpisodeNumber {
					return "", finalError{fmt.Errorf("%s is in your library matched to another anime or episode; unmatch or move it first", filepath.Base(dest))}
				}
			}
		}
		m.logger.Info().Str("path", dest).Msg("onlinestream download: Replacing a file the library no longer uses")
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
	if err != nil && req.Dubbed && ctx.Err() == nil {
		mainReq.Dubbed = true
		primaryDubbed = true
		source, err = m.findSource(ctx, mainReq, media, false)
	}
	// No source on the provider (no episode servers, "video source not found"): the episode is
	// downloaded from the fallback providers instead, in order (AniZone, AnimePahe, then AnimeHeaven).
	if err != nil && ctx.Err() == nil {
		firstErr := err
		var misses []string
		tried := false
		// notOnAny stays true while every fallback reports not having the series at all; then
		// none of its episodes can be downloaded and the series is skipped.
		notOnAny := true
		for _, fb := range FallbackProviders {
			if fb == req.Provider {
				continue
			}
			tried = true
			name := ProviderLabel(fb)
			// Make sure the provider knows which of its entries this anime is, searched the
			// thorough way (every title, synonym and spelling).
			if m.opts.MapProvider != nil {
				m.update(it, func(it *Item) { it.Phase = "Looking on " + name }, true)
				if mapErr := m.opts.MapProvider(ctx, fb, req.MediaId); mapErr != nil {
					if ctx.Err() != nil {
						return "", ctx.Err()
					}
					if errors.Is(mapErr, ErrNotOnProvider) {
						misses = append(misses, "not found on "+name)
						continue
					}
					m.logger.Warn().Err(mapErr).Int("mediaId", req.MediaId).Str("provider", fb).Msg("onlinestream download: Could not match the series on the fallback provider")
				}
			}
			notOnAny = false
			fallback := req
			fallback.Provider = fb
			fallback.Server, fallback.SourceURL = "", ""
			fbMain := fallback
			fbMain.Dubbed = false
			fbSource, fbErr := m.findSource(ctx, fbMain, media, false)
			if fbErr != nil && fallback.Dubbed && ctx.Err() == nil {
				fbMain.Dubbed = true
				fbSource, fbErr = m.findSource(ctx, fbMain, media, false)
			}
			if ctx.Err() != nil {
				return "", ctx.Err()
			}
			if fbErr != nil {
				misses = append(misses, fmt.Sprintf("%s: %v", name, fbErr))
				continue
			}
			m.logger.Info().Int("mediaId", req.MediaId).Int("episode", req.EpisodeNumber).Str("provider", req.Provider).Str("fallback", fb).Err(firstErr).
				Msg("onlinestream download: No source on the provider; downloading the episode from a fallback provider")
			warning := fmt.Sprintf("%s had no source for this episode (%v); downloaded from %s instead.", req.Provider, firstErr, name)
			m.update(it, func(it *Item) {
				it.Provider = fb
				it.Warnings = append(it.Warnings, warning)
			}, true)
			req, mainReq, source, err = fallback, fbMain, fbSource, nil
			primaryDubbed = fbMain.Dubbed
			break
		}
		if err != nil && tried {
			combined := fmt.Errorf("not available on %s (%v); %s", req.Provider, firstErr, strings.Join(misses, "; "))
			if notOnAny {
				return "", skipSeriesError{combined}
			}
			return "", combined
		}
	}
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

	// The dub, when there is one, is the second half of the episode progress.
	var dubSource *onlinestream.VideoSource
	if !primaryDubbed && !m.streamHasEnglishAudio(ctx, d, source) {
		dubSource = m.findDubSource(ctx, req, media, source.URL)
	}
	mainWeight := 1.0
	if dubSource != nil {
		mainWeight = 0.5
	}

	mainDir := filepath.Join(workDir, "video")
	mainFiles, err := m.downloadStream(ctx, it, d, source, mainDir, mainLang, mainPhase, true, 0, mainWeight)
	if err != nil && !errors.Is(err, context.Canceled) && isExpiredLinkError(err) {
		// Stream links expire. Fetch fresh ones once and start over.
		m.logger.Debug().Err(err).Msg("onlinestream download: Source rejected the request, refreshing the source")
		fresh, ferr := m.findSource(ctx, mainReq, media, true)
		if ferr == nil {
			source = fresh
			d.headers = fresh.Headers
			_ = os.RemoveAll(mainDir)
			mainFiles, err = m.downloadStream(ctx, it, d, source, mainDir, mainLang, mainPhase, true, 0, mainWeight)
		}
	}
	if err != nil {
		return "", err
	}
	in.VideoPath, in.VideoHLS = mainFiles.VideoPath, mainFiles.HLS
	in.Audio = mainFiles.Audio

	if dubSource != nil && !hasLanguage(in.Audio, "eng") {
		dubTracks, dubWarning := m.downloadDubAudio(ctx, it, req, media, dubSource, workDir, mainFiles.Duration)
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

	// Overwrite: the new file is in place and registered, so the old ones can go.
	if req.Overwrite && m.opts.ReplaceOld != nil {
		if err := m.opts.ReplaceOld(req.MediaId, req.EpisodeNumber, dest); err != nil {
			m.update(it, func(it *Item) {
				it.Warnings = append(it.Warnings, fmt.Sprintf("The new file is in your library, but an old copy could not be removed: %v", err))
			}, true)
		}
	}

	m.logger.Info().Str("path", dest).Int("mediaId", req.MediaId).Int("episode", req.EpisodeNumber).
		Int("subtitles", len(assSubs)).Bool("overwrite", req.Overwrite).Msg("onlinestream download: Episode added to the library")
	return dest, nil
}

func samePath(a, b string) bool {
	return strings.EqualFold(filepath.ToSlash(filepath.Clean(a)), filepath.ToSlash(filepath.Clean(b)))
}

// FallbackProviders are where an episode is downloaded from, in order, when its own provider
// has no source for it.
var FallbackProviders = []string{"anizone", "animepahe", "animeheaven"}

// ProviderLabel is a provider's display name.
func ProviderLabel(id string) string {
	switch id {
	case "kickassanime":
		return "Kickassanime"
	case "anizone":
		return "AniZone"
	case "animepahe":
		return "AnimePahe"
	case "animeheaven":
		return "AnimeHeaven"
	}
	return id
}

// ErrNotOnProvider is what MapProvider returns when the provider does not have the anime.
var ErrNotOnProvider = errors.New("not found on the provider")

// skipSeriesError ends an episode, and the series' other waiting episodes, as skipped: neither
// the provider nor the fallback has the series.
type skipSeriesError struct{ error }

func (e skipSeriesError) Unwrap() error { return e.error }

// ErrNoSource is returned when a series is asked for that neither its provider nor a fallback
// provider can supply episodes of.
var ErrNoSource = errors.New("no provider has episodes of this series")

// isNoSource reports an error that means the provider has no source for the episode (as
// opposed to a network or provider outage, which is worth trying again).
func isNoSource(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, onlinestream.ErrNoVideoSourceFound) || errors.Is(err, onlinestream.ErrNoEpisodes) {
		return true
	}
	l := strings.ToLower(err.Error())
	for _, s := range []string{"no source", "source not found", "no episode server", "no episodes", "episode not found", "not found"} {
		if strings.Contains(l, s) {
			return true
		}
	}
	return false
}

// checkSeriesSource tries one episode before a series is queued: when the provider has no source
// for it, each fallback provider is matched (the thorough search) and tried in turn. When none
// has it, the series is refused with ErrNoSource. An outage or network error lets the series through: the
// downloads retry on their own.
func (m *Manager) checkSeriesSource(ctx context.Context, req Request, media *anilist.BaseAnime) error {
	if m.checkSourceOverride != nil {
		return m.checkSourceOverride(ctx, req)
	}
	probe := req
	probe.Dubbed = false
	_, err := m.findSource(ctx, probe, media, false)
	if err == nil || ctx.Err() != nil || !isNoSource(err) {
		return nil
	}
	misses := []string{fmt.Sprintf("%s: %v", ProviderLabel(req.Provider), err)}
	for _, fb := range FallbackProviders {
		if fb == req.Provider {
			continue
		}
		name := ProviderLabel(fb)
		if m.opts.MapProvider != nil {
			if mapErr := m.opts.MapProvider(ctx, fb, req.MediaId); mapErr != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				if errors.Is(mapErr, ErrNotOnProvider) {
					misses = append(misses, "not found on "+name)
					continue
				}
				return nil // could not tell: let it through, the downloads retry
			}
		}
		fbProbe := probe
		fbProbe.Provider = fb
		fbProbe.Server, fbProbe.SourceURL = "", ""
		_, fbErr := m.findSource(ctx, fbProbe, media, false)
		if fbErr == nil || ctx.Err() != nil || !isNoSource(fbErr) {
			return nil
		}
		misses = append(misses, fmt.Sprintf("%s: %v", name, fbErr))
	}
	return fmt.Errorf("%w: episode %d (%s)", ErrNoSource, req.EpisodeNumber, strings.Join(misses, "; "))
}

func isSkipSeries(err error) bool {
	var s skipSeriesError
	return errors.As(err, &s)
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
func (m *Manager) downloadStream(ctx context.Context, it *Item, d *downloader, source *onlinestream.VideoSource, dir string, defaultLang string, phase string, setQuality bool, base float64, weight float64) (*streamFiles, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	m.update(it, func(it *Item) {
		it.Phase = phase
		it.SegmentsDone, it.SegmentsTotal = 0, 0
		it.phaseBase, it.phaseWeight = base, weight
		it.Progress = base
	}, true)
	// setFraction moves the episode progress to this stream's share of it, forward only: segment
	// callbacks from parallel workers can arrive slightly out of order.
	setFraction := func(it *Item, f float64) {
		if p := it.phaseBase + it.phaseWeight*f; p > it.Progress {
			it.Progress = p
		}
	}

	if !isHLS(source) {
		out := filepath.Join(dir, "source.mp4")
		if err := d.downloadFile(ctx, source.URL, out, func(done, total int64) {
			m.update(it, func(it *Item) {
				it.Bytes = it.bytesBase + done
				if total > 0 {
					setFraction(it, float64(done)/float64(total))
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
		renditions = keepDualAudio(renditions)
	}

	playlists := len(renditions) + 1

	// Progress: each playlist of the stream (audio renditions, then the video) counts for an equal
	// share, so the bar does not fall back when the next playlist starts and its segments are added
	// to the total.
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
			var frac float64
			for k := range total {
				sd, st, sb = sd+done[k], st+total[k], sb+bytes[k]
				if total[k] > 0 {
					frac += float64(done[k]) / float64(total[k]) / float64(playlists)
				}
			}
			pmu.Unlock()
			m.update(it, func(it *Item) {
				if sd >= it.SegmentsDone || st != it.SegmentsTotal {
					it.SegmentsDone, it.SegmentsTotal = sd, st
				}
				it.Bytes = it.bytesBase + sb
				setFraction(it, frac)
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
