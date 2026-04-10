package achievement

import (
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// AchievementEvent is carried into the engine from handlers.
// All fields are optional except ProfileID and Trigger.
type AchievementEvent struct {
	ProfileID uint
	Trigger   EvalTrigger
	MediaID   int
	Timestamp time.Time
	// Flexible metadata bag for trigger-specific data
	Metadata map[string]interface{}
}

// UnlockPayload is sent over WS when an achievement unlocks.
type UnlockPayload struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Tier        int    `json:"tier"`
	TierName    string `json:"tierName"`
	Category    string `json:"category"`
	IconSVG     string `json:"iconSVG"`
	XPAwarded   int    `json:"xpAwarded"`
}

// Engine evaluates achievement events and unlocks achievements in the profile DB.
type Engine struct {
	logger         *zerolog.Logger
	wsEventManager events.WSEventManagerInterface
	getDB          func(profileID uint) (*db.Database, error)

	defMap     map[string]*Definition
	mu         sync.Mutex
	initialized bool
}

type NewEngineOptions struct {
	Logger         *zerolog.Logger
	WSEventManager events.WSEventManagerInterface
	GetDB          func(profileID uint) (*db.Database, error)
}

// NewEngine creates a new achievement engine.
func NewEngine(opts *NewEngineOptions) *Engine {
	return &Engine{
		logger:         opts.Logger,
		wsEventManager: opts.WSEventManager,
		getDB:          opts.GetDB,
		defMap:         DefinitionMap(),
	}
}

// ProcessEvent is called from handlers when an actionable event occurs.
// It evaluates all definitions that match the given trigger and updates progress/unlocks.
func (e *Engine) ProcessEvent(event *AchievementEvent) {
	if event.ProfileID == 0 {
		return
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}

	database, err := e.getDB(event.ProfileID)
	if err != nil {
		e.logger.Error().Err(err).Uint("profileID", event.ProfileID).Msg("achievement: failed to get profile DB")
		return
	}

	// Lazily initialize achievement rows on first event
	e.ensureInitialized(database)

	// Evaluate each definition that matches the trigger
	for i := range AllDefinitions {
		def := &AllDefinitions[i]
		if !e.triggerMatches(def, event.Trigger) {
			continue
		}
		e.evaluateDefinition(database, def, event)
	}
}

// EvaluateCollectionStats is called on collection refresh to evaluate stat-based achievements.
// It receives aggregate stats and evaluates definitions that use TriggerCollectionRefresh.
func (e *Engine) EvaluateCollectionStats(profileID uint, stats *CollectionStats) {
	if profileID == 0 || stats == nil {
		return
	}
	database, err := e.getDB(profileID)
	if err != nil {
		e.logger.Error().Err(err).Uint("profileID", profileID).Msg("achievement: failed to get profile DB for stats eval")
		return
	}
	e.ensureInitialized(database)

	event := &AchievementEvent{
		ProfileID: profileID,
		Trigger:   TriggerCollectionRefresh,
		Timestamp: time.Now(),
		Metadata:  stats.toMetadata(),
	}

	for i := range AllDefinitions {
		def := &AllDefinitions[i]
		if !e.triggerMatches(def, TriggerCollectionRefresh) {
			continue
		}
		e.evaluateDefinition(database, def, event)
	}
}

// triggerMatches returns true if the definition should be evaluated for the given trigger.
func (e *Engine) triggerMatches(def *Definition, trigger EvalTrigger) bool {
	for _, t := range def.Triggers {
		if t == trigger || t == TriggerAny {
			return true
		}
	}
	return false
}

