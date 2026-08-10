package db_bridge

import (
	"errors"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/library/anime"

	"sync"

	"github.com/goccy/go-json"
	"gorm.io/gorm"
)

// The local file list is held in memory because it is read constantly — every entry screen, every
// playback decision, the auto-downloader, the scanner — and it is stored as one JSON document, so
// a miss costs unmarshalling the whole library.
//
// Two things about how that cache is kept are worth stating, because it used to get both wrong.
//
// It is per database, not per process. Each profile has its own seanime.db and therefore its own
// library; a single shared slot handed whichever profile asked second the files belonging to
// whichever asked first, and — worse — a save made against that borrowed list wrote one profile's
// library into another's row.
//
// And it is locked. Every one of those readers is a different goroutine, and a scan writing the
// list while a handler reads it was an unsynchronised write to a package-level variable: a data
// race in the literal sense, with no upper bound on how it can fail. For a library large enough
// that a scan takes real time, that window is most of the time.
type localFilesCacheEntry struct {
	files []*anime.LocalFile
	dbID  uint
}

var (
	localFilesMu    sync.RWMutex
	localFilesCache = make(map[*db.Database]localFilesCacheEntry)
)

func cachedLocalFiles(database *db.Database) (localFilesCacheEntry, bool) {
	localFilesMu.RLock()
	defer localFilesMu.RUnlock()
	entry, ok := localFilesCache[database]
	return entry, ok
}

func cacheLocalFiles(database *db.Database, files []*anime.LocalFile, dbID uint) {
	localFilesMu.Lock()
	defer localFilesMu.Unlock()
	localFilesCache[database] = localFilesCacheEntry{files: files, dbID: dbID}
}

// ClearLocalFilesCache invalidates the in-memory cache so the next GetLocalFiles
// call reads fresh data from the database. Used to protect against race conditions
// where manual matches may have been saved while a scan was in progress.
//
// Clears every profile's, because the callers that need it are the ones about to overwrite a
// library wholesale and none of them are in a position to say whose.
func ClearLocalFilesCache() {
	localFilesMu.Lock()
	defer localFilesMu.Unlock()
	clear(localFilesCache)
}

// PreserveConcurrentLocalFiles folds locked local files that reached the database *while a scan was
// running* back into that scan's results.
//
// A scan reads the existing local files once at the start and replaces the whole list at the end,
// which makes the entire scan one long read-modify-write. Anything written in between is discarded
// — and the writer that matters is the Unmatched screen, whose matches inject locked entries as
// they move files into the library. Those moves are also what wakes the auto-scanner, so a session
// spent matching downloads is a session spent racing a scan that is guaranteed to be running: the
// match lands after the scan has already walked the directory, so the files are in neither the scan
// results nor the surviving list, and the match silently disappears.
//
// Call this immediately before writing the scan results. Locked files are the ones worth rescuing:
// they represent a deliberate user match, and unlocked entries the scan did not find are files the
// scan is entitled to consider gone.
func PreserveConcurrentLocalFiles(database *db.Database, scanned []*anime.LocalFile) []*anime.LocalFile {
	// Read past the cache: the cached list may be the snapshot this scan started from.
	ClearLocalFilesCache()
	fresh, _, err := GetLocalFiles(database)
	if err != nil || len(fresh) == 0 {
		return scanned
	}

	byPath := make(map[string]int, len(scanned))
	for i, lf := range scanned {
		byPath[lf.GetNormalizedPath()] = i
	}

	for _, dbLf := range fresh {
		if !dbLf.IsLocked() || dbLf.MediaId == 0 {
			continue
		}
		idx, found := byPath[dbLf.GetNormalizedPath()]
		if !found {
			// The scan never saw this file — it was matched into the library after the walk.
			scanned = append(scanned, dbLf)
			continue
		}
		// The scan did see it. Prefer its version only when the scan's re-hydration pass filled in
		// an episode number the stored entry is still missing; otherwise the stored match wins.
		scanLf := scanned[idx]
		if scanLf.IsLocked() && scanLf.MediaId == dbLf.MediaId &&
			scanLf.Metadata != nil && scanLf.Metadata.Episode > 0 &&
			(dbLf.Metadata == nil || dbLf.Metadata.Episode == 0) {
			continue
		}
		scanned[idx] = dbLf
	}

	return scanned
}

