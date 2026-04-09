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
	case CategoryFirstSteps:
		return e.evalFirstSteps(def, event)
	case CategoryEpisodeMilestone:
		return e.evalStatThreshold(meta, def, threshold)
	case CategoryMangaMilestone:
		return e.evalStatThreshold(meta, def, threshold)
	case CategoryBingeWatching:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryNightOwl:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryEarlyBird:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryStreakMaster:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategorySpeedDemon:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryDedication:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryGenreExplorer:
		return e.evalStatThreshold(meta, def, threshold)
	case CategoryFormatExplorer:
		return e.evalFormatExplorer(def, meta)
	case CategoryHolidaySeasonal:
		return e.evalHolidaySeasonal(def, event)
	case CategorySeasonalWatcher:
		return e.evalStatThreshold(meta, def, threshold)
	case CategoryTimeQuirky:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryCrossMedia:
		return e.evalStatThreshold(meta, def, threshold)
	case CategoryMangaCreative:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryThrowback:
		return e.evalStatThreshold(meta, def, threshold)
	case CategoryScoring:
		return e.evalScoring(def, threshold, meta)
	case CategorySocial:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryDiscovery:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryMovieNight:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryTimeChallenge:
		return e.evalTimeChallenge(def, event)
	case CategoryCompletionPattern:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategorySpecialMedia:
		return e.evalStatThreshold(meta, def, threshold)
	case CategoryPlatform:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryObscureFun:
		return e.evalObscureFun(def, event, currentProgress)
	case CategoryReadingMilestone:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	case CategoryMixed:
		return e.evalIncremental(def, threshold, currentProgress, meta)
	}

	return 0, false
}

// unlock marks an achievement as unlocked and sends a WS event.
func (e *Engine) unlock(database *db.Database, def *Definition, tier int, profileID uint) {
	err := database.UnlockAchievement(def.Key, tier)
	if err != nil {
		e.logger.Error().Err(err).Str("key", def.Key).Int("tier", tier).Msg("achievement: failed to unlock")
		return
	}

	tierName := ""
	if def.MaxTier > 0 && tier >= 1 && tier <= len(def.TierNames) {
		tierName = def.TierNames[tier-1]
	}

	iconSVG := def.IconSVG
	if iconSVG == "" {
		// Fall back to category icon
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
	}

	e.wsEventManager.SendEventToProfile(profileID, "achievement-unlocked", payload)
	e.logger.Info().Str("key", def.Key).Int("tier", tier).Uint("profileID", profileID).Msg("achievement: unlocked")
}