// evaluateDefinition evaluates a single definition against the event and updates the DB.
func (e *Engine) evaluateDefinition(database *db.Database, def *Definition, event *AchievementEvent) {
	if def.MaxTier == 0 {
		// One-time achievement
		existing, _ := database.GetAchievement(def.Key, 0)
		if existing != nil && existing.IsUnlocked {
			return // Already unlocked
		}
		progress, shouldUnlock := e.computeProgress(def, 0, event, existing)
		if shouldUnlock {
			e.unlock(database, def, 0, event.ProfileID)
		} else if progress > 0 {
			_ = database.UpdateAchievementProgress(def.Key, 0, progress, "")
		}
	} else {
		// Tiered achievement - check each tier from highest to current
		for tier := 1; tier <= def.MaxTier; tier++ {
			existing, _ := database.GetAchievement(def.Key, tier)
			if existing != nil && existing.IsUnlocked {
				continue // Already unlocked this tier
			}
			progress, shouldUnlock := e.computeProgress(def, tier, event, existing)
			if shouldUnlock {
				e.unlock(database, def, tier, event.ProfileID)
			} else if progress > 0 {
				_ = database.UpdateAchievementProgress(def.Key, tier, progress, "")
			}
		}
	}
}

// computeProgress evaluates the current state and returns (progress 0-100, shouldUnlock).
// This is the core evaluation logic — maps each definition key to its tracking logic.
func (e *Engine) computeProgress(def *Definition, tier int, event *AchievementEvent, existing *models.Achievement) (float64, bool) {
	meta := event.Metadata
	if meta == nil {
		meta = make(map[string]interface{})
	}

	// Get the threshold for this tier (if tiered)
	threshold := 0
	if def.MaxTier > 0 && tier >= 1 && tier <= len(def.TierThresholds) {
		threshold = def.TierThresholds[tier-1]
	}

	// Get current progress value from existing record
	currentProgress := float64(0)
	if existing != nil {
		currentProgress = existing.Progress
	}

	// --- Dispatch to category-specific evaluators ---
	switch def.Category {

	// Stat-based categories (use collection stats metadata keyed by def.Key)
	case CategoryAnimeMilestones, CategoryMangaMilestones,
		CategoryAnimeGenres, CategoryMangaGenres,
		CategoryAnimeCompletion, CategoryMangaCompletion,
		CategoryAnimeDedication, CategoryMangaDedication,
		CategoryAnimeDiscovery, CategoryMangaDiscovery,
		CategoryAnimeFormats, CategoryMangaFormats,
		CategoryMangaCreative:
		return e.evalStatOrFirst(meta, def, threshold, event)

	// Scoring categories
	case CategoryAnimeScoring, CategoryMangaScoring:
		return e.evalScoring(def, threshold, meta)

	// Incremental event-based categories
	case CategoryAnimeBinge, CategoryMangaBinge,
		CategoryAnimeTime, CategoryMangaTime,
		CategoryAnimeSocial,
		CategoryAnimeStreaks, CategoryMangaStreaks:
		return e.evalIncremental(def, threshold, currentProgress, meta)

	// Holiday date-based
	case CategoryAnimeHoliday, CategoryMangaHoliday:
		return e.evalHolidaySeasonal(def, event)

	// Special/quirky
	case CategoryAnimeSpecial, CategoryMangaSpecial:
		return e.evalObscureFun(def, event, currentProgress)
	}

	return 0, false
}

// unlock marks an achievement as unlocked, awards XP, and sends a WS event.
func (e *Engine) unlock(database *db.Database, def *Definition, tier int, profileID uint) {
	err := database.UnlockAchievement(def.Key, tier)
	if err != nil {
		e.logger.Error().Err(err).Str("key", def.Key).Int("tier", tier).Msg("achievement: failed to unlock")
		return
	}

	// Award XP
	xp := def.XPReward
	if xp <= 0 {
		xp = DefaultTierXP(tier)
	}
	newLevel, leveledUp, xpErr := database.AddXP(xp)
	if xpErr != nil {
		e.logger.Error().Err(xpErr).Str("key", def.Key).Msg("achievement: failed to award XP")
	}

	tierName := ""
	if def.MaxTier > 0 && tier >= 1 && tier <= len(def.TierNames) {
		tierName = def.TierNames[tier-1]
	}

	iconSVG := def.IconSVG
	if iconSVG == "" {
		for _, cat := range AllCategories {
			if cat.Key == def.Category {
				iconSVG = cat.IconSVG
				break
			}
		}
	}

	payload := &UnlockPayload{
		Key:         def.Key,
		Name:        def.Name,
		Description: def.Description,
		Tier:        tier,
		TierName:    tierName,
		Category:    string(def.Category),
		IconSVG:     iconSVG,
		XPAwarded:   xp,
	}

	e.wsEventManager.SendEventToProfile(profileID, "achievement-unlocked", payload)

	// Send level-up event if applicable
	if leveledUp && xpErr == nil {
		e.wsEventManager.SendEventToProfile(profileID, "level-up", map[string]interface{}{
			"newLevel": newLevel,
		})
		e.logger.Info().Int("level", newLevel).Uint("profileID", profileID).Msg("achievement: level up!")
	}

	e.logger.Info().Str("key", def.Key).Int("tier", tier).Int("xp", xp).Uint("profileID", profileID).Msg("achievement: unlocked")
}

