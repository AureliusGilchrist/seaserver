package manga

import (
	"cmp"
	"context"
	"hash/fnv"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"seanime/internal/util/comparison"
	"slices"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

const (
	ScanMatchThreshold = 0.85

	// ScanSuggestionThreshold is how close a folder name has to be to an AniList title before the
	// scan is willing to put the two in front of the user as a possibility.
	//
	// Far below the threshold that would link them without asking, and deliberately: the cost of a
	// weak suggestion is a row somebody glances at and rejects, while the cost of not making it is a
	// series filed as "not a real manga" forever because its folder was named after the release
	// rather than the title. A suggestion is not a claim.
	ScanSuggestionThreshold = 0.5

	// maxScanCandidates is how many possibilities one folder is offered in review. Enough to hold
	// the right answer when the first is wrong, few enough to read at a glance.
	maxScanCandidates = 5
)

// Scan statuses. A folder ends in exactly one of these.
const (
	ScanStatusMatched = "matched"
	// ScanStatusPendingReview is a match the scan found but has not acted on, waiting for the user
	// to accept or dismiss it.
	ScanStatusPendingReview = "pending-review"
	ScanStatusUnmatched     = "unmatched"
	ScanStatusSkipped       = "skipped"
	ScanStatusSearchFailed  = "search-failed"
)

// MangaScanResult is the top-level response for a manga directory scan.
type MangaScanResult struct {
	ScannedFolders []MangaScanFolder `json:"scannedFolders"`
	MatchedCount   int               `json:"matchedCount"`
	UnmatchedCount int               `json:"unmatchedCount"`
	SkippedCount   int               `json:"skippedCount"`
	// PendingReviewCount is how many folders are waiting on a decision.
	PendingReviewCount int    `json:"pendingReviewCount"`
	StartedAt          string `json:"startedAt"`
	CompletedAt        string `json:"completedAt"`
	// ReviewMatches is whether this scan proposed its matches rather than applying them.
	ReviewMatches bool `json:"reviewMatches"`
}

// MangaScanFolder represents one scanned folder and its match status.
type MangaScanFolder struct {
	FolderPath     string  `json:"folderPath"`
	FolderName     string  `json:"folderName"`
	ChapterCount   int     `json:"chapterCount"`
	Status         string  `json:"status"` // "matched", "pending-review", "unmatched", "skipped"
	MatchedMediaID int     `json:"matchedMediaId"`
	MatchedTitle   string  `json:"matchedTitle"`
	MatchedImage   string  `json:"matchedImage"`
	Confidence     float64 `json:"confidence"`
	IsSynthetic    bool    `json:"isSynthetic"`
	// Candidates are the other entries the search turned up, best first, so a folder whose proposed
	// match is wrong can be corrected in review without searching AniList again.
	Candidates []MangaScanCandidate `json:"candidates,omitempty"`
}

// MangaScanCandidate is one AniList entry a folder might be.
type MangaScanCandidate struct {
	MediaID    int     `json:"mediaId"`
	Title      string  `json:"title"`
	CoverImage string  `json:"coverImage"`
	Confidence float64 `json:"confidence"`
	Format     string  `json:"format"`
	Status     string  `json:"status"`
	Chapters   int     `json:"chapters"`
}

// MangaScanProgressEvent is sent via WebSocket during scanning.
type MangaScanProgressEvent struct {
	Current    int    `json:"current"`
	Total      int    `json:"total"`
	FolderName string `json:"folderName"`
}

// ScanMangaDirectories scans local + download directories and auto-matches folders to AniList manga.
//
// With reviewMatches set, the scan decides nothing on its own: every match it finds — including the
// confident ones it would otherwise have written — is reported as pending, along with the runners-up,
// and only becomes a link when the user accepts it. See ApplyMangaScanReview.
//
// The point is not that the matching is untrustworthy. It is that a wrong link is close to invisible
// once made — a folder of downloaded chapters filed under a series the user has never read, their
// progress written to it — and reviewing a list of proposals takes a minute where finding that by
// accident takes months. Suggestions are also made further down than an automatic link would ever
// reach (ScanSuggestionThreshold), because a suggestion somebody looks at can afford to be wrong.
func ScanMangaDirectories(
	ctx context.Context,
	localDir string,
	downloadDir string,
	forceRematch bool,
	reviewMatches bool,
	database *db.Database,
	wsEventManager events.WSEventManagerInterface,
	logger *zerolog.Logger,
) (*MangaScanResult, error) {
	startedAt := time.Now()

	// Collect all unique folder names across both directories
	folderMap := make(map[string]string) // folderName -> fullPath (first seen wins)

	for _, dir := range []string{localDir, downloadDir} {
		if dir == "" {
			continue
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			logger.Warn().Err(err).Str("dir", dir).Msg("manga-scan: Failed to read directory")
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() {
				name := entry.Name()
				if _, exists := folderMap[name]; !exists {
					folderMap[name] = filepath.Join(dir, name)
				}
			}
		}
	}

	if len(folderMap) == 0 {
		return &MangaScanResult{
			ScannedFolders: []MangaScanFolder{},
			StartedAt:      startedAt.Format(time.RFC3339),
			CompletedAt:    time.Now().Format(time.RFC3339),
		}, nil
	}

	// Build ordered list
	type folderItem struct {
		name string
		path string
	}
	folders := make([]folderItem, 0, len(folderMap))
	for name, path := range folderMap {
		folders = append(folders, folderItem{name: name, path: path})
	}

	total := len(folders)
	result := &MangaScanResult{
		ScannedFolders: make([]MangaScanFolder, 0, total),
		StartedAt:      startedAt.Format(time.RFC3339),
		ReviewMatches:  reviewMatches,
	}

	// Check existing mappings (provider="local") to know what to skip
	existingMappings := make(map[string]bool) // mangaId (folder name) -> mapped
	if !forceRematch {
		// Query all local mappings
		var mappings []models.MangaMapping
		database.Gorm().Where("provider = ?", "local").Find(&mappings)
		for _, m := range mappings {
			existingMappings[m.MangaID] = true
		}
		// Synthetic folders are deliberately *not* skipped.
		//
		// A synthetic entry is an unresolved folder, not a resolved one: it means "nothing was
		// found for this name", which is a statement about one moment and one search. Treating it
		// as settled is what made the state permanent — a scan during a rate-limited minute wrote
		// synthetics for half a library, and every scan afterwards skipped exactly those folders,
		// so the only way out was a full force-rematch of everything.
		//
		// Retried instead, and a retry costs one search for a folder that has no answer yet, which
		// is the cheapest thing a scan can spend a request on. Folders with a real mapping are
		// still skipped; those are answered.
	}

	anilistClient := anilist.NewAnilistClient("", "")

	// Consulted only for folders AniList had nothing at all for, to learn what else the series is
	// called before giving up on it. See searchAniListForTitle.
	synonymLookup := providerSynonymSource(logger)

	for i, folder := range folders {
		// Send progress event
		if wsEventManager != nil {
			wsEventManager.SendEvent(events.MangaScanProgress, MangaScanProgressEvent{
				Current:    i + 1,
				Total:      total,
				FolderName: folder.name,
			})
		}

		scanFolder := MangaScanFolder{
			FolderPath: folder.path,
			FolderName: folder.name,
		}

		// Count chapters (quick: count subdirs + archive files at depth 1)
		scanFolder.ChapterCount = countChapters(folder.path)

		// Skip if already mapped and not force rematch
		if !forceRematch && existingMappings[folder.name] {
			scanFolder.Status = "skipped"
			result.ScannedFolders = append(result.ScannedFolders, scanFolder)
			result.SkippedCount++
			continue
		}

		// The folder's own name, exactly as it is on disk.
		//
		// Searching with the stripped version was losing the very characters that identify a
		// series: the colon in a subtitle, the exclamation mark that is part of the title, the
		// comma in a list of names. AniList indexes those, so removing them made the query a
		// slightly wrong version of the right name — and a slightly wrong name is what a fuzzy
		// match at 0.85 is least able to forgive.
		//
		// The stripped version is still built, and still used, but only as a second thing to
		// compare against once the results are in. That costs nothing: no extra request, one more
		// candidate string.
		rawName := strings.TrimSpace(folder.name)
		cleanedName := cleanMangaTitle(folder.name)
		if rawName == "" && cleanedName == "" {
			scanFolder.Status = "unmatched"
			result.ScannedFolders = append(result.ScannedFolders, scanFolder)
			result.UnmatchedCount++
			continue
		}

		searchName := rawName
		if searchName == "" {
			searchName = cleanedName
		}

		// Asked several ways rather than once — see titleSearchVariants and searchAniListForTitle.
		// Every candidate is still scored against the folder's own name, whichever query found it,
		// so a short query cannot talk a weak match into looking like a strong one.
		matched := false
		candidates, err := searchAniListForTitle(ctx, anilistClient, searchName, rawName, cleanedName, synonymLookup, logger)

		if err == nil && len(candidates) > 0 {
			if candidates[0].Confidence >= ScanMatchThreshold && !reviewMatches {
				best := candidates[0]
				scanFolder.Status = ScanStatusMatched
				scanFolder.MatchedMediaID = best.MediaID
				scanFolder.MatchedTitle = best.Title
				scanFolder.MatchedImage = best.CoverImage
				scanFolder.Confidence = best.Confidence
				matched = true

				applyScanMatch(database, folder.name, best.MediaID, forceRematch)
				result.MatchedCount++
			} else if candidates[0].Confidence >= ScanSuggestionThreshold {
				// Proposed, not applied. Nothing is written against the folder here beyond the
				// synthetic entry it would have had anyway, so a scan left unreviewed leaves the
				// library exactly as a scan without review would have.
				best := candidates[0]
				scanFolder.Status = ScanStatusPendingReview
				scanFolder.MatchedMediaID = best.MediaID
				scanFolder.MatchedTitle = best.Title
				scanFolder.MatchedImage = best.CoverImage
				scanFolder.Confidence = best.Confidence
				scanFolder.Candidates = candidates
				matched = true

				ensureSyntheticEntry(database, folder.name, scanFolder.ChapterCount)
				result.PendingReviewCount++
			}
		} else if err != nil {
			// A search that failed is not a manga that does not exist.
			//
			// Everything below treats "not matched" as "AniList has never heard of this" and
			// writes a synthetic entry for it — a permanent record, created from a folder name,
			// that the manga is not a real series. A rate limit, a timeout or a moment of network
			// trouble produced exactly the same outcome, and once written it stands: the folder is
			// mapped to the synthetic id and later scans skip it. One contended minute during a
			// scan is enough to turn most of a library synthetic, permanently.
			//
			// So a failure is reported and the folder left alone. It stays unmatched, nothing is
			// recorded, and the next scan asks again — which is what a scan is for.
			logger.Warn().Err(err).Str("folder", folder.name).Msg("manga-scan: AniList search failed, leaving the folder for the next scan")
			scanFolder.Status = ScanStatusSearchFailed
			result.ScannedFolders = append(result.ScannedFolders, scanFolder)
			result.UnmatchedCount++
			time.Sleep(700 * time.Millisecond)
			continue
		}

		if !matched {
			scanFolder.Status = ScanStatusUnmatched
			if syntheticID := ensureSyntheticEntry(database, folder.name, scanFolder.ChapterCount); syntheticID != 0 {
				scanFolder.MatchedMediaID = syntheticID
				scanFolder.IsSynthetic = true
			}
			result.UnmatchedCount++
		}

		result.ScannedFolders = append(result.ScannedFolders, scanFolder)

		// Small delay to avoid AniList rate limiting (90 req/min)
		time.Sleep(700 * time.Millisecond)
	}

	result.CompletedAt = time.Now().Format(time.RFC3339)

	// Send completion event
	if wsEventManager != nil {
		wsEventManager.SendEvent(events.MangaScanCompleted, nil)
	}

	return result, nil
}

// MangaScanReviewDecision is what the user decided about one proposed match.
type MangaScanReviewDecision struct {
	FolderName string `json:"folderName"`
	// MediaID is the entry to link the folder to — the one the scan proposed, or another of the
	// candidates it offered.
	MediaID int `json:"mediaId"`
	// Accept is false to dismiss the proposal and leave the folder as a local series.
	Accept bool `json:"accept"`
}

// MangaScanReviewResult reports what a review did.
type MangaScanReviewResult struct {
	Applied   int `json:"applied"`
	Dismissed int `json:"dismissed"`
}

// ApplyMangaScanReview carries out the decisions made about a scan's proposed matches.
//
// Accepting is the same act the Link dialog performs — the folder is mapped to the AniList entry and
// the local series it had been standing in as is removed. Dismissing writes nothing: the folder
// keeps the local series it already has, which the metadata backfill describes from the provider.
func ApplyMangaScanReview(database *db.Database, decisions []MangaScanReviewDecision) *MangaScanReviewResult {
	result := &MangaScanReviewResult{}
	if database == nil {
		return result
	}

	for _, decision := range decisions {
		folderName := strings.TrimSpace(decision.FolderName)
		if folderName == "" {
			continue
		}

		if !decision.Accept {
			result.Dismissed++
			continue
		}
		if decision.MediaID <= 0 {
			continue
		}

		applyScanMatch(database, folderName, decision.MediaID, true)
		result.Applied++
	}

	return result
}

// applyScanMatch records a folder as being a given AniList series.
func applyScanMatch(database *db.Database, folderName string, mediaID int, forceRematch bool) {
	if forceRematch {
		_ = database.DeleteMangaMapping("local", mediaID)
	}
	_ = database.InsertMangaMapping("local", mediaID, folderName)

	// A folder that has found its series is no longer a series of its own. Without this the
	// synthetic entry written by an earlier failed scan survives the match and the manga goes on
	// being listed as synthetic beside the real one it has just been matched to.
	if synthetic, found := database.GetSyntheticMangaByProviderID("local", folderName); found && synthetic != nil {
		_ = database.DeleteSyntheticManga(synthetic.SyntheticID)
	}
}

// ensureSyntheticEntry gives a folder a local series record if it does not have one, and reports its
// ID. Zero when one could not be written.
func ensureSyntheticEntry(database *db.Database, folderName string, chapterCount int) int {
	if existing, found := database.GetSyntheticMangaByProviderID("local", folderName); found && existing != nil {
		return existing.SyntheticID
	}

	syntheticID := generateSyntheticID(folderName)
	if err := database.InsertSyntheticManga(&models.SyntheticManga{
		SyntheticID: syntheticID,
		Title:       folderName,
		Provider:    "local",
		ProviderID:  folderName,
		Status:      "RELEASING",
		Chapters:    chapterCount,
	}); err != nil {
		return 0
	}
	return syntheticID
}

// rankScanCandidates scores every entry the search returned against the folder's name, best first.
//
// Each entry is scored against the folder's real name and against the stripped one, keeping
// whichever does better. Neither is reliably the closer of the two: a title whose punctuation
// AniList also carries matches the raw name best, while a folder that merely borrowed some
// punctuation matches the stripped one. Trying both is free — the results are already in hand — and
// the better score is the better answer.
func rankScanCandidates(media []*anilist.BaseManga, rawName string, cleanedName string) []MangaScanCandidate {
	candidates := make([]MangaScanCandidate, 0, len(media))

	for _, m := range media {
		if m == nil {
			continue
		}
		// Every name AniList knows this series by, not only the three main ones.
		//
		// Synonyms are where the alternative spellings, the abbreviations and the alternate
		// romanisations live — and they are exactly what a folder tends to be named after, because
		// whoever made the folder named it after the release, not after AniList's preferred title.
		// Leaving them out meant a series whose folder used any name but the main three could not be
		// matched at all, however obviously right it was.
		//
		// The native title is included for the same reason: a folder named in Japanese matched nothing
		// before.
		var names []*string
		if m.Title != nil {
			for _, tp := range []*string{m.Title.Romaji, m.Title.English, m.Title.UserPreferred, m.Title.Native} {
				if tp != nil && *tp != "" {
					name := *tp
					names = append(names, &name)
				}
			}
		}
		for _, syn := range m.Synonyms {
			if syn != nil && *syn != "" {
				name := *syn
				names = append(names, &name)
			}
		}
		if len(names) == 0 {
			continue
		}

		confidence := 0.0
		if best, found := comparison.FindBestMatchWithSorensenDice(&rawName, names); found {
			confidence = best.Rating
		}
		if cleanedName != "" && cleanedName != rawName {
			if best, found := comparison.FindBestMatchWithSorensenDice(&cleanedName, names); found && best.Rating > confidence {
				confidence = best.Rating
			}
		}

		candidate := MangaScanCandidate{
			MediaID:    m.ID,
			Confidence: confidence,
		}
		if m.Title != nil && m.Title.UserPreferred != nil {
			candidate.Title = *m.Title.UserPreferred
		}
		if candidate.Title == "" {
			candidate.Title = *names[0]
		}
		if m.CoverImage != nil {
			switch {
			case m.CoverImage.Large != nil && *m.CoverImage.Large != "":
				candidate.CoverImage = *m.CoverImage.Large
			case m.CoverImage.Medium != nil:
				candidate.CoverImage = *m.CoverImage.Medium
			}
		}
		if m.Format != nil {
			candidate.Format = string(*m.Format)
		}
		if m.Status != nil {
			candidate.Status = string(*m.Status)
		}
		if m.Chapters != nil {
			candidate.Chapters = *m.Chapters
		}

		candidates = append(candidates, candidate)
	}

	// Left uncapped and merely ordered: the caller pools the results of several searches before
	// deciding what to keep, and trimming here would throw away a candidate that a later query is
	// about to confirm.
	slices.SortStableFunc(candidates, func(a, b MangaScanCandidate) int {
		return cmp.Compare(b.Confidence, a.Confidence)
	})

	return candidates
}

func cleanMangaTitle(title string) string {
	title = strings.TrimSpace(title)
	title = strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '!' || r == '"' || r == '<' || r == '>' || r == '|' || r == ',' {
			return -1
		}
		return r
	}, title)
	return strings.TrimSpace(title)
}

func countChapters(dirPath string) int {
	count := 0
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return 0
	}
	for _, entry := range entries {
		name := strings.ToLower(entry.Name())
		if entry.IsDir() {
			count++
		} else if strings.HasSuffix(name, ".cbz") || strings.HasSuffix(name, ".cbr") ||
			strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".pdf") {
			count++
		}
	}
	return count
}

func generateSyntheticID(providerID string) int {
	h := fnv.New64a()
	h.Write([]byte(providerID))
	hash := int(h.Sum64() & 0x7FFFFFFF)
	return -hash
}