// GetLocalFiles will return the latest local files and the id of the entry.
func GetLocalFiles(db *db.Database) ([]*anime.LocalFile, uint, error) {

	if entry, ok := cachedLocalFiles(db); ok {
		return entry.files, entry.dbID, nil
	}

	// Get the latest entry
	var res models.LocalFiles
	err := db.Gorm().Last(&res).Error
	if err != nil {
		return nil, 0, err
	}

	// Unmarshal the local files
	lfsBytes := res.Value
	var lfs []*anime.LocalFile
	if err := json.Unmarshal(lfsBytes, &lfs); err != nil {
		return nil, 0, err
	}

	db.Logger.Debug().Int("files", len(lfs)).Msg("db: Local files retrieved")

	cacheLocalFiles(db, lfs, res.ID)

	return lfs, res.ID, nil
}

// SaveLocalFiles will save the local files in the database at the given id.
func SaveLocalFiles(db *db.Database, lfsId uint, lfs []*anime.LocalFile) ([]*anime.LocalFile, error) {
	// Marshal the local files
	marshaledLfs, err := json.Marshal(lfs)
	if err != nil {
		return nil, err
	}

	// Save the local files
	ret, err := db.UpsertLocalFiles(&models.LocalFiles{
		BaseModel: models.BaseModel{
			ID: lfsId,
		},
		Value: marshaledLfs,
	})
	if err != nil {
		return nil, err
	}

	// What used to happen here was a second full pass over the library: the bytes just written were
	// unmarshalled straight back into a fresh slice, which was then returned and cached. That slice
	// could only ever be a copy of the one already in hand — the bytes are the ones marshalled three
	// lines up — so every save of a large library paid to encode it and then to decode it again for
	// nothing. On a library of thousands of files that is the bulk of the cost of writing, and every
	// small edit (locking one file, matching one episode) pays it in full.
	//
	// InsertLocalFiles has always cached the caller's own slice; this now does the same.
	cacheLocalFiles(db, lfs, ret.ID)

	return lfs, nil
}

// InsertLocalFiles will insert the local files in the database at a new entry.
func InsertLocalFiles(db *db.Database, lfs []*anime.LocalFile) ([]*anime.LocalFile, error) {

	// Marshal the local files
	bytes, err := json.Marshal(lfs)
	if err != nil {
		return nil, err
	}

	// Save the local files to the database
	ret, err := db.InsertLocalFiles(&models.LocalFiles{
		Value: bytes,
	})

	if err != nil {
		return nil, err
	}

	cacheLocalFiles(db, lfs, ret.ID)

	return lfs, nil

}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

func GetShelvedLocalFiles(db *db.Database) ([]*anime.LocalFile, error) {
	var res models.ShelvedLocalFiles
	err := db.Gorm().Last(&res).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	lfsBytes := res.Value
	var lfs []*anime.LocalFile
	if err := json.Unmarshal(lfsBytes, &lfs); err != nil {
		return nil, err
	}

	db.Logger.Debug().Msg("db: Shelved local files retrieved")

	return lfs, nil
}

func SaveShelvedLocalFiles(db *db.Database, lfs []*anime.LocalFile) error {
	// Marshal the local files
	marshaledLfs, err := json.Marshal(lfs)
	if err != nil {
		return err
	}

	// Save the local files
	ret, err := db.UpsertShelvedLocalFiles(&models.ShelvedLocalFiles{
		BaseModel: models.BaseModel{
			ID: 1,
		},
		Value: marshaledLfs,
	})
	if err != nil {
		return err
	}

	// Unmarshal the saved local files
	var retLfs []*anime.LocalFile
	if err := json.Unmarshal(ret.Value, &retLfs); err != nil {
		return nil
	}

	return nil
}