// ensureInitialized lazily creates missing achievement rows on first access.
// If the definition count has changed (e.g., after an update), re-syncs rows.
func (e *Engine) ensureInitialized(database *db.Database) {
	expectedCount := int64(TotalAchievementCount())
	count, _ := database.AchievementRowCount()

	if count == expectedCount {
		return // Already populated with correct count
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	// Double-check after lock
	count, _ = database.AchievementRowCount()
	if count == expectedCount {
		return
	}

	var rows []models.Achievement
	for _, def := range AllDefinitions {
		if def.MaxTier == 0 {
			rows = append(rows, models.Achievement{
				Key:  def.Key,
				Tier: 0,
			})
		} else {
			for tier := 1; tier <= def.MaxTier; tier++ {
				rows = append(rows, models.Achievement{
					Key:  def.Key,
					Tier: tier,
				})
			}
		}
	}

	_ = database.BulkUpsertAchievements(rows)
}

// --- Evaluator helpers ---

// evalStatOrFirst: for stat-based categories. If metadata has def.Key, use stat threshold.
// If def is one-time (tier 0) and no stat available, treat as first-event unlock.
func (e *Engine) evalStatOrFirst(meta map[string]interface{}, def *Definition, threshold int, event *AchievementEvent) (float64, bool) {
	val := getMetaFloat(meta, def.Key)
	if val > 0 || threshold > 0 {
		return e.evalStatThreshold(meta, def, threshold)
	}
	// One-time achievement with no matching metadata key = first-event unlock
	if def.MaxTier == 0 {
		return 100, true
	}
	return 0, false
}

// evalStatThreshold: stat-based achievements evaluated from collection data.
// The metadata should contain a key matching def.Key with the current count/value.
func (e *Engine) evalStatThreshold(meta map[string]interface{}, def *Definition, threshold int) (float64, bool) {
	val := getMetaFloat(meta, def.Key)
	if threshold <= 0 {
		// One-time stat check
		if val > 0 {
			return 100, true
		}
		return 0, false
	}
	progress := (val / float64(threshold)) * 100
	if progress > 100 {
		progress = 100
	}
	if val >= float64(threshold) {
		return 100, true
	}
	return progress, false
}

// evalIncremental: for achievements where progress accumulates over events.
// The metadata "count" key carries the increment (default 1).
func (e *Engine) evalIncremental(def *Definition, threshold int, currentProgress float64, meta map[string]interface{}) (float64, bool) {
	increment := getMetaFloat(meta, "count")
	if increment == 0 {
		increment = 1
	}
	// currentProgress stores the raw accumulated count (not percentage)
	newCount := currentProgress + increment
	if threshold <= 0 {
		return 100, true
	}
	progress := newCount // Store raw count as progress
	if newCount >= float64(threshold) {
		return progress, true
	}
	return progress, false
}

// evalHolidaySeasonal: date-based achievements for both anime and manga holidays.
func (e *Engine) evalHolidaySeasonal(def *Definition, event *AchievementEvent) (float64, bool) {
	t := event.Timestamp
	month := t.Month()
	day := t.Day()
	weekday := t.Weekday()
	genres := getMetaStringSlice(event.Metadata, "genres")

	// Strip anime/manga prefix for generic matching
	// e.g., "a_new_years_resolution" and "m_new_years_resolution" both match the same date
	key := def.Key
	if len(key) > 2 && (key[:2] == "a_" || key[:2] == "m_") {
		key = key[2:]
	}

	switch key {
	case "new_years_resolution":
		return boolResult(month == time.January && day == 1)
	case "valentines_weeb", "valentines_read":
		return boolResult(month == time.February && day == 14 && containsString(genres, "Romance"))
	case "pi_day":
		return boolResult(month == time.March && day == 14)
	case "april_fools":
		return boolResult(month == time.April && day == 1 && containsString(genres, "Comedy"))
	case "international_anime_day":
		return boolResult(month == time.April && day == 15)
	case "international_manga_day":
		return boolResult(month == time.September && day == 21)
	case "star_wars_day":
		return boolResult(month == time.May && day == 4 && (containsString(genres, "Sci-Fi") || containsString(genres, "Mecha")))
	case "free_comic_day":
		// First Saturday of May
		if month == time.May && weekday == time.Saturday && day <= 7 {
			return 100, true
		}
	case "summer_solstice":
		return boolResult(month == time.June && day == 21)
	case "tanabata":
		return boolResult(month == time.July && day == 7 && containsString(genres, "Romance"))
	case "friday_13th":
		return boolResult(day == 13 && weekday == time.Friday && (containsString(genres, "Horror") || containsString(genres, "Thriller")))
	case "halloween_spirit", "halloween_read":
		return boolResult(month == time.October && day == 31 && containsString(genres, "Horror"))
	case "thanksgiving_binge":
		if month == time.November && weekday == time.Thursday {
			firstDay := time.Date(t.Year(), time.November, 1, 0, 0, 0, 0, t.Location())
			firstThursday := 1
			for firstDay.Weekday() != time.Thursday {
				firstDay = firstDay.AddDate(0, 0, 1)
				firstThursday = firstDay.Day()
			}
			fourthThursday := firstThursday + 21
			if day == fourthThursday {
				count := getMetaFloat(event.Metadata, "daily_episodes")
				chapterCount := getMetaFloat(event.Metadata, "daily_chapters")
				if count >= 10 || chapterCount >= 50 {
					return 100, true
				}
			}
		}
	case "christmas_special", "christmas_read":
		return boolResult(month == time.December && day == 25)
	case "new_years_eve":
		return boolResult(month == time.December && day == 31)
	case "leap_year", "leap_year_read":
		return boolResult(month == time.February && day == 29)
	case "birthday_watch", "birthday_read":
		isBirthday := getMetaBool(event.Metadata, "is_birthday")
		return boolResult(isBirthday)
	case "holiday_marathon":
		// Check Dec 24-31 streak — tracked via progress accumulation
		if month == time.December && day >= 24 && day <= 31 {
			return 100, true // Simplified: each day in range counts, full tracking in handler
		}
	}
	return 0, false
}

// boolResult converts a bool to achievement progress result.
func boolResult(ok bool) (float64, bool) {
	if ok {
		return 100, true
	}
	return 0, false
}

// evalScoring: rating-based achievements for both anime and manga.
func (e *Engine) evalScoring(def *Definition, threshold int, meta map[string]interface{}) (float64, bool) {
	// Strip prefix for generic matching
	key := def.Key
	if len(key) > 2 && (key[:2] == "a_" || key[:2] == "m_") {
		key = key[2:]
	}

	switch key {
	case "fair_judge":
		avg := getMetaFloat(meta, "average_rating")
		count := getMetaFloat(meta, "rating_count")
		if count >= 50 && avg >= 5.0 && avg <= 7.0 {
			return 100, true
		}
		return 0, false
	case "generous_spirit":
		avg := getMetaFloat(meta, "average_rating")
		count := getMetaFloat(meta, "rating_count")
		if count >= 50 && avg > 8.0 {
			return 100, true
		}
		return 0, false
	case "picky_watcher", "picky_reader":
		avg := getMetaFloat(meta, "average_rating")
		count := getMetaFloat(meta, "rating_count")
		if count >= 25 && avg < 5.0 {
			return 100, true
		}
		return 0, false
	case "bell_curve":
		bellCurve := getMetaBool(meta, "bell_curve")
		return boolResult(bellCurve)
	case "wide_range":
		usedAllScores := getMetaBool(meta, "used_all_scores")
		return boolResult(usedAllScores)
	case "score_all":
		allRated := getMetaBool(meta, "all_completed_rated")
		return boolResult(allRated)
	case "consistent_scorer":
		maxSameScore := getMetaFloat(meta, "max_same_score_count")
		return boolResult(maxSameScore >= 20)
	case "controversial":
		scoreDiff := getMetaFloat(meta, "score_diff_from_avg")
		return boolResult(scoreDiff >= 4)
	case "score_sniper":
		scoreDiff := getMetaFloat(meta, "score_diff_from_avg")
		return boolResult(scoreDiff <= 0.1 && scoreDiff >= 0)
	default:
		// Tiered rating achievements (critic, perfect_ten, harsh_critic, evolving_taste, etc.)
		val := getMetaFloat(meta, def.Key)
		if threshold > 0 && val >= float64(threshold) {
			return 100, true
		}
		if threshold > 0 {
			return (val / float64(threshold)) * 100, false
		}
		return 0, false
	}
}

// evalObscureFun: quirky/special one-time achievements for both anime and manga.
func (e *Engine) evalObscureFun(def *Definition, event *AchievementEvent, currentProgress float64) (float64, bool) {
	t := event.Timestamp

	// Strip prefix for generic matching
	key := def.Key
	if len(key) > 2 && (key[:2] == "a_" || key[:2] == "m_") {
		key = key[2:]
	}

	switch key {
	case "palindrome_day":
		dateStr := t.Format("01022006") // MMDDYYYY
		return boolResult(isPalindrome(dateStr))
	case "full_moon", "full_moon_read":
		return boolResult(isFullMoon(t) && (t.Hour() >= 20 || t.Hour() <= 5))
	case "round_number":
		completedCount := getMetaFloat(event.Metadata, "completed_count")
		return boolResult(completedCount > 0 && int(completedCount)%100 == 0)
	case "binary_day":
		return boolResult(isBinaryDate(t))
	case "fibonacci":
		completedCount := int(getMetaFloat(event.Metadata, "completed_count"))
		return boolResult(isFibonacci(completedCount))
	case "genre_clash":
		return boolResult(getMetaBool(event.Metadata, "genre_clash"))
	case "time_traveler":
		decadeCount := getMetaFloat(event.Metadata, "daily_decade_count")
		return boolResult(decadeCount >= 5)
	case "world_record":
		return boolResult(getMetaBool(event.Metadata, "is_day_record"))
	case "triple_seven":
		totalCount := getMetaFloat(event.Metadata, "total_count")
		return boolResult(int(totalCount) == 777)
	case "thousand_complete":
		completedCount := getMetaFloat(event.Metadata, "completed_count")
		return boolResult(int(completedCount) == 1000)
	case "pi_episodes":
		totalEps := getMetaFloat(event.Metadata, "total_episodes")
		return boolResult(int(totalEps) == 314)
	case "synchronicity":
		epNum := getMetaFloat(event.Metadata, "episode_number")
		return boolResult(int(epNum) == t.Day())
	case "nice":
		completedCount := getMetaFloat(event.Metadata, "completed_count")
		return boolResult(int(completedCount) == 69)
	case "power_level", "power_level_chapters":
		totalCount := getMetaFloat(event.Metadata, "total_count")
		return boolResult(totalCount > 9000)
	case "leap_year", "leap_year_read":
		return boolResult(t.Month() == time.February && t.Day() == 29)
	}
	return 0, false
}

// --- Metadata helper functions ---

func getMetaFloat(m map[string]interface{}, key string) float64 {
	if m == nil {
		return 0
	}
	v, ok := m[key]
	if !ok {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case int:
		return float64(val)
	case int64:
		return float64(val)
	default:
		return 0
	}
}

func getMetaString(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if ok {
		return s
	}
	return ""
}

func getMetaBool(m map[string]interface{}, key string) bool {
	if m == nil {
		return false
	}
	v, ok := m[key]
	if !ok {
		return false
	}
	b, ok := v.(bool)
	return ok && b
}

func getMetaStringSlice(m map[string]interface{}, key string) []string {
	if m == nil {
		return nil
	}
	v, ok := m[key]
	if !ok {
		return nil
	}
	switch val := v.(type) {
	case []string:
		return val
	case []interface{}:
		result := make([]string, 0, len(val))
		for _, item := range val {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
		return result
	}
	return nil
}

func containsString(slice []string, target string) bool {
	for _, s := range slice {
		if s == target {
			return true
		}
	}
	return false
}

// --- Math helpers ---

func isPalindrome(s string) bool {
	n := len(s)
	for i := 0; i < n/2; i++ {
		if s[i] != s[n-1-i] {
			return false
		}
	}
	return true
}

func isBinaryDate(t time.Time) bool {
	m := t.Month()
	d := t.Day()
	// Binary dates: only digits 0 and 1
	return isBinaryNum(int(m)) && isBinaryNum(d)
}

func isBinaryNum(n int) bool {
	for n > 0 {
		if n%10 > 1 {
			return false
		}
		n /= 10
	}
	return true
}

func isFibonacci(n int) bool {
	if n <= 0 {
		return false
	}
	a, b := 1, 1
	for b < n {
		a, b = b, a+b
	}
	return b == n
}

// isFullMoon performs an approximate full moon calculation.
// Uses the synodic month (29.53059 days) from a known full moon reference date.
func isFullMoon(t time.Time) bool {
	// Reference: January 6, 2023 was a full moon
	ref := time.Date(2023, 1, 6, 23, 8, 0, 0, time.UTC)
	diff := t.Sub(ref).Hours() / 24.0
	synodicMonth := 29.53059
	phase := diff / synodicMonth
	phase -= float64(int(phase))
	if phase < 0 {
		phase += 1
	}
	// Full moon at phase ~0 or ~1, allow ±1 day tolerance
	return phase < (1.0/synodicMonth) || phase > (1.0 - 1.0/synodicMonth)
}

// CollectionStats contains aggregate stats computed from AniList collection data.
// This is built by the handler/refresh logic and passed to the engine.
type CollectionStats struct {
	// Anime stats
	TotalEpisodes      int
	TotalMinutes       int
	TotalAnime         int
	CompletedAnime     int
	DroppedAnime       int
	WatchingAnime      int
	PausedAnime        int
	PTWAnime           int
	AnimeRewatches     int

	// Manga stats
	TotalChapters      int
	TotalManga         int
	CompletedManga     int
	DroppedManga       int
	ReadingManga       int
	PausedManga        int
	PTRManga           int
	MangaRereads       int

	// Common stats
	GenreCount         int
	StudioCount        int
	FormatCount        int
	DecadeCount        int
	TagCount           int
	SeasonCount        int
	YearCount          int

	// Anime format counts
	TVCount            int
	MovieCount         int
	OVACount           int
	ONACount           int
	SpecialCount       int
	ShortCount         int
	MusicCount         int
	TVShortCount       int

	// Manga format counts
	ManhwaCount        int
	ManhuaCount        int
	WebtoonCount       int
	DoujinCount        int
	LightNovelCount    int
	NovelCount         int
	OneshotCount       int

	// Scoring stats
	AnimeRatingCount   int
	MangaRatingCount   int
	AnimeAverageRating float64
	MangaAverageRating float64
	PerfectTenAnime    int
	PerfectTenManga    int
	HarshCriticAnime   int
	HarshCriticManga   int

	// Per-genre counts
	AnimeGenreCounts   map[string]int
	MangaGenreCounts   map[string]int

	// Per-format counts
	AnimeFormatCounts  map[string]int
	MangaFormatCounts  map[string]int
}

func (s *CollectionStats) toMetadata() map[string]interface{} {
	m := map[string]interface{}{
		// Anime milestones
		"a_episode_counter":   float64(s.TotalEpisodes),
		"a_episode_titan":     float64(s.TotalEpisodes),
		"a_hours_invested":    float64(s.TotalMinutes) / 60.0,
		"a_time_lord":         float64(s.TotalMinutes) / 60.0,
		"a_anime_collector":   float64(s.TotalAnime),
		"a_library_legend":    float64(s.TotalAnime),
		"a_hundred_club":      float64(s.CompletedAnime),
		"a_ten_thousand_min":  float64(s.TotalMinutes),
		"a_season_veteran":    float64(s.SeasonCount),
		"a_year_explorer":     float64(s.YearCount),
		"a_five_hundred_eps":  float64(s.TotalEpisodes),
		"a_thousand_eps":      float64(s.TotalEpisodes),
		"a_watching_ten":      float64(s.WatchingAnime),
		"a_ptw_hoarder":       float64(s.PTWAnime),
		"a_dropped_honesty":   float64(s.DroppedAnime),

		// Anime completion
		"a_completionist":      float64(s.CompletedAnime),
		"a_mega_completionist": float64(s.CompletedAnime),
		"a_no_drop":            float64(s.CompletedAnime), // Checked with DroppedAnime == 0 condition
		"a_rewatch_master":     float64(s.AnimeRewatches),
		"a_zero_to_hero":       float64(s.CompletedAnime),

		// Anime genres
		"a_genre_action":        float64(s.AnimeGenreCounts["Action"]),
		"a_genre_adventure":     float64(s.AnimeGenreCounts["Adventure"]),
		"a_genre_comedy":        float64(s.AnimeGenreCounts["Comedy"]),
		"a_genre_drama":         float64(s.AnimeGenreCounts["Drama"]),
		"a_genre_fantasy":       float64(s.AnimeGenreCounts["Fantasy"]),
		"a_genre_horror":        float64(s.AnimeGenreCounts["Horror"]),
		"a_genre_mystery":       float64(s.AnimeGenreCounts["Mystery"]),
		"a_genre_romance":       float64(s.AnimeGenreCounts["Romance"]),
		"a_genre_scifi":         float64(s.AnimeGenreCounts["Sci-Fi"]),
		"a_genre_sol":           float64(s.AnimeGenreCounts["Slice of Life"]),
		"a_genre_sports":        float64(s.AnimeGenreCounts["Sports"]),
		"a_genre_supernatural":  float64(s.AnimeGenreCounts["Supernatural"]),
		"a_genre_thriller":      float64(s.AnimeGenreCounts["Thriller"]),
		"a_genre_mecha":         float64(s.AnimeGenreCounts["Mecha"]),
		"a_genre_music":         float64(s.AnimeGenreCounts["Music"]),
		"a_genre_psychological": float64(s.AnimeGenreCounts["Psychological"]),

		// Anime discovery
		"a_genre_explorer":   float64(s.GenreCount),
		"a_studio_hopper":    float64(s.StudioCount),
		"a_tag_explorer":     float64(s.TagCount),
		"a_decade_hopper":    float64(s.DecadeCount),

		// Anime formats
		"a_tv_watcher":       float64(s.TVCount),
		"a_movie_buff":       float64(s.MovieCount),
		"a_ova_hunter":       float64(s.OVACount),
		"a_ona_explorer":     float64(s.ONACount),
		"a_special_watcher":  float64(s.SpecialCount),
		"a_short_king":       float64(s.ShortCount),
		"a_music_video":      float64(s.MusicCount),
		"a_tv_short":         float64(s.TVShortCount),

		// Anime scoring
		"a_critic":        float64(s.AnimeRatingCount),
		"a_perfect_ten":   float64(s.PerfectTenAnime),
		"a_harsh_critic":  float64(s.HarshCriticAnime),
		"a_100_rated":     float64(s.AnimeRatingCount),
		"a_500_rated":     float64(s.AnimeRatingCount),
		"average_rating":  s.AnimeAverageRating,
		"rating_count":    float64(s.AnimeRatingCount),

		// Anime dedication
		"a_studio_devotee":  float64(s.StudioCount),
		"a_decade_watcher":  float64(s.DecadeCount),

		// Manga milestones
		"m_chapter_counter":  float64(s.TotalChapters),
		"m_chapter_titan":    float64(s.TotalChapters),
		"m_reading_hours":    float64(s.TotalChapters) * 7.0 / 60.0,
		"m_reading_time_lord": float64(s.TotalChapters) * 7.0 / 60.0,
		"m_manga_collector":  float64(s.TotalManga),
		"m_library_legend":   float64(s.TotalManga),
		"m_hundred_club":     float64(s.CompletedManga),
		"m_ten_thousand_pages": float64(s.TotalChapters) * 20.0,
		"m_year_explorer":    float64(s.YearCount),
		"m_five_hundred_ch":  float64(s.TotalChapters),
		"m_thousand_ch":      float64(s.TotalChapters),
		"m_reading_ten":      float64(s.ReadingManga),
		"m_ptr_hoarder":      float64(s.PTRManga),
		"m_dropped_honesty":  float64(s.DroppedManga),

		// Manga completion
		"m_completionist":       float64(s.CompletedManga),
		"m_mega_completionist":  float64(s.CompletedManga),
		"m_no_drop":             float64(s.CompletedManga),
		"m_reread_master":       float64(s.MangaRereads),
		"m_zero_to_hundred":     float64(s.CompletedManga),

		// Manga genres
		"m_genre_action":        float64(s.MangaGenreCounts["Action"]),
		"m_genre_adventure":     float64(s.MangaGenreCounts["Adventure"]),
		"m_genre_comedy":        float64(s.MangaGenreCounts["Comedy"]),
		"m_genre_drama":         float64(s.MangaGenreCounts["Drama"]),
		"m_genre_fantasy":       float64(s.MangaGenreCounts["Fantasy"]),
		"m_genre_horror":        float64(s.MangaGenreCounts["Horror"]),
		"m_genre_mystery":       float64(s.MangaGenreCounts["Mystery"]),
		"m_genre_romance":       float64(s.MangaGenreCounts["Romance"]),
		"m_genre_scifi":         float64(s.MangaGenreCounts["Sci-Fi"]),
		"m_genre_sol":           float64(s.MangaGenreCounts["Slice of Life"]),
		"m_genre_sports":        float64(s.MangaGenreCounts["Sports"]),
		"m_genre_supernatural":  float64(s.MangaGenreCounts["Supernatural"]),
		"m_genre_thriller":      float64(s.MangaGenreCounts["Thriller"]),
		"m_genre_psychological": float64(s.MangaGenreCounts["Psychological"]),
		"m_genre_isekai":        float64(s.MangaGenreCounts["Isekai"]),
		"m_genre_shounen":       float64(s.MangaGenreCounts["Shounen"]),

		// Manga discovery
		"m_genre_explorer":    float64(s.GenreCount),
		"m_tag_explorer":      float64(s.TagCount),
		"m_decade_hopper":     float64(s.DecadeCount),
		"m_manhwa_reader":     float64(s.ManhwaCount),
		"m_manhua_reader":     float64(s.ManhuaCount),

		// Manga creative
		"m_webtoon_reader":    float64(s.WebtoonCount),
		"m_doujin_reader":     float64(s.DoujinCount),
		"m_light_novel_reader": float64(s.LightNovelCount),
		"m_novel_reader":      float64(s.NovelCount),
		"m_oneshot_reader":    float64(s.OneshotCount),

		// Manga scoring
		"m_critic":        float64(s.MangaRatingCount),
		"m_perfect_ten":   float64(s.PerfectTenManga),
		"m_harsh_critic":  float64(s.HarshCriticManga),
		"m_100_rated":     float64(s.MangaRatingCount),
		"m_500_rated":     float64(s.MangaRatingCount),

		// Manga dedication
		"m_decade_reader":  float64(s.DecadeCount),

		// Shared metadata
		"completed_count": float64(s.CompletedAnime + s.CompletedManga),
		"total_count":     float64(s.TotalEpisodes + s.TotalChapters),
		"total_episodes":  float64(s.TotalEpisodes),
	}
	return m
}
