package achievement

import (
	"math"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// CurrentXPVersion is bumped whenever the XP formula changes to trigger retroactive recalculation.
const CurrentXPVersion = 2

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

	case CategoryAnimeMeta, CategoryMangaMeta:
		return e.evalMeta(def, threshold, event)
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

	// Award XP: base × difficulty × current Activity Buff (up to 3x for full daily activity).
	xp := 0
	if !isNoXPAchievement(def.Key) {
		baseXP := def.XPReward
		if baseXP <= 0 {
			baseXP = DefaultTierXP(tier)
		}
		activityBuff, _ := database.ComputeActivityBuff()
		xp = int(math.Round(float64(baseXP) * DifficultyMultiplier(def.Difficulty) * activityBuff))
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
		Description: FormatThreshold(def.Description, def.TierThresholds, tier),
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

	// After unlocking a non-meta achievement, fire meta re-evaluation
	if def.Category != CategoryAnimeMeta && def.Category != CategoryMangaMeta {
		metaEvent := &AchievementEvent{
			ProfileID: profileID,
			Trigger:   TriggerAchievementUnlock,
			Timestamp: time.Now(),
			Metadata:  map[string]interface{}{"unlocked_key": def.Key},
		}
		for i := range AllDefinitions {
			metaDef := &AllDefinitions[i]
			if metaDef.Category != CategoryAnimeMeta && metaDef.Category != CategoryMangaMeta {
				continue
			}
			if !e.triggerMatches(metaDef, TriggerAchievementUnlock) {
				continue
			}
			e.evaluateDefinition(database, metaDef, metaEvent)
		}
	}
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

// RunStartupMigrations checks all given databases for XP version mismatches and recalculates if needed.
// Called once at app startup for all known profile databases.
func (e *Engine) RunStartupMigrations(databases []*db.Database) {
	for _, database := range databases {
		version, err := database.GetXPVersion()
		if err != nil {
			e.logger.Warn().Err(err).Msg("achievement: failed to get XP version for migration check")
			continue
		}
		if version < CurrentXPVersion {
			e.logger.Info().Int("oldVersion", version).Int("newVersion", CurrentXPVersion).Msg("achievement: recalculating XP for profile database")
			if err := e.RecalculateXP(database); err != nil {
				e.logger.Error().Err(err).Msg("achievement: failed to recalculate XP")
				continue
			}
			if err := database.SetXPVersion(CurrentXPVersion); err != nil {
				e.logger.Error().Err(err).Msg("achievement: failed to update XP version")
			}
		}
	}
}

// RecalculateXP recomputes total XP from all unlocked achievements using current difficulty multipliers
// and the current Activity Buff, then updates the level progress.
func (e *Engine) RecalculateXP(database *db.Database) error {
	unlocked, err := database.GetUnlockedAchievements()
	if err != nil {
		return err
	}

	totalXP := 0
	for _, a := range unlocked {
		def, ok := e.defMap[a.Key]
		if !ok {
			continue
		}
		if isNoXPAchievement(a.Key) {
			continue
		}
		baseXP := def.XPReward
		if baseXP <= 0 {
			baseXP = DefaultTierXP(a.Tier)
		}
		xp := int(math.Round(float64(baseXP) * DifficultyMultiplier(def.Difficulty)))
		totalXP += xp
	}

	e.logger.Info().Int("totalXP", totalXP).Int("unlockedCount", len(unlocked)).Msg("achievement: recalculated XP")
	return database.SetXP(totalXP)
}

// isNoXPAchievement marks achievements that should never grant XP.
func isNoXPAchievement(key string) bool {
	switch key {
	case "a_ptw_hoarder", "m_ptr_hoarder", "a_from_ptw", "m_from_ptr":
		return true
	default:
		return false
	}
}

// --- Evaluator helpers ---

// evalStatOrFirst: for stat-based categories. If metadata has def.Key, use stat threshold.
// If def is one-time (tier 0) and no stat available, treat as first-event unlock.
func (e *Engine) evalStatOrFirst(meta map[string]interface{}, def *Definition, threshold int, event *AchievementEvent) (float64, bool) {
	val := getMetaFloat(meta, def.Key)
	if val > 0 || threshold > 0 {
		return e.evalStatThreshold(meta, def, threshold)
	}
	// One-time achievement with no matching metadata key:
	// Only auto-unlock for event-driven triggers (e.g. first episode watched).
	// During a collection refresh we have full stats context, so the absence of a
	// matching key means the condition simply hasn't been met yet.
	if def.MaxTier == 0 && event.Trigger != TriggerCollectionRefresh {
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
	isManga := len(key) > 2 && key[:2] == "m_"
	if len(key) > 2 && (key[:2] == "a_" || key[:2] == "m_") {
		key = key[2:]
	}

	// Helper to pick anime or manga metadata based on prefix
	avgKey := "average_rating"
	countKey := "rating_count"
	bellKey := "bell_curve"
	allScoresKey := "used_all_scores"
	allRatedKey := "all_completed_rated"
	maxSameKey := "max_same_score_count"
	varianceKey := "score_variance"
	mediocreKey := "mediocre_count"
	if isManga {
		avgKey = "manga_average_rating"
		countKey = "manga_rating_count"
		bellKey = "manga_bell_curve"
		allScoresKey = "manga_used_all_scores"
		allRatedKey = "manga_all_completed_rated"
		maxSameKey = "manga_max_same_score_count"
		varianceKey = "manga_score_variance"
		mediocreKey = "manga_mediocre_count"
	}

	switch key {
	case "fair_judge":
		avg := getMetaFloat(meta, avgKey)
		count := getMetaFloat(meta, countKey)
		if count >= 50 && avg >= 5.0 && avg <= 7.0 {
			return 100, true
		}
		return 0, false
	case "generous_spirit":
		avg := getMetaFloat(meta, avgKey)
		count := getMetaFloat(meta, countKey)
		if count >= 50 && avg > 8.0 {
			return 100, true
		}
		return 0, false
	case "picky_watcher", "picky_reader":
		avg := getMetaFloat(meta, avgKey)
		count := getMetaFloat(meta, countKey)
		if count >= 25 && avg < 5.0 {
			return 100, true
		}
		return 0, false
	case "bell_curve":
		bellCurve := getMetaBool(meta, bellKey)
		return boolResult(bellCurve)
	case "wide_range":
		usedAllScores := getMetaBool(meta, allScoresKey)
		return boolResult(usedAllScores)
	case "score_all":
		allRated := getMetaBool(meta, allRatedKey)
		return boolResult(allRated)
	case "consistent_scorer":
		maxSameScore := getMetaFloat(meta, maxSameKey)
		return boolResult(maxSameScore >= 20)
	case "controversial":
		scoreDiff := getMetaFloat(meta, "score_diff_from_avg")
		return boolResult(scoreDiff >= 4)
	case "score_sniper":
		scoreDiff := getMetaFloat(meta, "score_diff_from_avg")
		return boolResult(scoreDiff <= 0.1 && scoreDiff >= 0)
	case "mean_above_8":
		avg := getMetaFloat(meta, avgKey)
		count := getMetaFloat(meta, countKey)
		if count >= 50 && avg > 8.0 {
			return 100, true
		}
		return 0, false
	case "mediocre_majority":
		mediocre := getMetaFloat(meta, mediocreKey)
		count := getMetaFloat(meta, countKey)
		if count >= 20 && mediocre > count*0.6 {
			return 100, true
		}
		return 0, false
	case "score_distributor":
		usedAll := getMetaBool(meta, allScoresKey)
		variance := getMetaFloat(meta, varianceKey)
		// Scores spread relatively evenly (low variance relative to count)
		if usedAll && variance < 3.0 {
			return 100, true
		}
		return 0, false
	case "score_variance":
		variance := getMetaFloat(meta, varianceKey)
		count := getMetaFloat(meta, countKey)
		// High variance in scores indicates eclectic taste
		if count >= 20 && variance >= 4.0 {
			return 100, true
		}
		return 0, false
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
	case "all_tens":
		// Complete an anime with exactly 10 episodes and rate it 10
		completedCount := getMetaFloat(event.Metadata, "completed_count")
		return boolResult(completedCount > 0) // simplified: check from event handler
	case "answer_42":
		completedCount := int(getMetaFloat(event.Metadata, "completed_count"))
		return boolResult(completedCount == 42)
	case "double_digits":
		completedCount := int(getMetaFloat(event.Metadata, "completed_count"))
		return boolResult(completedCount == 11)
	case "exact_hundred_eps":
		totalEps := int(getMetaFloat(event.Metadata, "total_episodes"))
		return boolResult(totalEps == 100)
	case "exact_hundred_ch":
		totalCh := int(getMetaFloat(event.Metadata, "total_chapters"))
		return boolResult(totalCh == 100)
	case "lucky_seven":
		completedCount := int(getMetaFloat(event.Metadata, "completed_count"))
		return boolResult(completedCount == 7)
	case "one_two_three":
		completedCount := int(getMetaFloat(event.Metadata, "completed_count"))
		return boolResult(completedCount == 123)
	case "prime_count":
		completedCount := int(getMetaFloat(event.Metadata, "completed_count"))
		return boolResult(isPrime(completedCount) && completedCount >= 7)
	case "square_number":
		completedCount := int(getMetaFloat(event.Metadata, "completed_count"))
		n := int(math.Sqrt(float64(completedCount)))
		return boolResult(completedCount >= 4 && n*n == completedCount)
	case "year_match_count":
		completedCount := int(getMetaFloat(event.Metadata, "completed_count"))
		return boolResult(completedCount == t.Year()%100)
	case "pi_chapters":
		totalCh := int(getMetaFloat(event.Metadata, "total_chapters"))
		return boolResult(totalCh == 314)
	}
	return 0, false
}

// evalMeta evaluates meta-achievements by querying the achievement database.
func (e *Engine) evalMeta(def *Definition, threshold int, event *AchievementEvent) (float64, bool) {
	database, err := e.getDB(event.ProfileID)
	if err != nil {
		return 0, false
	}

	allAchievements, err := database.GetAllAchievements()
	if err != nil {
		return 0, false
	}

	key := def.Key
	isManga := len(key) > 2 && key[:2] == "m_"
	if len(key) > 2 && (key[:2] == "a_" || key[:2] == "m_") {
		key = key[2:]
	}

	// Build stats from unlocked achievements
	var unlocked int
	var totalXP int
	categoryUnlocks := make(map[string]int) // category -> unlock count
	tierMaxCount := 0
	tier5Count := 0
	easyCount := 0
	hardCount := 0

	for _, ach := range allAchievements {
		if !ach.IsUnlocked {
			continue
		}
		// Find the definition for this achievement
		achDef := findDefinition(ach.Key)
		if achDef == nil {
			continue
		}

		// Only count anime achievements for anime meta, manga for manga meta
		isAchManga := len(achDef.Key) > 2 && achDef.Key[:2] == "m_"
		if isManga != isAchManga {
			continue
		}

		// Don't count meta achievements toward their own stats
		if achDef.Category == CategoryAnimeMeta || achDef.Category == CategoryMangaMeta {
			continue
		}

		unlocked++
		categoryUnlocks[string(achDef.Category)]++

		baseXP := achDef.XPReward
		if baseXP <= 0 {
			baseXP = DefaultTierXP(ach.Tier)
		}
		totalXP += int(float64(baseXP) * DifficultyMultiplier(achDef.Difficulty))

		if achDef.MaxTier > 0 && ach.Tier >= achDef.MaxTier {
			tierMaxCount++
		}
		if achDef.MaxTier > 0 && ach.Tier >= 5 {
			tier5Count++
		}

		switch achDef.Difficulty {
		case DifficultyEasy:
			easyCount++
		case DifficultyHard, DifficultyExtreme:
			hardCount++
		}
	}

	// Count total non-meta definitions to compute percentages
	totalDefs := 0
	for i := range AllDefinitions {
		d := &AllDefinitions[i]
		if d.Category == CategoryAnimeMeta || d.Category == CategoryMangaMeta {
			continue
		}
		isDefManga := len(d.Key) > 2 && d.Key[:2] == "m_"
		if isManga == isDefManga {
			totalDefs++
		}
	}

	// Count categories with 10+ unlocks (for diverse)
	diverseCategories := 0
	for _, count := range categoryUnlocks {
		if count >= 10 {
			diverseCategories++
		}
	}

	switch key {
	case "meta_first_unlock":
		return boolResult(unlocked >= 1)
	case "meta_collector":
		if threshold <= 0 {
			return boolResult(unlocked > 0)
		}
		if unlocked >= threshold {
			return 100, true
		}
		return (float64(unlocked) / float64(threshold)) * 100, false
	case "meta_category_starter":
		startedCategories := len(categoryUnlocks)
		if threshold <= 0 {
			return boolResult(startedCategories > 0)
		}
		if startedCategories >= threshold {
			return 100, true
		}
		return (float64(startedCategories) / float64(threshold)) * 100, false
	case "meta_tier_climber":
		if threshold <= 0 {
			return boolResult(tier5Count > 0)
		}
		if tier5Count >= threshold {
			return 100, true
		}
		return (float64(tier5Count) / float64(threshold)) * 100, false
	case "meta_tier_max":
		if threshold <= 0 {
			return boolResult(tierMaxCount > 0)
		}
		if tierMaxCount >= threshold {
			return 100, true
		}
		return (float64(tierMaxCount) / float64(threshold)) * 100, false
	case "meta_xp_earner":
		if threshold <= 0 {
			return boolResult(totalXP > 0)
		}
		if totalXP >= threshold {
			return 100, true
		}
		return (float64(totalXP) / float64(threshold)) * 100, false
	case "meta_difficulty_easy":
		if threshold <= 0 {
			return boolResult(easyCount > 0)
		}
		if easyCount >= threshold {
			return 100, true
		}
		return (float64(easyCount) / float64(threshold)) * 100, false
	case "meta_difficulty_hard":
		if threshold <= 0 {
			return boolResult(hardCount > 0)
		}
		if hardCount >= threshold {
			return 100, true
		}
		return (float64(hardCount) / float64(threshold)) * 100, false
	case "meta_unlock_spree":
		// Check unlocks from today
		todayCount := 0
		today := event.Timestamp.Format("2006-01-02")
		for _, ach := range allAchievements {
			if ach.IsUnlocked && ach.UnlockedAt != nil && ach.UnlockedAt.Format("2006-01-02") == today {
				achDef := findDefinition(ach.Key)
				if achDef != nil {
					isAchManga := len(achDef.Key) > 2 && achDef.Key[:2] == "m_"
					if isManga == isAchManga {
						todayCount++
					}
				}
			}
		}
		return boolResult(todayCount >= 5)
	case "meta_completionist":
		if totalDefs == 0 {
			return 0, false
		}
		pct := float64(unlocked) / float64(totalDefs) * 100
		return boolResult(pct >= 90)
	case "meta_diverse":
		if threshold <= 0 {
			return boolResult(diverseCategories > 0)
		}
		if diverseCategories >= threshold {
			return 100, true
		}
		return (float64(diverseCategories) / float64(threshold)) * 100, false
	case "meta_dominator":
		return boolResult(totalDefs > 0 && unlocked >= totalDefs)
	}

	return 0, false
}

// findDefinition returns the definition for a given key, or nil if not found.
func findDefinition(key string) *Definition {
	for i := range AllDefinitions {
		if AllDefinitions[i].Key == key {
			return &AllDefinitions[i]
		}
	}
	return nil
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

// boolToFloat converts a bool to a float64 (1.0 = true, 0.0 = false).
// Used to express boolean conditions as metadata values for stat-based achievements.
func boolToFloat(b bool) float64 {
	if b {
		return 1.0
	}
	return 0.0
}

// --- Math helpers ---

func isPrime(n int) bool {
	if n < 2 {
		return false
	}
	if n < 4 {
		return true
	}
	if n%2 == 0 || n%3 == 0 {
		return false
	}
	for i := 5; i*i <= n; i += 6 {
		if n%i == 0 || n%(i+2) == 0 {
			return false
		}
	}
	return true
}

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

	// Per-tag counts (from AniList media tags)
	AnimeTagCounts     map[string]int
	MangaTagCounts     map[string]int

	// Per-format counts
	AnimeFormatCounts  map[string]int
	MangaFormatCounts  map[string]int

	// Favourites
	AnimeFavoriteCount int
	MangaFavoriteCount int

	// Unique format counts
	AnimeUniqueFormatCount int
	MangaUniqueFormatCount int

	// Standard manga format count (not manhwa/manhua)
	MangaStandardCount int

	// Scoring metadata (pre-computed for evalScoring)
	BellCurveAnime         bool
	BellCurveManga         bool
	UsedAllScoresAnime     bool
	UsedAllScoresManga     bool
	AllCompletedRatedAnime bool
	AllCompletedRatedManga bool
	MaxSameScoreAnime      int
	MaxSameScoreManga      int
	ScoreVarianceAnime     float64
	ScoreVarianceManga     float64
	MediocreCountAnime     int // count of anime rated 5-7
	MediocreCountManga     int // count of manga rated 5-7

	// Per-score histogram
	AnimeScoreHist [11]int // index 0 unused, 1-10
	MangaScoreHist [11]int
}

func (s *CollectionStats) toMetadata() map[string]interface{} {
	// Pre-compute derived values
	animeCompletionRate := 0.0
	if s.TotalAnime > 0 {
		animeCompletionRate = float64(s.CompletedAnime) / float64(s.TotalAnime) * 100.0
	}
	mangaCompletionRate := 0.0
	if s.TotalManga > 0 {
		mangaCompletionRate = float64(s.CompletedManga) / float64(s.TotalManga) * 100.0
	}

	m := map[string]interface{}{
		// ── Anime milestones ──────────────────────────────────────────────────────
		// Tiered (raw counts — evalStatThreshold uses tier thresholds)
		"a_episode_counter": float64(s.TotalEpisodes),
		"a_episode_titan":   float64(s.TotalEpisodes),
		"a_hours_invested":  float64(s.TotalMinutes) / 60.0,
		"a_time_lord":       float64(s.TotalMinutes) / 60.0,
		"a_anime_collector": float64(s.TotalAnime),
		"a_library_legend":  float64(s.TotalAnime),
		"a_season_veteran":  float64(s.SeasonCount),
		"a_year_explorer":   float64(s.YearCount),
		"a_ptw_hoarder":     float64(s.PTWAnime),
		"a_dropped_honesty": float64(s.DroppedAnime),
		// One-time (boolean: 1.0 when condition met, 0.0 otherwise)
		"a_first_episode":   boolToFloat(s.TotalEpisodes > 0),
		"a_first_day":       boolToFloat(s.TotalEpisodes > 0),
		"a_first_complete":  boolToFloat(s.CompletedAnime > 0),
		"a_first_rating":    boolToFloat(s.AnimeRatingCount > 0),
		"a_hundred_club":    boolToFloat(s.CompletedAnime >= 100),
		"a_ten_thousand_min": boolToFloat(s.TotalMinutes >= 10000),
		"a_five_hundred_eps": boolToFloat(s.TotalEpisodes >= 500),
		"a_thousand_eps":    boolToFloat(s.TotalEpisodes >= 1000),
		"a_watching_ten":    boolToFloat(s.WatchingAnime >= 10),
		// New milestones
		"a_five_thousand_eps":      boolToFloat(s.TotalEpisodes >= 5000),
		"a_ten_completed":          boolToFloat(s.CompletedAnime >= 10),
		"a_fifty_completed":        boolToFloat(s.CompletedAnime >= 50),
		"a_five_hundred_completed": boolToFloat(s.CompletedAnime >= 500),
		"a_mean_score_tracker":     float64(s.AnimeRatingCount),
		"a_unique_studios":         float64(s.StudioCount),
		"a_days_spent_watching":    float64(s.TotalMinutes) / 1440.0,
		"a_all_status":             boolToFloat(s.WatchingAnime > 0 && s.CompletedAnime > 0 && s.PausedAnime > 0 && s.DroppedAnime > 0 && s.PTWAnime > 0),
		"a_first_favorite":         boolToFloat(s.AnimeFavoriteCount > 0),
		"a_favorites_collector":    float64(s.AnimeFavoriteCount),

		// ── Anime completion ─────────────────────────────────────────────────────
		// Tiered
		"a_completionist":      float64(s.CompletedAnime),
		"a_mega_completionist": float64(s.CompletedAnime),
		// a_no_drop: progress only counts when nothing has been dropped
		"a_no_drop":        boolToFloat(s.DroppedAnime == 0) * float64(s.CompletedAnime),
		"a_rewatch_master": float64(s.AnimeRewatches),
		// One-time
		"a_zero_to_hero":       boolToFloat(s.CompletedAnime >= 100),
		"a_completion_rate_50": boolToFloat(animeCompletionRate >= 50),
		"a_completion_rate_75": boolToFloat(animeCompletionRate >= 75),
		"a_completion_rate_90": boolToFloat(animeCompletionRate >= 90),
		"a_clean_list":         boolToFloat(s.TotalAnime > 0 && s.PausedAnime == 0),

		// ── Anime genres (tiered) ─────────────────────────────────────────────────
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

		// ── Anime discovery (tiered) ──────────────────────────────────────────────
		"a_genre_explorer": float64(s.GenreCount),
		"a_studio_hopper":  float64(s.StudioCount),
		"a_tag_explorer":   float64(s.TagCount),
		"a_decade_hopper":  float64(s.DecadeCount),

		// ── Anime formats (tiered) ────────────────────────────────────────────────
		"a_tv_watcher":      float64(s.TVCount),
		"a_movie_buff":      float64(s.MovieCount),
		"a_ova_hunter":      float64(s.OVACount),
		"a_ona_explorer":    float64(s.ONACount),
		"a_special_watcher": float64(s.SpecialCount),
		"a_short_king":      float64(s.ShortCount),
		"a_music_video":     float64(s.MusicCount),
		"a_tv_short":        float64(s.TVShortCount),

		// ── Anime scoring ─────────────────────────────────────────────────────────
		"a_critic":       float64(s.AnimeRatingCount),
		"a_perfect_ten":  float64(s.PerfectTenAnime),
		"a_harsh_critic": float64(s.HarshCriticAnime),
		"a_100_rated":    float64(s.AnimeRatingCount),
		"a_500_rated":    float64(s.AnimeRatingCount),
		"average_rating": s.AnimeAverageRating,
		"rating_count":   float64(s.AnimeRatingCount),

		// ── Anime dedication (tiered) ─────────────────────────────────────────────
		"a_studio_devotee": float64(s.StudioCount),
		"a_decade_watcher": float64(s.DecadeCount),

		// ── Manga milestones ───────────────────────────────────────────────────────
		// Tiered
		"m_chapter_counter":   float64(s.TotalChapters),
		"m_chapter_titan":     float64(s.TotalChapters),
		"m_reading_hours":     float64(s.TotalChapters) * 7.0 / 60.0,
		"m_reading_time_lord": float64(s.TotalChapters) * 7.0 / 60.0,
		"m_manga_collector":   float64(s.TotalManga),
		"m_library_legend":    float64(s.TotalManga),
		"m_year_explorer":     float64(s.YearCount),
		"m_ptr_hoarder":       float64(s.PTRManga),
		"m_dropped_honesty":   float64(s.DroppedManga),
		// One-time
		"m_first_chapter":    boolToFloat(s.TotalChapters > 0),
		"m_first_day":        boolToFloat(s.TotalChapters > 0),
		"m_first_complete":   boolToFloat(s.CompletedManga > 0),
		"m_first_rating":     boolToFloat(s.MangaRatingCount > 0),
		"m_hundred_club":     boolToFloat(s.CompletedManga >= 100),
		"m_ten_thousand_pages": boolToFloat(s.TotalChapters >= 500), // 500 ch × 20 pages = 10 000 pages
		"m_five_hundred_ch":  boolToFloat(s.TotalChapters >= 500),
		"m_thousand_ch":      boolToFloat(s.TotalChapters >= 1000),
		"m_reading_ten":      boolToFloat(s.ReadingManga >= 10),

		// ── Manga completion ───────────────────────────────────────────────────────
		// Tiered
		"m_completionist":      float64(s.CompletedManga),
		"m_mega_completionist": float64(s.CompletedManga),
		// m_no_drop: progress only counts when nothing has been dropped
		"m_no_drop":       boolToFloat(s.DroppedManga == 0) * float64(s.CompletedManga),
		"m_reread_master": float64(s.MangaRereads),
		// One-time
		"m_zero_to_hundred":    boolToFloat(s.CompletedManga >= 100),
		"m_completion_rate_50": boolToFloat(mangaCompletionRate >= 50),
		"m_completion_rate_75": boolToFloat(mangaCompletionRate >= 75),
		"m_completion_rate_90": boolToFloat(mangaCompletionRate >= 90),
		"m_clean_list":         boolToFloat(s.TotalManga > 0 && s.PausedManga == 0),

		// ── Manga genres (tiered) ──────────────────────────────────────────────────
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

		// ── Manga discovery (tiered) ───────────────────────────────────────────────
		"m_genre_explorer": float64(s.GenreCount),
		"m_tag_explorer":   float64(s.TagCount),
		"m_decade_hopper":  float64(s.DecadeCount),
		"m_manhwa_reader":  float64(s.ManhwaCount),
		"m_manhua_reader":  float64(s.ManhuaCount),

		// ── Manga creative (tiered) ────────────────────────────────────────────────
		"m_webtoon_reader":     float64(s.WebtoonCount),
		"m_doujin_reader":      float64(s.DoujinCount),
		"m_light_novel_reader": float64(s.LightNovelCount),
		"m_novel_reader":       float64(s.NovelCount),
		"m_oneshot_reader":     float64(s.OneshotCount),

		// ── Manga scoring ──────────────────────────────────────────────────────────
		"m_critic":       float64(s.MangaRatingCount),
		"m_perfect_ten":  float64(s.PerfectTenManga),
		"m_harsh_critic": float64(s.HarshCriticManga),
		"m_100_rated":    float64(s.MangaRatingCount),
		"m_500_rated":    float64(s.MangaRatingCount),

		// ── Manga milestones (new) ─────────────────────────────────────────────────
		"m_all_status":             boolToFloat(s.ReadingManga > 0 && s.CompletedManga > 0 && s.PausedManga > 0 && s.DroppedManga > 0 && s.PTRManga > 0),
		"m_fifty_completed":        boolToFloat(s.CompletedManga >= 50),
		"m_first_favorite":         boolToFloat(s.MangaFavoriteCount > 0),
		"m_five_hundred_completed": boolToFloat(s.CompletedManga >= 500),
		"m_five_thousand_ch":       boolToFloat(s.TotalChapters >= 5000),
		"m_ten_completed":          boolToFloat(s.CompletedManga >= 10),
		"m_favorites_collector":    float64(s.MangaFavoriteCount),
		"m_days_spent_reading":     float64(s.TotalChapters) * 7.0 / 1440.0,

		// ── Manga dedication (tiered) ──────────────────────────────────────────────
		"m_decade_reader": float64(s.DecadeCount),

		// ── Anime tags (tiered) ────────────────────────────────────────────────────
		"a_tag_isekai":           float64(s.AnimeTagCounts["Isekai"]),
		"a_tag_harem":            float64(s.AnimeTagCounts["Harem"]),
		"a_tag_bl":               float64(s.AnimeTagCounts["Boys' Love"]),
		"a_tag_gl":               float64(s.AnimeTagCounts["Girls' Love"]),
		"a_tag_historical":       float64(s.AnimeTagCounts["Historical"]),
		"a_tag_military":         float64(s.AnimeTagCounts["Military"]),
		"a_tag_school":           float64(s.AnimeTagCounts["School"]),
		"a_tag_martial_arts":     float64(s.AnimeTagCounts["Martial Arts"]),
		"a_tag_vampire":          float64(s.AnimeTagCounts["Vampire"]),
		"a_tag_samurai":          float64(s.AnimeTagCounts["Samurai"]),
		"a_tag_space":            float64(s.AnimeTagCounts["Space"]),
		"a_tag_parody":           float64(s.AnimeTagCounts["Parody"]),
		"a_tag_idol":             float64(s.AnimeTagCounts["Idol"]),
		"a_tag_post_apocalyptic": float64(s.AnimeTagCounts["Post-Apocalyptic"]),
		"a_tag_cyberpunk":        float64(s.AnimeTagCounts["Cyberpunk"]),
		"a_tag_shounen":          float64(s.AnimeTagCounts["Shounen"]),
		"a_tag_seinen":           float64(s.AnimeTagCounts["Seinen"]),
		"a_tag_shoujo":           float64(s.AnimeTagCounts["Shoujo"]),
		"a_tag_josei":            float64(s.AnimeTagCounts["Josei"]),
		"a_tag_survival":         float64(s.AnimeTagCounts["Survival"]),

		// ── Manga tags (tiered) ────────────────────────────────────────────────────
		"m_tag_isekai_new":       float64(s.MangaTagCounts["Isekai"]),
		"m_tag_harem":            float64(s.MangaTagCounts["Harem"]),
		"m_tag_bl":               float64(s.MangaTagCounts["Boys' Love"]),
		"m_tag_gl":               float64(s.MangaTagCounts["Girls' Love"]),
		"m_tag_historical":       float64(s.MangaTagCounts["Historical"]),
		"m_tag_military":         float64(s.MangaTagCounts["Military"]),
		"m_tag_school":           float64(s.MangaTagCounts["School"]),
		"m_tag_martial_arts":     float64(s.MangaTagCounts["Martial Arts"]),
		"m_tag_vampire":          float64(s.MangaTagCounts["Vampire"]),
		"m_tag_samurai":          float64(s.MangaTagCounts["Samurai"]),
		"m_tag_space":            float64(s.MangaTagCounts["Space"]),
		"m_tag_parody":           float64(s.MangaTagCounts["Parody"]),
		"m_tag_idol":             float64(s.MangaTagCounts["Idol"]),
		"m_tag_post_apocalyptic": float64(s.MangaTagCounts["Post-Apocalyptic"]),
		"m_tag_cyberpunk":        float64(s.MangaTagCounts["Cyberpunk"]),
		"m_tag_shoujo":           float64(s.MangaTagCounts["Shoujo"]),
		"m_tag_survival":         float64(s.MangaTagCounts["Survival"]),
		"m_tag_cooking":          float64(s.MangaTagCounts["Cooking"]),
		"m_tag_medical":          float64(s.MangaTagCounts["Medicine"]),
		"m_tag_villainess":       float64(s.MangaTagCounts["Villainess"]),

		// ── Anime simple stat achievements ─────────────────────────────────────────
		"a_ten_perfect_scores":  boolToFloat(s.PerfectTenAnime >= 10),
		"a_variety_pack":        float64(s.AnimeUniqueFormatCount),
		"a_format_balance":      boolToFloat(s.AnimeUniqueFormatCount >= 5),
		"a_anthology":           float64(s.AnimeFormatCounts["TV"]), // placeholder: anthology not a distinct AniList format

		// ── Manga simple stat achievements ─────────────────────────────────────────
		"m_ten_perfect_scores":  boolToFloat(s.PerfectTenManga >= 10),
		"m_format_variety":      float64(s.MangaUniqueFormatCount),
		"m_anthology_reader":    float64(s.MangaFormatCounts["ONE_SHOT"]), // placeholder

		// ── Scoring support metadata ───────────────────────────────────────────────
		"manga_average_rating":       s.MangaAverageRating,
		"manga_rating_count":         float64(s.MangaRatingCount),
		"bell_curve":                 s.BellCurveAnime,
		"manga_bell_curve":           s.BellCurveManga,
		"used_all_scores":            s.UsedAllScoresAnime,
		"manga_used_all_scores":      s.UsedAllScoresManga,
		"all_completed_rated":        s.AllCompletedRatedAnime,
		"manga_all_completed_rated":  s.AllCompletedRatedManga,
		"max_same_score_count":       float64(s.MaxSameScoreAnime),
		"manga_max_same_score_count": float64(s.MaxSameScoreManga),
		"score_variance":             s.ScoreVarianceAnime,
		"manga_score_variance":       s.ScoreVarianceManga,
		"mediocre_count":             float64(s.MediocreCountAnime),
		"manga_mediocre_count":       float64(s.MediocreCountManga),

		// ── Shared metadata ────────────────────────────────────────────────────────
		"completed_count": float64(s.CompletedAnime + s.CompletedManga),
		"total_count":     float64(s.TotalEpisodes + s.TotalChapters),
		"total_episodes":  float64(s.TotalEpisodes),
		"total_chapters":  float64(s.TotalChapters),
	}
	return m
}
