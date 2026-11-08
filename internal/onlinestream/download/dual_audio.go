package onlinestream_download

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/util"
	"sort"
	"strconv"
	"strings"
)

// maxDubDrift is how far the dub's length may differ from the Japanese version's before its audio
// is left out. Providers often serve the same video for both; a dub cut from a different edit
// would drift out of sync, and a desynced track is worse than none.
const maxDubDrift = 3.0

// downloadDubAudio fetches the provider's dub of the episode and returns its audio tracks, for
// adding to the Japanese video. It returns no tracks and no warning when the provider has no dub.
func (m *Manager) downloadDubAudio(ctx context.Context, it *Item, req Request, media *anilist.BaseAnime, workDir string, mainURL string, mainDuration float64) ([]*muxAudio, string) {
	dubReq := req
	dubReq.Dubbed = true
	dubReq.SourceURL = ""
	src, err := m.findSource(ctx, dubReq, media, false)
	if err != nil || src == nil || src.URL == mainURL {
		// No dub for this episode, or the provider ignores the dub flag and returned the same stream.
		return nil, ""
	}

	d := &downloader{client: m.client, provider: req.Provider, headers: src.Headers}
	dir := filepath.Join(workDir, "dub")
	m.update(it, func(it *Item) { it.bytesBase = it.Bytes }, false)

	files, err := m.downloadStream(ctx, it, d, src, dir, "eng", "English dub", false)
	if err != nil && ctx.Err() == nil && isExpiredLinkError(err) {
		if fresh, ferr := m.findSource(ctx, dubReq, media, true); ferr == nil {
			d.headers = fresh.Headers
			_ = os.RemoveAll(dir)
			files, err = m.downloadStream(ctx, it, d, fresh, dir, "eng", "English dub", false)
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
