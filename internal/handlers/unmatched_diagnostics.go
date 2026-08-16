package handlers

import (
	"os"
	"path/filepath"
	"seanime/internal/torrent_clients/torrent_client"
	"seanime/internal/unmatched"

	"github.com/labstack/echo/v4"
)

// The Unmatched screen shows a download only once its files are on disk where the server expects
// them, so "my download isn't here" has several very different causes: the torrent client saving
// somewhere the server cannot see (a path that means something different inside a container, or on
// another machine), the sidecar naming the anime never being written, the download still being in
// progress, or the scanner having already matched and moved it.
//
// None of those are distinguishable from the screen itself, so this reports the whole chain: what
// the torrent client says it is doing and where, what is actually in the staging directory, and
// what the scanner makes of it.

type diagnosticsTorrent struct {
	Name     string  `json:"name"`
	Status   string  `json:"status"`
	Progress float64 `json:"progress"`
	// SavePath is where the client says it is writing.
	SavePath string `json:"savePath"`
	// StagingDir is the Unmatched folder this torrent resolves to, empty when it resolves to none.
	StagingDir string `json:"stagingDir"`
	// InsideUnmatched reports whether SavePath is under the server's Unmatched folder — the single
	// most common reason a download never appears.
	InsideUnmatched bool `json:"insideUnmatched"`
	StagingExists   bool `json:"stagingExists"`
	SidecarFound    bool `json:"sidecarFound"`
	AnimeID         int  `json:"animeId,omitempty"`
	AutoMatch       bool `json:"autoMatch"`
}

type diagnosticsStagingDir struct {
	Name         string `json:"name"`
	FileCount    int    `json:"fileCount"`
	VideoCount   int    `json:"videoCount"`
	HasTempFile  bool   `json:"hasTempFile"`
	SidecarFound bool   `json:"sidecarFound"`
	AnimeID      int    `json:"animeId,omitempty"`
	AutoMatch    bool   `json:"autoMatch"`
	// Completion is what the torrent client says: "finished", "downloading" or "unknown".
	Completion string `json:"completion"`
	// MarkedCompleted reports whether the scanner has already accepted it as finished.
	MarkedCompleted bool `json:"markedCompleted"`
	// Listed reports whether it shows up in the Unmatched screen.
	Listed bool `json:"listed"`
}

type unmatchedDiagnostics struct {
	UnmatchedBasePath  string `json:"unmatchedBasePath"`
	BasePathExists     bool   `json:"basePathExists"`
	BasePathWritable   bool   `json:"basePathWritable"`
	LibraryPath        string `json:"libraryPath"`
	TorrentClient      string `json:"torrentClient"`
	TorrentClientOk    bool   `json:"torrentClientOk"`
	TorrentClientError string `json:"torrentClientError,omitempty"`

	Torrents    []diagnosticsTorrent    `json:"torrents"`
	StagingDirs []diagnosticsStagingDir `json:"stagingDirs"`
}

