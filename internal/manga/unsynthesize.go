package manga

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"seanime/internal/database/db"
	chapter_downloader "seanime/internal/manga/downloader"
)

// A local series — downloaded from a provider or found on disk — gets a synthetic, negative ID
// until it is matched to AniList. Matching used to only write a link between the two IDs, and
// everything else stayed filed under the synthetic one: the chapters on disk, the reading history,
// the favourite, the todo entry. The rest of the app then had to translate from one ID to the other
// everywhere, and wherever it didn't, the series showed up twice — once as itself and once as a grey
// local card.
//
// Unsynthesising re-files all of it under the AniList ID, so a matched series simply is its AniList
// entry. The synthetic record is deleted; the link row is kept, as a tombstone, so a later scan or
// en masse run that comes across the same provider series knows it has been matched already rather
// than creating a fresh synthetic entry for it.

// SetProfileDatabases tells the repository how to reach every profile's database. Reading history,
// favourites and todo lists live per profile, so unsynthesising has to visit all of them.
func (r *Repository) SetProfileDatabases(fn func() []*db.Database) {
	r.mu.Lock()
	r.profileDatabases = fn
	r.mu.Unlock()
}

// UnsynthesizeMatchedManga converts every synthetic manga that has been matched to AniList. Safe to
// run at any time and as often as wanted: a series already converted has nothing left to move.
// Returns how many series had anything to convert.
func (r *Repository) UnsynthesizeMatchedManga() int {
	if r.db == nil {
		return 0
	}
	mappings, err := r.db.GetAllMangaIDMappings()
	if err != nil {
		r.logger.Warn().Err(err).Msg("manga: Could not read the synthetic manga links")
		return 0
	}
	converted := 0
	for _, mapping := range mappings {
		if mapping == nil || mapping.SyntheticID >= 0 || mapping.AnilistID <= 0 {
			continue
		}
		if r.UnsynthesizeManga(mapping.SyntheticID, mapping.AnilistID) {
			converted++
		}
	}
	if converted > 0 {
		r.logger.Info().Int("series", converted).Msg("manga: Converted matched local series to their AniList entries")
	}
	return converted
}

// UnsynthesizeManga re-files one synthetic manga under the AniList ID it was matched to. Reports
// whether anything changed.
func (r *Repository) UnsynthesizeManga(syntheticID, anilistID int) bool {
	if r.db == nil || syntheticID >= 0 || anilistID <= 0 {
		return false
	}
	r.unsynthesizeMu.Lock()
	defer r.unsynthesizeMu.Unlock()

	changed := false
	logger := r.logger.With().Int("syntheticId", syntheticID).Int("anilistId", anilistID).Logger()

	// The chapters on disk.
	if n := r.refileDownloads(syntheticID, anilistID); n > 0 {
		logger.Debug().Int("folders", n).Msg("manga: Re-filed downloaded chapters under the AniList ID")
		changed = true
	}

	// Everything the databases hold about it: the shared one, then each profile's.
	for _, database := range r.allDatabases() {
		n, err := database.MoveMangaMediaID(syntheticID, anilistID)
		if err != nil {
			logger.Warn().Err(err).Msg("manga: Could not move a local series' records to its AniList entry")
			continue
		}
		if n > 0 {
			changed = true
		}
	}

	// The synthetic record: carry its provider link across, then let it go.
	if synthetic, found := r.db.GetSyntheticManga(syntheticID); found && synthetic != nil {
		if synthetic.Provider != "" && synthetic.ProviderID != "" {
			if _, has := r.db.GetMangaMapping(synthetic.Provider, anilistID); !has {
				// So the source still opens the series that was downloaded, rather than whatever
				// a title search for the AniList entry happens to find.
				_ = r.db.InsertMangaMapping(synthetic.Provider, anilistID, synthetic.ProviderID)
			}
		}
		if err := r.db.DeleteSyntheticManga(syntheticID); err != nil {
			logger.Warn().Err(err).Msg("manga: Could not remove the synthetic record")
		} else {
			changed = true
		}
	}

	if changed {
		logger.Info().Msg("manga: Local series is now its AniList entry")
	}
	return changed
}

func (r *Repository) allDatabases() []*db.Database {
	ret := []*db.Database{r.db}
	r.mu.Lock()
	fn := r.profileDatabases
	r.mu.Unlock()
	if fn == nil {
		return ret
	}
	for _, database := range fn() {
		if database != nil && database != r.db {
			ret = append(ret, database)
		}
	}
	return ret
}

// refileDownloads moves a series' downloads from the synthetic ID to the AniList ID: the series
// registry says which manga it belongs to, and old-format chapter folders carry the ID in their name.
func (r *Repository) refileDownloads(syntheticID, anilistID int) int {
	if r.downloadDir == "" {
		return 0
	}
	changed := 0
	for _, dir := range r.seriesDirsForMedia(syntheticID) {
		dirPath := filepath.Join(r.downloadDir, dir)

		// New format. Loaded fresh and writable — the cached read-only copy must never be saved.
		if registry, err := chapter_downloader.LoadSeriesRegistry(dirPath, r.logger); err == nil && len(registry.Chapters) > 0 {
			if registry.MediaId == syntheticID {
				registry.MediaId = anilistID
				if err := registry.Save(dirPath); err != nil {
					r.logger.Warn().Err(err).Str("dir", dir).Msg("manga: Could not re-file a series registry")
				} else {
					changed++
				}
			}
			continue
		}

		// Old format: provider_mediaId_chapterId_..._number.
		entries, err := os.ReadDir(dirPath)
		if err != nil {
			continue
		}
		renamed := false
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			newName, ok := refiledChapterDirName(entry.Name(), syntheticID, anilistID)
			if !ok {
				continue
			}
			if err := os.Rename(filepath.Join(dirPath, entry.Name()), filepath.Join(dirPath, newName)); err != nil {
				r.logger.Warn().Err(err).Str("dir", entry.Name()).Msg("manga: Could not re-file a chapter folder")
				continue
			}
			renamed = true
		}
		if renamed {
			changed++
		}
	}
	if changed > 0 {
		r.invalidateSeriesDirIndex()
	}
	return changed
}

// refiledChapterDirName swaps the media ID in an old-format chapter folder name.
func refiledChapterDirName(name string, from, to int) (string, bool) {
	id, ok := chapter_downloader.ParseChapterDirName(name)
	if !ok || id.MediaId != from {
		return "", false
	}
	parts := strings.SplitN(name, "_", 3)
	if len(parts) < 3 {
		return "", false
	}
	return parts[0] + "_" + strconv.Itoa(to) + "_" + parts[2], true
}
