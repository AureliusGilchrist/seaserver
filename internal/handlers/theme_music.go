package handlers

import (
	"errors"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"seanime/internal/api/anilist"
	"seanime/internal/extension/hibike/torrent"
	"seanime/internal/torrents/torrent"

	"github.com/dhowden/tag"
	"github.com/labstack/echo/v4"
)

// audioExts lists every extension we treat as a music track.
var audioExts = map[string]bool{
	".mp3":  true,
	".ogg":  true,
	".flac": true,
	".m4a":  true,
	".wav":  true,
}

// themeAudioFile is the result of walking a theme's music folder.
type themeAudioFile struct {
	RelPath  string // forward-slash relative path (e.g. "Disc 1/01 - Tank.mp3")
	FullPath string // absolute on-disk path
	Size     int64
}

// walkThemeAudioFiles recursively scans dir and returns every audio file found.
// Symlinks are not followed. Errors at individual entries are ignored.
func walkThemeAudioFiles(dir string) []themeAudioFile {
	out := make([]themeAudioFile, 0)
	_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if !audioExts[strings.ToLower(filepath.Ext(d.Name()))] {
			return nil
		}
		rel, relErr := filepath.Rel(dir, path)
		if relErr != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		var size int64
		if info, infoErr := d.Info(); infoErr == nil {
			size = info.Size()
		}
		out = append(out, themeAudioFile{RelPath: rel, FullPath: path, Size: size})
		return nil
	})
	return out
}

// removeThemeAudioFiles deletes every audio file under dir (recursively).
// Non-audio files (e.g. .nfo, .jpg) are left alone — defence in depth.
func removeThemeAudioFiles(dir string) {
	for _, f := range walkThemeAudioFiles(dir) {
		_ = os.Remove(f.FullPath)
	}
}

// buildThemeAudioURL constructs the URL the static file server uses for a track,
// escaping every path segment individually so spaces/specials in filenames work.
func buildThemeAudioURL(themeID, relPath string) string {
	segs := strings.Split(relPath, "/")
	for i, s := range segs {
		segs[i] = url.PathEscape(s)
	}
	return "/theme-music/" + url.PathEscape(themeID) + "/" + strings.Join(segs, "/")
}

// sanitizeThemeID ensures a theme id is safe to use as a folder name segment.
func sanitizeThemeID(id string) (string, error) {
	if id == "" {
		return "", errors.New("themeId is required")
	}
	if strings.ContainsAny(id, "/\\") || strings.Contains(id, "..") {
		return "", errors.New("invalid themeId")
	}
	for _, ch := range []string{":", "*", "?", "\"", "<", ">", "|"} {
		if strings.Contains(id, ch) {
			return "", errors.New("invalid themeId")
		}
	}
	return id, nil
}

