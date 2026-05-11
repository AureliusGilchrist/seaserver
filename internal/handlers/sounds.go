package handlers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/goccy/go-json"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"seanime/internal/database/db_bridge"
	"seanime/internal/database/models"
)

// Internet Archive endpoints used by the ambience feature.
const (
	iaSearchEndpoint   = "https://archive.org/advancedsearch.php"
	iaMetadataEndpoint = "https://archive.org/metadata/"
	iaDownloadEndpoint = "https://archive.org/download/"
)

// allowed audio extensions for download/listing
var allowedAudioExts = map[string]bool{
	".mp3":  true,
	".ogg":  true,
	".oga":  true,
	".flac": true,
	".m4a":  true,
	".wav":  true,
	".opus": true,
}

func soundsDir(appDataDir string) string {
	return filepath.Join(appDataDir, "sounds")
}

// HandleSearchSounds proxies a query to the Internet Archive advanced search API,
// constrained to mediatype:audio. Used by /ambience Browse tab.
//
//	@summary searches Internet Archive audio.
//	@route /api/v1/sounds/search [GET]
func (h *Handler) HandleSearchSounds(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	if q == "" {
		q = "ambient music"
	}
	page := c.QueryParam("page")
	if page == "" {
		page = "1"
	}

	// Build the IA query: mediatype:audio AND (user query)
	rawQ := fmt.Sprintf("mediatype:audio AND (%s)", q)

	v := url.Values{}
	v.Set("q", rawQ)
	v.Add("fl[]", "identifier")
	v.Add("fl[]", "title")
	v.Add("fl[]", "creator")
	v.Add("fl[]", "downloads")
	v.Add("fl[]", "year")
	v.Add("fl[]", "subject")
	v.Add("sort[]", "downloads desc")
	v.Set("rows", "24")
	v.Set("page", page)
	v.Set("output", "json")

	apiURL := iaSearchEndpoint + "?" + v.Encode()

	client := &http.Client{Timeout: 20 * time.Second}
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	req.Header.Set("User-Agent", "Seanime/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	if resp.StatusCode != http.StatusOK {
		return h.RespondWithError(c, fmt.Errorf("archive.org search returned HTTP %d", resp.StatusCode))
	}

	var result interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, result)
}