// HandleGetUnmatchedDiagnostics
//
//	@summary reports why downloads are or aren't showing up in the Unmatched screen.
//	@desc This handler reports the whole download chain: what the torrent client is writing and
//	@desc where, what is in the staging folder, and what the scanner makes of each directory.
//	@route /api/v1/unmatched/diagnostics [GET]
//	@returns unmatchedDiagnostics
func (h *Handler) HandleGetUnmatchedDiagnostics(c echo.Context) error {
	out := unmatchedDiagnostics{
		UnmatchedBasePath: unmatched.UnmatchedBasePath,
		LibraryPath:       h.App.UnmatchedRepository.GetAnimeBasePath(),
		Torrents:          make([]diagnosticsTorrent, 0),
		StagingDirs:       make([]diagnosticsStagingDir, 0),
	}

	if info, err := os.Stat(unmatched.UnmatchedBasePath); err == nil && info.IsDir() {
		out.BasePathExists = true
		out.BasePathWritable = isWritableDir(unmatched.UnmatchedBasePath)
	}

	if h.App.Settings != nil && h.App.Settings.Torrent != nil {
		out.TorrentClient = h.App.Settings.Torrent.Default
	}

	// The torrent client is queried, never started: this is a diagnostic, and bringing a client up
	// as a side effect of looking at it would change the thing being diagnosed.
	if repo := h.App.TorrentClientRepositoryRef.Get(); repo != nil {
		torrents, err := repo.GetList(&torrent_client.GetListOptions{})
		if err != nil {
			out.TorrentClientError = err.Error()
		} else {
			out.TorrentClientOk = true
			for _, t := range torrents {
				if t == nil {
					continue
				}
				entry := diagnosticsTorrent{
					Name:     t.Name,
					Status:   string(t.Status),
					Progress: t.Progress,
					SavePath: t.ContentPath,
				}
				if dir, ok := unmatched.StagingDirName(t.ContentPath); ok {
					entry.StagingDir = dir
					entry.InsideUnmatched = true
				} else if dir, ok := unmatched.StagingDirForTorrent(t.Name, t.ContentPath); ok {
					entry.StagingDir = dir
				}
				if entry.StagingDir != "" {
					if info, err := os.Stat(filepath.Join(unmatched.UnmatchedBasePath, entry.StagingDir)); err == nil && info.IsDir() {
						entry.StagingExists = true
					}
				}
				if metadata := h.App.UnmatchedRepository.MetadataForTorrent(t.Name, t.ContentPath); metadata != nil {
					entry.SidecarFound = true
					entry.AnimeID = metadata.AnimeID
					entry.AutoMatch = metadata.AutoMatch
				}
				out.Torrents = append(out.Torrents, entry)
			}
		}
	}

	// What the Unmatched screen would list, so a directory that is present but filtered out is
	// visibly distinct from one that is not there at all.
	listed := make(map[string]bool)
	if torrents, err := h.App.UnmatchedRepository.GetUnmatchedTorrents(); err == nil {
		for _, t := range torrents {
			if t != nil {
				listed[t.Name] = true
			}
		}
	}

	entries, err := os.ReadDir(unmatched.UnmatchedBasePath)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			name := entry.Name()
			path := filepath.Join(unmatched.UnmatchedBasePath, name)

			dir := diagnosticsStagingDir{
				Name:   name,
				Listed: listed[name],
			}
			dir.FileCount, dir.VideoCount, dir.HasTempFile = inspectStagingDir(path)

			if metadata := h.App.UnmatchedRepository.GetTorrentMetadata(name); metadata != nil {
				dir.SidecarFound = true
				dir.AnimeID = metadata.AnimeID
				dir.AutoMatch = metadata.AutoMatch
			}
			if h.App.UnmatchedScanner != nil {
				dir.Completion = string(h.App.UnmatchedScanner.CompletionStateFor(name))
				dir.MarkedCompleted = h.App.UnmatchedScanner.IsMarkedCompleted(name)
			}

			out.StagingDirs = append(out.StagingDirs, dir)
		}
	}

	return h.RespondWithData(c, out)
}

// inspectStagingDir counts what a staging directory holds, and whether anything in it is still
// being written under a temporary name.
func inspectStagingDir(path string) (files int, videos int, hasTemp bool) {
	_ = filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		files++
		name := info.Name()
		if unmatched.IsVideoFileName(name) {
			videos++
		}
		if unmatched.IsTempFileName(name) {
			hasTemp = true
		}
		return nil
	})
	return files, videos, hasTemp
}

// isWritableDir reports whether the server can create files in a directory. A staging folder the
// server can read but not write is a download that will never be matched.
func isWritableDir(path string) bool {
	probe := filepath.Join(path, ".seanime-write-probe")
	f, err := os.OpenFile(probe, os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return false
	}
	_ = f.Close()
	_ = os.Remove(probe)
	return true
}