// themeMusicDir returns and ensures the destination directory for a theme.
func (h *Handler) themeMusicDir(themeID string) (string, error) {
	id, err := sanitizeThemeID(themeID)
	if err != nil {
		return "", err
	}
	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-music", id)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}

// HandleSearchThemeMusic
//
//	@summary searches torrents for music/OST releases for a theme.
//	@desc Performs a simple torrent search across all enabled providers using the supplied query.
//	@desc Returns the underlying torrent.SearchData unchanged so the client can present rich info.
//	@route /api/v1/theme-music/search [POST]
//	@returns torrent.SearchData
func (h *Handler) HandleSearchThemeMusic(c echo.Context) error {
	type body struct {
		ThemeID  string   `json:"themeId"`
		Query    string   `json:"query"`
		Queries  []string `json:"queries,omitempty"`
		Provider string   `json:"provider,omitempty"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Build the de-duplicated list of queries to run. We accept both `query`
	// (legacy single string) and `queries` (new synonym list). Cap to 4
	// variants to avoid hammering providers.
	queryList := make([]string, 0, 4)
	seenQ := make(map[string]bool)
	addQ := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		key := strings.ToLower(s)
		if seenQ[key] {
			return
		}
		seenQ[key] = true
		queryList = append(queryList, s)
	}
	addQ(b.Query)
	for _, q := range b.Queries {
		if len(queryList) >= 4 {
			break
		}
		addQ(q)
	}
	if len(queryList) == 0 {
		return h.RespondWithError(c, errors.New("query is required"))
	}

	// Default to nyaa for OST searches — it does plain text search and doesn't
	// require Animap/AniZip metadata (since our stub media has ID=0).
	if strings.TrimSpace(b.Provider) == "" {
		b.Provider = "nyaa"
	}

	// SearchAnime dereferences several BaseAnime pointer fields (e.g. IsAdult)
	// without nil-checks, so we must pass a fully-populated stub even though
	// we are not searching for a specific anime — just music releases.
	isAdult := false
	status := anilist.MediaStatusFinished
	format := anilist.MediaFormatTv
	zero := 0
	stubMedia := &anilist.BaseAnime{
		ID:        0,
		IsAdult:   &isAdult,
		Status:    &status,
		Format:    &format,
		Title:     &anilist.BaseAnime_Title{},
		StartDate: &anilist.BaseAnime_StartDate{Year: &zero, Month: &zero, Day: &zero},
	}

	// Try the requested provider first, then fall back to other plain-text
	// providers if the result set is empty. OST queries are intentionally
	// loose (just a theme name), so a single provider often misses.
	tryOrder := []string{b.Provider}
	for _, fb := range []string{"nyaa", "nyaa-sukebei", "tosho", "animetosho"} {
		if fb == b.Provider {
			continue
		}
		tryOrder = append(tryOrder, fb)
	}

	// For each query variant, walk the provider fallback chain. Merge results
	// across all queries, deduping by infoHash / magnet / downloadUrl / link.
	var lastErr error

	merged := make([]*hibiketorrent.AnimeTorrent, 0, 32)
	seen := make(map[string]int) // key -> index into merged

	dedupKey := func(t *hibiketorrent.AnimeTorrent) string {
		if t == nil {
			return ""
		}
		if t.InfoHash != "" {
			return "h:" + strings.ToLower(t.InfoHash)
		}
		if t.MagnetLink != "" {
			return "m:" + t.MagnetLink
		}
		if t.DownloadUrl != "" {
			return "d:" + t.DownloadUrl
		}
		if t.Link != "" {
			return "l:" + t.Link
		}
		return "n:" + strings.ToLower(t.Name)
	}

	for _, qStr := range queryList {
		var data *torrent.SearchData
		for _, prov := range tryOrder {
			res, err := h.App.TorrentRepository.SearchAnime(c.Request().Context(), torrent.AnimeSearchOptions{
				Provider:                prov,
				Type:                    torrent.AnimeSearchType("simple"),
				Media:                   stubMedia,
				Query:                   qStr,
				Batch:                   false,
				EpisodeNumber:           0,
				BestReleases:            false,
				Resolution:              "",
				IncludeSpecialProviders: false,
			})
			if err != nil {
				// "not found on Animap/AniZip" errors arise from providers that try to
				// enrich the (stub) media. Treat these as empty results from this
				// provider and continue with the next fallback.
				msg := err.Error()
				if strings.Contains(msg, "not found on Animap") ||
					strings.Contains(msg, "not found on AniZip") ||
					strings.Contains(msg, "animap") ||
					strings.Contains(msg, "anizip") ||
					strings.Contains(msg, "torrent provider not found") ||
					strings.Contains(msg, "does not support") {
					lastErr = err
					continue
				}
				lastErr = err
				continue
			}
			if res != nil && len(res.Torrents) > 0 {
				data = res
				break
			}
			data = res
		}
		if data == nil || len(data.Torrents) == 0 {
			continue
		}
		for _, t := range data.Torrents {
			k := dedupKey(t)
			if k == "" {
				continue
			}
			if idx, ok := seen[k]; ok {
				// Keep the version with the higher seeder/leecher counts.
				existing := merged[idx]
				if t.Seeders > existing.Seeders {
					existing.Seeders = t.Seeders
				}
				if t.Leechers > existing.Leechers {
					existing.Leechers = t.Leechers
				}
				continue
			}
			seen[k] = len(merged)
			merged = append(merged, t)
		}
	}

	if len(merged) == 0 {
		if lastErr != nil {
			return h.RespondWithError(c, lastErr)
		}
		return h.RespondWithData(c, &torrent.SearchData{Torrents: nil})
	}

	return h.RespondWithData(c, &torrent.SearchData{Torrents: merged})
}

// HandleDownloadThemeMusic
//
//	@summary adds a magnet to the configured torrent client with the theme-music folder as destination.
//	@desc If replaceExisting is true, all current files in the theme's music folder are deleted first.
//	@route /api/v1/theme-music/download [POST]
//	@returns bool
func (h *Handler) HandleDownloadThemeMusic(c echo.Context) error {
	type body struct {
		ThemeID         string                      `json:"themeId"`
		MagnetUrl       string                      `json:"magnetUrl"`
		Provider        string                      `json:"provider"`
		Torrent         *hibiketorrent.AnimeTorrent `json:"torrent"`
		ReplaceExisting bool                        `json:"replaceExisting"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Resolve the magnet URL: prefer an explicitly supplied magnetUrl, otherwise
	// fall back to the provider's GetTorrentMagnetLink for torrents that need
	// scraping (most providers don't include a magnet directly in search results).
	magnet := strings.TrimSpace(b.MagnetUrl)
	if magnet == "" && b.Torrent != nil {
		if b.Torrent.MagnetLink != "" {
			magnet = b.Torrent.MagnetLink
		} else if b.Provider != "" {
			providerExtension, ok := h.App.TorrentRepository.GetAnimeProviderExtension(b.Provider)
			if !ok {
				return h.RespondWithError(c, errors.New("provider extension not found: "+b.Provider))
			}
			resolved, err := providerExtension.GetProvider().GetTorrentMagnetLink(b.Torrent)
			if err != nil {
				return h.RespondWithError(c, err)
			}
			magnet = strings.TrimSpace(resolved)
		}
	}
	if magnet == "" {
		return h.RespondWithError(c, errors.New("could not resolve magnet link for this torrent"))
	}

	dir, err := h.themeMusicDir(b.ThemeID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if b.ReplaceExisting {
		// Recursively remove existing audio files only — never wipe foreign content blindly.
		removeThemeAudioFiles(dir)
	}

	if ok := h.App.TorrentClientRepository.Start(); !ok {
		return h.RespondWithError(c, errors.New("could not start torrent client, verify your settings"))
	}

	if err := h.App.TorrentClientRepository.AddMagnets([]string{magnet}, dir); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleDeleteThemeMusic
//
//	@summary deletes all downloaded audio files for a theme.
//	@route /api/v1/theme-music/{themeId} [DELETE]
//	@returns bool
func (h *Handler) HandleDeleteThemeMusic(c echo.Context) error {
	themeID, err := sanitizeThemeID(c.Param("themeId"))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-music", themeID)
	if _, statErr := os.Stat(dir); os.IsNotExist(statErr) {
		return h.RespondWithData(c, true)
	}
	removeThemeAudioFiles(dir)
	return h.RespondWithData(c, true)
}

// HandleDeleteThemeMusicTrack
//
//	@summary deletes a single audio file for a theme.
//	@route /api/v1/theme-music/{themeId}/{filename} [DELETE]
//	@returns bool
func (h *Handler) HandleDeleteThemeMusicTrack(c echo.Context) error {
	themeID, err := sanitizeThemeID(c.Param("themeId"))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	// Filename may contain forward-slash segments (subfolders). The route uses a
	// wildcard parameter (`*`) — fall back to legacy `:filename` for compatibility.
	filename := c.Param("*")
	if filename == "" {
		filename = c.Param("filename")
	}
	if filename == "" || strings.Contains(filename, "..") || strings.ContainsAny(filename, "\\") {
		return h.RespondWithError(c, errors.New("invalid filename"))
	}
	if !audioExts[strings.ToLower(filepath.Ext(filename))] {
		return h.RespondWithError(c, errors.New("not an audio file"))
	}
	base := filepath.Join(h.App.Config.Data.AppDataDir, "theme-music", themeID)
	cleaned := filepath.Clean(filepath.Join(base, filepath.FromSlash(filename)))
	// Ensure the cleaned path is still inside the theme dir (no traversal).
	if !strings.HasPrefix(cleaned, base+string(filepath.Separator)) && cleaned != base {
		return h.RespondWithError(c, errors.New("invalid filename"))
	}
	if err := os.Remove(cleaned); err != nil && !os.IsNotExist(err) {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

// HandleListThemeMusicMetadata
//
//	@summary returns the audio files for a theme, enriched with ID3/Vorbis metadata when available.
//	@desc This is a richer alternative to HandleListThemeMusicTracks — it reads tags from each file.
//	@route /api/v1/theme-music/metadata [GET]
//	@returns []handlers.themeMusicMetadataTrack
func (h *Handler) HandleListThemeMusicMetadata(c echo.Context) error {
	themeID, err := sanitizeThemeID(c.QueryParam("themeId"))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-music", themeID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	files := walkThemeAudioFiles(dir)
	tracks := make([]themeMusicMetadataTrack, 0, len(files))
	for _, fi := range files {
		base := filepath.Base(fi.RelPath)
		t := themeMusicMetadataTrack{
			Filename: fi.RelPath,
			URL:      buildThemeAudioURL(themeID, fi.RelPath),
			Name:     strings.TrimSuffix(base, filepath.Ext(base)),
			Size:     fi.Size,
		}
		// Best-effort tag read — ignore errors.
		if f, err := os.Open(fi.FullPath); err == nil {
			if m, err := tag.ReadFrom(f); err == nil {
				if title := m.Title(); title != "" {
					t.Title = title
				}
				t.Artist = m.Artist()
				t.Album = m.Album()
				t.AlbumArtist = m.AlbumArtist()
				if trackNum, _ := m.Track(); trackNum > 0 {
					t.TrackNumber = trackNum
				}
				t.Year = m.Year()
			}
			_ = f.Close()
		}
		tracks = append(tracks, t)
	}
	return h.RespondWithData(c, tracks)
}

type themeMusicMetadataTrack struct {
	Filename    string `json:"filename"`
	URL         string `json:"url"`
	Name        string `json:"name"`
	Size        int64  `json:"size,omitempty"`
	Title       string `json:"title,omitempty"`
	Artist      string `json:"artist,omitempty"`
	Album       string `json:"album,omitempty"`
	AlbumArtist string `json:"albumArtist,omitempty"`
	TrackNumber int    `json:"trackNumber,omitempty"`
	Year        int    `json:"year,omitempty"`
}

// HandleListAllThemeMusic
//
//	@summary returns every theme that has at least one audio file, with track counts.
//	@desc Used by the cross-theme OST browser in the mini-player.
//	@route /api/v1/theme-music/all [GET]
//	@returns []handlers.themeMusicSummary
func (h *Handler) HandleListAllThemeMusic(c echo.Context) error {
	root := filepath.Join(h.App.Config.Data.AppDataDir, "theme-music")
	if err := os.MkdirAll(root, 0755); err != nil {
		return h.RespondWithError(c, err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	out := make([]themeMusicSummary, 0, len(entries))
	for _, themeEntry := range entries {
		if !themeEntry.IsDir() {
			continue
		}
		// Skip names that contain unsafe characters — should never happen since
		// we only ever create folders here, but defence in depth.
		if strings.ContainsAny(themeEntry.Name(), "/\\") || strings.Contains(themeEntry.Name(), "..") {
			continue
		}
		count := len(walkThemeAudioFiles(filepath.Join(root, themeEntry.Name())))
		if count == 0 {
			continue
		}
		out = append(out, themeMusicSummary{ThemeID: themeEntry.Name(), TrackCount: count})
	}
	return h.RespondWithData(c, out)
}

type themeMusicSummary struct {
	ThemeID    string `json:"themeId"`
	TrackCount int    `json:"trackCount"`
}