// HandleGetSoundFiles fetches Internet Archive item metadata and returns the list
// of playable audio files for that item, sorted by preferred format (FLAC > MP3 > OGG > others).
//
//	@summary lists audio files for an Internet Archive item.
//	@route /api/v1/sounds/files [GET]
func (h *Handler) HandleGetSoundFiles(c echo.Context) error {
	identifier := strings.TrimSpace(c.QueryParam("identifier"))
	if identifier == "" {
		return h.RespondWithError(c, fmt.Errorf("identifier is required"))
	}
	// IA identifiers are alphanumeric + dot/dash/underscore only.
	if strings.ContainsAny(identifier, "/\\?#") || strings.Contains(identifier, "..") {
		return h.RespondWithError(c, fmt.Errorf("invalid identifier"))
	}

	apiURL := iaMetadataEndpoint + url.PathEscape(identifier)

	client := &http.Client{Timeout: 20 * time.Second}
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	req.Header.Set("User-Agent", "Seanime/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return h.RespondWithError(c, fmt.Errorf("archive.org metadata returned HTTP %d", resp.StatusCode))
	}

	var meta struct {
		Metadata struct {
			Title   string `json:"title"`
			Creator string `json:"creator"`
		} `json:"metadata"`
		Files []struct {
			Name   string `json:"name"`
			Format string `json:"format"`
			Length string `json:"length"`
			Size   string `json:"size"`
		} `json:"files"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&meta); err != nil {
		return h.RespondWithError(c, err)
	}

	type soundFile struct {
		Name        string `json:"name"`
		Format      string `json:"format"`
		Ext         string `json:"ext"`
		DurationSec int    `json:"durationSec"`
		SizeBytes   int64  `json:"sizeBytes"`
		Priority    int    `json:"-"`
	}

	out := make([]soundFile, 0, len(meta.Files))
	for _, f := range meta.Files {
		ext := strings.ToLower(filepath.Ext(f.Name))
		if !allowedAudioExts[ext] {
			continue
		}
		// Priority: FLAC=0 best, MP3=1, OGG=2, others=3 (lower = preferred)
		priority := 3
		fmtLower := strings.ToLower(f.Format)
		switch {
		case strings.Contains(fmtLower, "flac"):
			priority = 0
		case strings.Contains(fmtLower, "mp3"):
			priority = 1
		case strings.Contains(fmtLower, "ogg") || strings.Contains(fmtLower, "vorbis"):
			priority = 2
		}
		// Parse length (HH:MM:SS or seconds-as-float)
		durSec := parseIADuration(f.Length)
		// Parse size
		sizeBytes, _ := strconv.ParseInt(f.Size, 10, 64)
		out = append(out, soundFile{
			Name:        f.Name,
			Format:      f.Format,
			Ext:         strings.TrimPrefix(ext, "."),
			DurationSec: durSec,
			SizeBytes:   sizeBytes,
			Priority:    priority,
		})
	}

	// Sort by priority, then by size desc (higher quality usually larger).
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].Priority < out[i].Priority ||
				(out[j].Priority == out[i].Priority && out[j].SizeBytes > out[i].SizeBytes) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}

	return h.RespondWithData(c, map[string]interface{}{
		"identifier": identifier,
		"title":      meta.Metadata.Title,
		"creator":    meta.Metadata.Creator,
		"files":      out,
	})
}

// parseIADuration converts Internet Archive's "length" field (either "MM:SS", "HH:MM:SS",
// or seconds-as-float string) into integer seconds. Returns 0 on parse failure.
func parseIADuration(s string) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	if strings.Contains(s, ":") {
		parts := strings.Split(s, ":")
		var total int
		for _, p := range parts {
			n, err := strconv.Atoi(strings.TrimSpace(p))
			if err != nil {
				return 0
			}
			total = total*60 + n
		}
		return total
	}
	if n, err := strconv.ParseFloat(s, 64); err == nil {
		return int(n)
	}
	return 0
}

// HandleListSoundTracks returns all downloaded ambience tracks (DB rows + URL).
//
//	@summary lists downloaded ambience tracks.
//	@route /api/v1/sounds [GET]
func (h *Handler) HandleListSoundTracks(c echo.Context) error {
	tracks, err := db_bridge.ListSoundTracks(h.App.Database)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	type trackOut struct {
		*models.SoundTrack
		URL string `json:"url"`
	}
	out := make([]trackOut, 0, len(tracks))
	for _, t := range tracks {
		out = append(out, trackOut{SoundTrack: t, URL: "/sounds-cache/" + t.Filename})
	}
	return h.RespondWithData(c, out)
}

// HandleDownloadSoundTrack downloads a single audio file from archive.org and
// records it in the database. Idempotent on (identifier, filename).
//
//	@summary downloads an Internet Archive audio file to the local cache.
//	@route /api/v1/sounds/download [POST]
func (h *Handler) HandleDownloadSoundTrack(c echo.Context) error {
	type body struct {
		Identifier  string `json:"identifier"`
		Filename    string `json:"filename"` // filename at archive.org
		Title       string `json:"title"`
		Artist      string `json:"artist"`
		Format      string `json:"format"`
		DurationSec int    `json:"durationSec"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.Identifier == "" || b.Filename == "" {
		return h.RespondWithError(c, fmt.Errorf("identifier and filename are required"))
	}
	// Sanity-check identifier and filename to prevent path traversal.
	if strings.ContainsAny(b.Identifier, "/\\?#") || strings.Contains(b.Identifier, "..") {
		return h.RespondWithError(c, fmt.Errorf("invalid identifier"))
	}
	if strings.ContainsAny(b.Filename, "/\\?#") || strings.Contains(b.Filename, "..") {
		return h.RespondWithError(c, fmt.Errorf("invalid filename"))
	}
	ext := strings.ToLower(filepath.Ext(b.Filename))
	if !allowedAudioExts[ext] {
		return h.RespondWithError(c, fmt.Errorf("unsupported audio format: %s", ext))
	}

	// Idempotent: if we already have this (identifier, IA filename) in DB and on disk, return it.
	if existing, err := db_bridge.GetSoundTrackByIAIdentifier(h.App.Database, b.Identifier, b.Filename); err == nil && existing != nil {
		dest := filepath.Join(soundsDir(h.App.Config.Data.AppDataDir), existing.Filename)
		if _, statErr := os.Stat(dest); statErr == nil {
			return h.RespondWithData(c, map[string]interface{}{
				"track": existing,
				"url":   "/sounds-cache/" + existing.Filename,
			})
		}
		// Disk file vanished — delete stale row and re-download.
		_ = db_bridge.DeleteSoundTrackByUUID(h.App.Database, existing.UUID)
	}

	dir := soundsDir(h.App.Config.Data.AppDataDir)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	id := uuid.New().String()
	storedFilename := id + ext
	dest := filepath.Join(dir, storedFilename)

	downloadURL := iaDownloadEndpoint + url.PathEscape(b.Identifier) + "/" + url.PathEscape(b.Filename)

	// Whitelist: must resolve to archive.org
	parsed, err := url.Parse(downloadURL)
	if err != nil || !strings.HasSuffix(strings.ToLower(parsed.Host), "archive.org") {
		return h.RespondWithError(c, fmt.Errorf("download URL must resolve to archive.org"))
	}

	client := &http.Client{Timeout: 10 * time.Minute} // FLAC files can be large
	req, err := http.NewRequest(http.MethodGet, downloadURL, nil)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	req.Header.Set("User-Agent", "Seanime/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return h.RespondWithError(c, fmt.Errorf("archive.org download returned HTTP %d", resp.StatusCode))
	}

	f, err := os.Create(dest)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	written, err := io.Copy(f, resp.Body)
	if err != nil {
		f.Close()
		_ = os.Remove(dest)
		return h.RespondWithError(c, err)
	}
	f.Close()

	track := &models.SoundTrack{
		UUID:          id,
		Filename:      storedFilename,
		Title:         strings.TrimSpace(b.Title),
		Artist:        strings.TrimSpace(b.Artist),
		IAIdentifier:  b.Identifier,
		IAFilename:    b.Filename,
		DurationSec:   b.DurationSec,
		FileSizeBytes: written,
		Format:        strings.TrimSpace(b.Format),
	}
	if track.Title == "" {
		track.Title = strings.TrimSuffix(b.Filename, ext)
	}
	if err := db_bridge.CreateSoundTrack(h.App.Database, track); err != nil {
		_ = os.Remove(dest)
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, map[string]interface{}{
		"track": track,
		"url":   "/sounds-cache/" + storedFilename,
	})
}

// HandleDeleteSoundTrack deletes a track by UUID (DB row + disk file).
//
//	@summary deletes a downloaded ambience track.
//	@route /api/v1/sounds/:uuid [DELETE]
func (h *Handler) HandleDeleteSoundTrack(c echo.Context) error {
	id := c.Param("uuid")
	if id == "" || strings.ContainsAny(id, "/\\") || strings.Contains(id, "..") {
		return h.RespondWithError(c, fmt.Errorf("invalid uuid"))
	}

	track, err := db_bridge.GetSoundTrackByUUID(h.App.Database, id)
	if err != nil {
		// Already gone — treat as success.
		return h.RespondWithData(c, true)
	}

	dest := filepath.Join(soundsDir(h.App.Config.Data.AppDataDir), track.Filename)
	if err := os.Remove(dest); err != nil && !os.IsNotExist(err) {
		return h.RespondWithError(c, err)
	}
	if err := db_bridge.DeleteSoundTrackByUUID(h.App.Database, id); err != nil {
		return h.RespondWithError(c, err)
	}

	// Remove this track UUID from any playlists that reference it.
	playlists, _ := db_bridge.ListSoundPlaylists(h.App.Database)
	for _, p := range playlists {
		uuids := db_bridge.SplitTrackUUIDs(p.TrackUUIDsCSV)
		filtered := make([]string, 0, len(uuids))
		changed := false
		for _, u := range uuids {
			if u == id {
				changed = true
				continue
			}
			filtered = append(filtered, u)
		}
		if changed {
			_, _ = db_bridge.UpdateSoundPlaylist(h.App.Database, p.ID, p.Name, filtered)
		}
	}

	return h.RespondWithData(c, true)
}

// --- Playlist handlers ---

type soundPlaylistOut struct {
	ID         uint     `json:"id"`
	Name       string   `json:"name"`
	TrackUUIDs []string `json:"trackUuids"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func playlistToOut(p *models.SoundPlaylist) soundPlaylistOut {
	return soundPlaylistOut{
		ID:         p.ID,
		Name:       p.Name,
		TrackUUIDs: db_bridge.SplitTrackUUIDs(p.TrackUUIDsCSV),
		CreatedAt:  p.CreatedAt,
		UpdatedAt:  p.UpdatedAt,
	}
}

// HandleListSoundPlaylists returns all server-wide ambience playlists.
//
//	@summary lists ambience playlists.
//	@route /api/v1/sounds/playlists [GET]
func (h *Handler) HandleListSoundPlaylists(c echo.Context) error {
	playlists, err := db_bridge.ListSoundPlaylists(h.App.Database)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	out := make([]soundPlaylistOut, 0, len(playlists))
	for _, p := range playlists {
		out = append(out, playlistToOut(p))
	}
	return h.RespondWithData(c, out)
}

// HandleCreateSoundPlaylist creates a new ambience playlist.
//
//	@summary creates an ambience playlist.
//	@route /api/v1/sounds/playlists [POST]
func (h *Handler) HandleCreateSoundPlaylist(c echo.Context) error {
	type body struct {
		Name       string   `json:"name"`
		TrackUUIDs []string `json:"trackUuids"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	b.Name = strings.TrimSpace(b.Name)
	if b.Name == "" {
		return h.RespondWithError(c, fmt.Errorf("name is required"))
	}
	if b.TrackUUIDs == nil {
		b.TrackUUIDs = []string{}
	}
	p, err := db_bridge.CreateSoundPlaylist(h.App.Database, b.Name, b.TrackUUIDs)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, playlistToOut(p))
}

