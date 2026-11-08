package onlinestream_download

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/onlinestream"
	"seanime/internal/util"
	"sort"
	"strconv"
	"strings"
)

// maxDubDrift is how far the dub's length may differ from the Japanese version's before its audio
// is left out. Providers often serve the same video for both; a dub cut from a different edit
// would drift out of sync, and a desynced track is worse than none.
const maxDubDrift = 3.0

// findDubSource returns the provider dub of the episode, or nil when there is none. It is looked
// up before anything downloads, so the progress bar can give each stream its share from the start.
func (m *Manager) findDubSource(ctx context.Context, req Request, media *anilist.BaseAnime, mainURL string) *onlinestream.VideoSource {
	dubReq := req
	dubReq.Dubbed = true
	dubReq.SourceURL = ""
	src, err := m.findSource(ctx, dubReq, media, false)
	if err != nil || src == nil || src.URL == mainURL {
		// No dub for this episode, or the provider ignores the dub flag and returned the same stream.
		return nil
	}
	return src
}

// downloadDubAudio downloads the dub and returns its audio tracks, for adding to the Japanese
// video. Its download fills the second half of the episode progress.
func (m *Manager) downloadDubAudio(ctx context.Context, it *Item, req Request, media *anilist.BaseAnime, src *onlinestream.VideoSource, workDir string, mainDuration float64) ([]*muxAudio, string) {
	dubReq := req
	dubReq.Dubbed = true
	dubReq.SourceURL = ""

	d := &downloader{client: m.client, provider: req.Provider, headers: src.Headers}
	dir := filepath.Join(workDir, "dub")
	m.update(it, func(it *Item) { it.bytesBase = it.Bytes }, false)

	files, err := m.downloadStream(ctx, it, d, src, dir, "eng", "English dub", false, 0.5, 0.5)
	if err != nil && ctx.Err() == nil && isExpiredLinkError(err) {
		if fresh, ferr := m.findSource(ctx, dubReq, media, true); ferr == nil {
			d.headers = fresh.Headers
			_ = os.RemoveAll(dir)
			files, err = m.downloadStream(ctx, it, d, fresh, dir, "eng", "English dub", false, 0.5, 0.5)
		}
	}
	if err != nil {
		if ctx.Err() != nil {
			return nil, ""
		}
		return nil, fmt.Sprintf("The English dub could not be downloaded, so the file has Japanese audio only: %v", err)
	}

	if mainDuration > 0 && files.Duration > 0 && math.Abs(mainDuration-files.Duration) > maxDubDrift {
		return nil, fmt.Sprintf("The English dub was left out: it runs %s and the Japanese version %s, so its audio would be out of sync.",
			formatDuration(files.Duration), formatDuration(mainDuration))
	}

	tracks := make([]*muxAudio, 0, len(files.Audio))
	for _, a := range files.Audio {
		c := *a
		if c.Path == "" {
			// The dub audio is muxed into its video; that file is the input and its audio is used.
			c.Path, c.HLS = files.VideoPath, files.HLS
		}
		if c.Language == "" || c.Language == "und" {
			c.Language = "eng"
		}
		c.Default = false
		tracks = append(tracks, &c)
	}
	return tracks, ""
}

// streamHasEnglishAudio reports whether an HLS source already carries an English audio track,
// in which case no separate dub is needed for dual audio. One playlist request, rate limited
// like the rest.
func (m *Manager) streamHasEnglishAudio(ctx context.Context, d *downloader, source *onlinestream.VideoSource) bool {
	if !isHLS(source) {
		return false
	}
	body, err := d.client.GetBytes(ctx, d.provider, source.URL, d.headers, maxPlaylistSize)
	if err != nil || !isMasterPlaylist(body) {
		return false
	}
	base, _ := url.Parse(source.URL)
	master := parseMaster(body, base)
	v := pickVariant(master.Variants, "")
	if v == nil {
		return false
	}
	for _, r := range master.Audio[v.AudioGroup] {
		if renditionLanguage(r) == "eng" {
			return true
		}
	}
	return false
}

func renditionLanguage(r *hlsRendition) string {
	if c := languageCode(r.Language); c != "und" {
		return c
	}
	return languageCode(r.Name)
}

// keepDualAudio narrows a stream offering many audio languages to Japanese and English, one of
// each. Every language is a full download of its own, and the file is meant to be dual audio.
// When neither language is there the stream default (or first) track is kept.
func keepDualAudio(renditions []*hlsRendition) []*hlsRendition {
	if len(renditions) <= 1 {
		return renditions
	}
	var jpn, eng *hlsRendition
	for _, r := range renditions {
		switch renditionLanguage(r) {
		case "jpn":
			if jpn == nil || (r.Default && !jpn.Default) {
				jpn = r
			}
		case "eng":
			if eng == nil || (r.Default && !eng.Default) {
				eng = r
			}
		}
	}
	out := make([]*hlsRendition, 0, 2)
	if jpn != nil {
		out = append(out, jpn)
	}
	if eng != nil {
		out = append(out, eng)
	}
	if len(out) > 0 {
		return out
	}
	for _, r := range renditions {
		if r.Default {
			return []*hlsRendition{r}
		}
	}
	return renditions[:1]
}

func formatDuration(sec float64) string {
	s := int(math.Round(sec))
	return fmt.Sprintf("%d:%02d", s/60, s%60)
}

func hasLanguage(tracks []*muxAudio, lang string) bool {
	for _, t := range tracks {
		if t.Language == lang {
			return true
		}
	}
	return false
}

// mergeAudio adds the tracks whose language the file does not have yet.
func mergeAudio(have []*muxAudio, extra []*muxAudio) []*muxAudio {
	for _, t := range extra {
		if !hasLanguage(have, t.Language) {
			have = append(have, t)
		}
	}
	return have
}

// orderAudio puts Japanese first and makes it the only default track; the rest keep their order.
func orderAudio(tracks []*muxAudio) {
	sort.SliceStable(tracks, func(i, j int) bool {
		return tracks[i].Language == "jpn" && tracks[j].Language != "jpn"
	})
	for i, t := range tracks {
		t.Default = i == 0
	}
}

var audioLanguageNames = map[string]string{
	"jpn": "Japanese", "eng": "English", "spa": "Spanish", "por": "Portuguese", "fre": "French",
	"ger": "German", "ita": "Italian", "rus": "Russian", "ara": "Arabic", "chi": "Chinese", "kor": "Korean",
	"hin": "Hindi", "ind": "Indonesian", "tha": "Thai", "vie": "Vietnamese", "tur": "Turkish",
}

func audioTitle(t *muxAudio) string {
	if strings.TrimSpace(t.Title) != "" {
		return t.Title
	}
	if n, ok := audioLanguageNames[t.Language]; ok {
		return n
	}
	return ""
}

// probeDuration returns a media file length in seconds, or 0 when it cannot be read.
func probeDuration(ctx context.Context, ffprobePath string, path string) float64 {
	out, err := util.NewCmdCtx(ctx, ffprobePath, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path).Output()
	if err != nil {
		return 0
	}
	v, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	if err != nil {
		return 0
	}
	return v
}