// ensureInitialized lazily creates missing achievement rows on first access.
func (e *Engine) ensureInitialized(database *db.Database) {
	count, _ := database.AchievementRowCount()
	if count > 0 {
		return // Already populated
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	// Double-check after lock
	count, _ = database.AchievementRowCount()
	if count > 0 {
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

// evalFirstSteps: one-time achievements that unlock on first relevant event.
func (e *Engine) evalFirstSteps(def *Definition, event *AchievementEvent) (float64, bool) {
	// Any event matching the trigger = unlock
	return 100, true
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

// evalFormatExplorer: one-time format-based achievements.
func (e *Engine) evalFormatExplorer(def *Definition, meta map[string]interface{}) (float64, bool) {
	formatStr := getMetaString(meta, "format")
	switch def.Key {
	case "tv_watcher":
		if formatStr == "TV" || formatStr == "TV_SHORT" {
			return 100, true
		}
	case "movie_buff":
		if formatStr == "MOVIE" {
			return 100, true
		}
	case "ova_hunter":
		if formatStr == "OVA" {
			return 100, true
		}
	case "ona_explorer":
		if formatStr == "ONA" {
			return 100, true
		}
	case "special_feature":
		if formatStr == "SPECIAL" {
			return 100, true
		}
	case "short_king":
		episodes := getMetaFloat(meta, "episodes")
		if episodes > 0 && episodes < 6 {
			return 100, true
		}
	case "variety_pack":
		formatCount := getMetaFloat(meta, "format_count")
		if formatCount >= 5 {
			return 100, true
		}
	case "long_haul":
		episodes := getMetaFloat(meta, "episodes")
		threshold := 0
		if len(def.TierThresholds) > 0 {
			threshold = def.TierThresholds[0] // Handled by evaluateDefinition tier loop
		}
		if threshold > 0 && episodes >= float64(threshold) {
			return 100, true
		}
	}
	return 0, false
}

// evalHolidaySeasonal: date-based one-time achievements.
func (e *Engine) evalHolidaySeasonal(def *Definition, event *AchievementEvent) (float64, bool) {
	t := event.Timestamp
	month := t.Month()
	day := t.Day()
	weekday := t.Weekday()

	switch def.Key {
	case "new_years_resolution":
		if month == time.January && day == 1 {
			return 100, true
		}
	case "valentines_weeb":
		if month == time.February && day == 14 {
			genres := getMetaStringSlice(event.Metadata, "genres")
			if containsString(genres, "Romance") {
				return 100, true
			}
		}
	case "pi_day":
		if month == time.March && day == 14 {
			return 100, true
		}
	case "april_fools":
		if month == time.April && day == 1 {
			genres := getMetaStringSlice(event.Metadata, "genres")
			if containsString(genres, "Comedy") {
				return 100, true
			}
		}
	case "international_anime_day":
		if month == time.April && day == 15 {
			return 100, true
		}
	case "star_wars_day":
		if month == time.May && day == 4 {
			genres := getMetaStringSlice(event.Metadata, "genres")
			if containsString(genres, "Sci-Fi") || containsString(genres, "Mecha") {
				return 100, true
			}
		}
	case "summer_solstice":
		if month == time.June && day == 21 {
			return 100, true
		}
	case "tanabata":
		if month == time.July && day == 7 {
			genres := getMetaStringSlice(event.Metadata, "genres")
			if containsString(genres, "Romance") {
				return 100, true
			}
		}
	case "friday_the_13th":
		if day == 13 && weekday == time.Friday {
			genres := getMetaStringSlice(event.Metadata, "genres")
			if containsString(genres, "Horror") || containsString(genres, "Thriller") {
				return 100, true
			}
		}
	case "halloween_spirit":
		if month == time.October && day == 31 {
			genres := getMetaStringSlice(event.Metadata, "genres")
			if containsString(genres, "Horror") {
				return 100, true
			}
		}
	case "thanksgiving_binge":
		// 4th Thursday of November
		if month == time.November && weekday == time.Thursday {
			// Calculate if this is the 4th Thursday
			firstDay := time.Date(t.Year(), time.November, 1, 0, 0, 0, 0, t.Location())
			firstThursday := 1
			for firstDay.Weekday() != time.Thursday {
				firstDay = firstDay.AddDate(0, 0, 1)
				firstThursday = firstDay.Day()
			}
			fourthThursday := firstThursday + 21
			if day == fourthThursday {
				count := getMetaFloat(event.Metadata, "daily_episodes")
				if count >= 10 {
					return 100, true
				}
			}
		}
	case "christmas_special":
		if month == time.December && day == 25 {
			return 100, true
		}
	case "new_years_eve":
		if month == time.December && day == 31 {
			return 100, true
		}
	case "leap_year":
		if month == time.February && day == 29 {
			return 100, true
		}
	}
	return 0, false
}

// evalScoring: rating-based achievements.
func (e *Engine) evalScoring(def *Definition, threshold int, meta map[string]interface{}) (float64, bool) {
	switch def.Key {
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
	default:
		// Tiered rating achievements - use stat value
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

// evalTimeChallenge: one-time time-specific achievements.
func (e *Engine) evalTimeChallenge(def *Definition, event *AchievementEvent) (float64, bool) {
	hour := event.Timestamp.Hour()
	minute := event.Timestamp.Minute()

	switch def.Key {
	case "four_am_club":
		if hour == 4 {
			return 100, true
		}
	case "the_witching_hour":
		if hour == 3 && minute <= 5 {
			return 100, true
		}
	case "five_more_minutes", "all_nighter", "twenty_four_hour_marathon", "golden_hour":
		// These require session tracking - evaluated via session tracker
		sessionMatch := getMetaBool(event.Metadata, "session_match")
		if sessionMatch {
			return 100, true
		}
	}
	return 0, false
}

// evalObscureFun: quirky one-time achievements.
func (e *Engine) evalObscureFun(def *Definition, event *AchievementEvent, currentProgress float64) (float64, bool) {
	t := event.Timestamp

	switch def.Key {
	case "palindrome_day":
		dateStr := t.Format("01022006") // MMDDYYYY
		if isPalindrome(dateStr) {
			return 100, true
		}
	case "full_moon":
		if isFullMoon(t) && t.Hour() >= 20 || t.Hour() <= 5 {
			return 100, true
		}
	case "round_number":
		completedCount := getMetaFloat(event.Metadata, "completed_count")
		if completedCount > 0 && int(completedCount)%100 == 0 {
			return 100, true
		}
	case "binary_day":
		if isBinaryDate(t) {
			return 100, true
		}
	case "fibonacci":
		completedCount := int(getMetaFloat(event.Metadata, "completed_count"))
		if isFibonacci(completedCount) {
			return 100, true
		}
	case "triple_same":
		tripleMatch := getMetaBool(event.Metadata, "triple_same")
		if tripleMatch {
			return 100, true
		}
	case "genre_clash":
		genreClash := getMetaBool(event.Metadata, "genre_clash")
		if genreClash {
			return 100, true
		}
	case "time_traveler":
		decadeCount := getMetaFloat(event.Metadata, "daily_decade_count")
		if decadeCount >= 5 {
			return 100, true
		}
	case "world_record":
		isRecord := getMetaBool(event.Metadata, "is_day_record")
		if isRecord {
			return 100, true
		}
	case "minimalist":
		isMinimalist := getMetaBool(event.Metadata, "is_minimalist_day")
		if isMinimalist {
			return 100, true
		}
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
	TotalEpisodes   int
	TotalMinutes    int
	TotalAnime      int
	CompletedAnime  int
	TotalManga      int
	CompletedManga  int
	TotalChapters   int
	GenreCount      int
	StudioCount     int
	FormatCount     int
	DecadeCount     int
	TagCount        int
	MovieCount      int
	RatingCount     int
	AverageRating   float64
	PerfectTenCount int
	HarshCriticCount int

	// Per-genre/tag/format counts for specific achievement evaluations
	GenreCounts  map[string]int
	FormatCounts map[string]int
}

func (s *CollectionStats) toMetadata() map[string]interface{} {
	m := map[string]interface{}{
		"episode_counter":     float64(s.TotalEpisodes),
		"hours_invested":      float64(s.TotalMinutes) / 60.0,
		"ten_thousand":        float64(s.TotalMinutes),
		"anime_collector":     float64(s.TotalAnime),
		"completed_collection": float64(s.CompletedAnime),
		"chapter_counter":     float64(s.TotalChapters),
		"manga_collector":     float64(s.TotalManga),
		"manga_completionist": float64(s.CompletedManga),
		"genre_explorer":      float64(s.GenreCount),
		"studio_hopper":       float64(s.StudioCount),
		"tag_explorer":        float64(s.TagCount),
		"decade_hopper":       float64(s.DecadeCount),
		"format_count":        float64(s.FormatCount),
		"film_buff":           float64(s.MovieCount),
		"critic":              float64(s.RatingCount),
		"perfect_ten":         float64(s.PerfectTenCount),
		"harsh_critic":        float64(s.HarshCriticCount),
		"average_rating":      s.AverageRating,
		"rating_count":        float64(s.RatingCount),
		"completed_count":     float64(s.CompletedAnime),

		// Special media genre-based
		"music_lover":      float64(s.GenreCounts["Music"]),
		"sports_fan":       float64(s.GenreCounts["Sports"]),
		"mecha_pilot":      float64(s.GenreCounts["Mecha"]),
		"slice_of_life":    float64(s.GenreCounts["Slice of Life"]),
		"horror_enthusiast": float64(s.GenreCounts["Horror"]),
		"romance_reader":   float64(s.GenreCounts["Romance"]),

		// Throwback
		"retro_appreciator":    0.0,
		"throwback":            0.0,
		"classic_connoisseur":  0.0,
		"modern_viewer":        0.0,
	}
	return m
}