// HandleUpdateSoundPlaylist updates a playlist's name/tracks.
//
//	@summary updates an ambience playlist.
//	@route /api/v1/sounds/playlists/:id [PATCH]
func (h *Handler) HandleUpdateSoundPlaylist(c echo.Context) error {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return h.RespondWithError(c, fmt.Errorf("invalid id"))
	}
	type body struct {
		Name       string   `json:"name"`
		TrackUUIDs []string `json:"trackUuids"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	b.Name = strings.TrimSpace(b.Name)
	if b.Name == "" {
		return h.RespondWithError(c, fmt.Errorf("name is required"))
	}
	if b.TrackUUIDs == nil {
		b.TrackUUIDs = []string{}
	}
	p, err := db_bridge.UpdateSoundPlaylist(h.App.Database, uint(id), b.Name, b.TrackUUIDs)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, playlistToOut(p))
}

// HandleDeleteSoundPlaylist deletes a playlist.
//
//	@summary deletes an ambience playlist.
//	@route /api/v1/sounds/playlists/:id [DELETE]
func (h *Handler) HandleDeleteSoundPlaylist(c echo.Context) error {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return h.RespondWithError(c, fmt.Errorf("invalid id"))
	}
	if err := db_bridge.DeleteSoundPlaylist(h.App.Database, uint(id)); err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}
