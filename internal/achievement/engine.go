package achievement

import (
	"encoding/json"
	"math"
	"strings"
	"sync"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"

	"github.com/rs/zerolog"
)

// CurrentXPVersion is bumped whenever the XP formula changes to trigger retroactive recalculation.
const CurrentXPVersion = 2

// CurrentRulesVersion is bumped whenever the rules change in a way that makes earlier unlocks
// suspect. On the first evaluation under a new version every unlock is re-checked: the ones the
// rules no longer support are revoked along with their XP (see revalidate).
//
// Version 1: the rule registry replaced the category evaluators, under which "streaks" were
// lifetime episode counts, Score Sniper fired on any rating, and averages compared a 100-point
// score with 10-point thresholds.
const CurrentRulesVersion = 1

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

// BatchUnlockPayload is everything one evaluation pass unlocked, announced as one message.
//
// A pass that unlocks nothing sends nothing at all, so a client can treat every one of these as an
// award worth showing.
type BatchUnlockPayload struct {
	Achievements []*UnlockPayload `json:"achievements"`
	// TotalXP is the XP awarded across all of them, so the client does not have to add it up.
	TotalXP int `json:"totalXp"`
	// NewLevel is the level reached by the end of the pass — not each level passed through on the
	// way, which the user was only briefly at.
	NewLevel  int  `json:"newLevel,omitempty"`
	LeveledUp bool `json:"leveledUp,omitempty"`
}

// Sources is where the engine reads what the rules measure. Every field is optional; a missing
// source simply measures as nothing.
type Sources struct {
	// AnimeCollection / MangaCollection return the profile's own list (cached reads).
	AnimeCollection func(profileID uint) *anilist.AnimeCollection
	MangaCollection func(profileID uint) *anilist.MangaCollection
	// Extras is the shared cache of studios, staff, relations and rankings.
	Extras *ExtrasCache
	// Social returns the profile's comment counts and the times it was socially active
	// (comments, posts, replies).
	Social func(profileID uint) (animeComments, mangaComments int, times []time.Time)
	// TimeZone returns the profile's time zone (from its client prefs); nil means server-local.
	TimeZone func(profileID uint) *time.Location
}

// Engine evaluates achievement events and unlocks achievements in the profile DB.
type Engine struct {
	logger            *zerolog.Logger
	wsEventManager    events.WSEventManagerInterface
	getDB             func(profileID uint) (*db.Database, error)
	isProfileEligible func(profileID uint) bool
	sources           Sources

	defMap      map[string]*Definition
	mu          sync.Mutex
	initialized map[*db.Database]bool

	// activityTracker is the server-authoritative tracker for active
	// engagement (anime watching / manga reading). It is the ONLY source
	// of truth for continuous-session hour achievements; clients drive it
	// via heartbeats and time is measured from wall-clock between
	// heartbeats (clamped to MaxHeartbeatDelta, reset after
	// InactivityTimeout). See activity_tracker.go.
	activityTracker *ActivityTracker

	// Per-profile evaluation: one at a time, debounced, never two passes racing for one unlock.
	evalMu    sync.Mutex
	profileMu map[uint]*sync.Mutex
	timers    map[uint]*time.Timer
	lastEval  map[uint]time.Time

	// activeSeconds accumulates heartbeat time per profile and kind until it is worth a log row.
	activeMu      sync.Mutex
	activeSeconds map[uint]map[ActivityKind]float64
}

type NewEngineOptions struct {
	Logger         *zerolog.Logger
	WSEventManager events.WSEventManagerInterface
	GetDB          func(profileID uint) (*db.Database, error)
	// IsProfileEligible returns true if the profile should earn achievements.
	// When nil, all profiles with ID > 0 are eligible.
	IsProfileEligible func(profileID uint) bool
	Sources           Sources
}

// NewEngine creates a new achievement engine.
func NewEngine(opts *NewEngineOptions) *Engine {
	e := &Engine{
		logger:            opts.Logger,
		wsEventManager:    opts.WSEventManager,
		getDB:             opts.GetDB,
		isProfileEligible: opts.IsProfileEligible,
		sources:           opts.Sources,
		defMap:            DefinitionMap(),
		initialized:       map[*db.Database]bool{},
		activityTracker:   NewActivityTracker(),
		profileMu:         map[uint]*sync.Mutex{},
		timers:            map[uint]*time.Timer{},
		lastEval:          map[uint]time.Time{},
		activeSeconds:     map[uint]map[ActivityKind]float64{},
	}
	return e
}

// SetSources wires the data sources after construction (they depend on services created later).
func (e *Engine) SetSources(s Sources) {
	if e == nil {
		return
	}
	e.evalMu.Lock()
	e.sources = s
	e.evalMu.Unlock()
	if s.Extras != nil {
		s.Extras.mu.Lock()
		s.Extras.onFilled = e.reevaluateRecent
		s.Extras.mu.Unlock()
	}
}

// RecordActivity is the entry point for client heartbeats indicating that the
// user is ACTIVELY engaged in the given kind (anime watching / manga reading).
// The tracker measures wall-clock between heartbeats (clamped to prevent abuse
// and reset after 1h of inactivity), and the resulting continuous-session
// duration feeds the "watch continuously for N hours" rules; the time itself
// feeds the hours-per-day/weekend/month rules.
//
// Returns the wall-clock delta (in seconds) credited toward the session, so callers
// can grant passive watch-time XP proportionally. Returns 0 if this is a brand-new
// session or if the engine/tracker is not initialized.
func (e *Engine) RecordActivity(profileID uint, kind ActivityKind) float64 {
	if e == nil || e.activityTracker == nil || profileID == 0 {
		return 0
	}
	now := time.Now()
	_, deltaSeconds, _ := e.activityTracker.Heartbeat(profileID, kind, now)

	// Time spent is logged in five-minute pieces rather than per heartbeat.
	e.activeMu.Lock()
	if e.activeSeconds[profileID] == nil {
		e.activeSeconds[profileID] = map[ActivityKind]float64{}
	}
	e.activeSeconds[profileID][kind] += deltaSeconds
	flush := e.activeSeconds[profileID][kind] >= 300
	minutes := 0
	if flush {
		minutes = int(e.activeSeconds[profileID][kind] / 60)
		e.activeSeconds[profileID][kind] -= float64(minutes * 60)
	}
	e.activeMu.Unlock()
	if flush && minutes > 0 {
		if database, err := e.getDB(profileID); err == nil {
			_ = database.AppendAchievementLog(models.AchievementLogEntry{
				At: now.Unix(), Kind: LogKindActive, MediaType: string(kind), Minutes: minutes,
			})
		}
	}

	trigger := TriggerAnimeActivity
	if kind == ActivityKindManga {
		trigger = TriggerMangaActivity
	}
	e.ProcessEvent(&AchievementEvent{ProfileID: profileID, Trigger: trigger, Timestamp: now})
	return deltaSeconds
}

// ResetActivity clears any in-flight activity session for the given profile/kind.
// Called when the player is closed or reading is explicitly stopped.
func (e *Engine) ResetActivity(profileID uint, kind ActivityKind) {
	if e == nil || e.activityTracker == nil {
		return
	}
	e.activityTracker.Reset(profileID, kind)
}

// ProcessEvent records what happened and schedules an evaluation of the profile.
//
// Recording is immediate; evaluation is debounced, so the burst of events one finished episode
// produces (progress, completion, activity) is measured once.
func (e *Engine) ProcessEvent(event *AchievementEvent) {
	if e == nil || event == nil || event.ProfileID == 0 {
		return
	}
	if e.isProfileEligible != nil && !e.isProfileEligible(event.ProfileID) {
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
	e.ensureInitialized(database)
	if event.Trigger == EvalTrigger("_init") {
		return
	}

	e.record(database, event)

	delay := 2 * time.Second
	if event.Trigger == TriggerAnimeActivity || event.Trigger == TriggerMangaActivity {
		// Heartbeats arrive every ~30 s; the session rules do not need to be measured that often.
		e.evalMu.Lock()
		recent := time.Since(e.lastEval[event.ProfileID]) < 2*time.Minute
		_, pending := e.timers[event.ProfileID]
		e.evalMu.Unlock()
		if recent || pending {
			return
		}
	}
	e.schedule(event.ProfileID, delay)
}

// RequestEvaluation measures a profile soon (e.g. after its collection was refreshed).
func (e *Engine) RequestEvaluation(profileID uint) {
	if e == nil || profileID == 0 {
		return
	}
	if e.isProfileEligible != nil && !e.isProfileEligible(profileID) {
		return
	}
	e.schedule(profileID, 2*time.Second)
}

// EvaluateCollectionStats is kept for callers that used to pass precomputed stats; the engine now
// measures the lists itself, so this just requests an evaluation.
func (e *Engine) EvaluateCollectionStats(profileID uint, _ interface{}) {
	e.RequestEvaluation(profileID)
}

// EvaluateNow measures a profile synchronously (the import endpoint).
func (e *Engine) EvaluateNow(profileID uint) {
	if e == nil || profileID == 0 {
		return
	}
	e.evaluate(profileID)
}

func (e *Engine) schedule(profileID uint, delay time.Duration) {
	e.evalMu.Lock()
	defer e.evalMu.Unlock()
	if t, ok := e.timers[profileID]; ok {
		t.Reset(delay)
		return
	}
	e.timers[profileID] = time.AfterFunc(delay, func() {
		e.evalMu.Lock()
		delete(e.timers, profileID)
		e.evalMu.Unlock()
		e.evaluate(profileID)
	})
}

// reevaluateRecent measures again every profile evaluated in the last hour (new media extras landed).
func (e *Engine) reevaluateRecent() {
	e.evalMu.Lock()
	ids := make([]uint, 0, len(e.lastEval))
	for id, at := range e.lastEval {
		if time.Since(at) < time.Hour {
			ids = append(ids, id)
		}
	}
	e.evalMu.Unlock()
	for _, id := range ids {
		e.schedule(id, 5*time.Second)
	}
}

func (e *Engine) lockProfile(profileID uint) func() {
	e.evalMu.Lock()
	m, ok := e.profileMu[profileID]
	if !ok {
		m = &sync.Mutex{}
		e.profileMu[profileID] = m
	}
	e.evalMu.Unlock()
	m.Lock()
	return m.Unlock
}

// ── Recording ────────────────────────────────────────────────────────────────────────────────

func (e *Engine) record(database *db.Database, ev *AchievementEvent) {
	meta := ev.Metadata
	at := ev.Timestamp
	window := at.Add(-12 * time.Hour)
	appendRow := func(r models.AchievementLogEntry) {
		r.At = at.Unix()
		if err := database.AppendAchievementLog(r); err != nil {
			e.logger.Warn().Err(err).Str("kind", r.Kind).Msg("achievement: failed to log event")
		}
	}

	switch ev.Trigger {
	case TriggerEpisodeProgress:
		ep := int(getMetaFloat(meta, "episode_number"))
		if ep <= 0 || ev.MediaID <= 0 {
			return
		}
		if database.HasAchievementLogEntry(LogKindEpisode, "anime", ev.MediaID, ep, window) {
			return
		}
		appendRow(models.AchievementLogEntry{Kind: LogKindEpisode, MediaType: "anime", MediaID: ev.MediaID, Number: ep, Minutes: int(getMetaFloat(meta, "duration"))})
	case TriggerChapterProgress:
		ch := int(getMetaFloat(meta, "chapter"))
		if ch <= 0 || ev.MediaID <= 0 {
			return
		}
		if database.HasAchievementLogEntry(LogKindChapter, "manga", ev.MediaID, ch, window) {
			return
		}
		appendRow(models.AchievementLogEntry{Kind: LogKindChapter, MediaType: "manga", MediaID: ev.MediaID, Number: ch, Minutes: int(getMetaFloat(meta, "reading_minutes"))})
	case TriggerSeriesComplete, TriggerMangaComplete:
		mt := "anime"
		if ev.Trigger == TriggerMangaComplete {
			mt = "manga"
		}
		if ev.MediaID <= 0 || database.HasAchievementLogEntry(LogKindComplete, mt, ev.MediaID, 0, window) {
			return
		}
		appendRow(models.AchievementLogEntry{Kind: LogKindComplete, MediaType: mt, MediaID: ev.MediaID})
	case TriggerRatingChange, TriggerStatusChange:
		// List edits made here are logged now and written into the snapshot, so the next
		// snapshot comparison does not log them a second time.
		mt := getMetaString(meta, "type")
		if mt != "manga" {
			mt = "anime"
		}
		if ev.MediaID <= 0 {
			return
		}
		e.recordListEdit(database, mt, ev.MediaID, at, meta)
	case TriggerPlatformEvent:
		if a := getMetaString(meta, "action"); a == "random_pick" {
			data, _ := json.Marshal(map[string]string{"action": a})
			appendRow(models.AchievementLogEntry{Kind: LogKindAction, MediaType: "anime", MediaID: ev.MediaID, Data: string(data)})
		}
	case TriggerNakamaEvent:
		data, _ := json.Marshal(map[string]interface{}{
			"host":         getMetaBool(meta, "host"),
			"peers":        getMetaStringSlice(meta, "peers"),
			"maxPeers":     getMetaFloat(meta, "max_peers"),
			"chatMessages": getMetaFloat(meta, "chat_messages"),
		})
		started := at.Add(-time.Duration(getMetaFloat(meta, "minutes")) * time.Minute)
		r := models.AchievementLogEntry{Kind: LogKindParty, Minutes: int(getMetaFloat(meta, "minutes")), Data: string(data)}
		r.At = started.Unix()
		_ = database.AppendAchievementLog(r)
	}
}

// recordListEdit logs a score or status change made through this app and updates the snapshot.
func (e *Engine) recordListEdit(database *db.Database, mediaType string, mediaID int, at time.Time, meta map[string]interface{}) {
	snap, _ := database.GetAchievementListSnapshot()
	key := mediaType + ":" + itoa(mediaID)
	prev, had := snap[key]
	next := prev
	next.MediaType, next.MediaID = mediaType, mediaID
	var rows []models.AchievementLogEntry
	if _, ok := meta["score"]; ok {
		// Handlers send the score on AniList's POINT_100 scale.
		score := getMetaFloat(meta, "score")
		if !had || score != prev.Score {
			data, _ := json.Marshal(map[string]float64{"from": prev.Score})
			rows = append(rows, models.AchievementLogEntry{At: at.Unix(), Kind: LogKindScore, MediaType: mediaType, MediaID: mediaID, Number: int(score), Data: string(data)})
			next.Score = score
		}
	}
	if st := getMetaString(meta, "status"); st != "" && (!had || st != prev.Status) {
		data, _ := json.Marshal(map[string]string{"from": prev.Status, "to": st})
		rows = append(rows, models.AchievementLogEntry{At: at.Unix(), Kind: LogKindStatus, MediaType: mediaType, MediaID: mediaID, Data: string(data)})
		if st == "COMPLETED" && !database.HasAchievementLogEntry(LogKindComplete, mediaType, mediaID, 0, at.Add(-12*time.Hour)) {
			rows = append(rows, models.AchievementLogEntry{At: at.Unix(), Kind: LogKindComplete, MediaType: mediaType, MediaID: mediaID})
		}
		next.Status = st
	}
	if len(rows) == 0 {
		return
	}
	_ = database.AppendAchievementLog(rows...)
	if had {
		_ = database.UpsertAchievementListSnapshot(next)
	}
}

// diffSnapshot compares the current lists with the last-seen state and logs what changed —
// however it changed (this app, the AniList site, another app). The first comparison only records
// the state: an entire existing list is not a pile of fresh changes.
func (e *Engine) diffSnapshot(database *db.Database, mediaType string, entries []*entry, now time.Time) {
	if entries == nil {
		return
	}
	snap, err := database.GetAchievementListSnapshot()
	if err != nil {
		return
	}
	seeded := false
	for k := range snap {
		if strings.HasPrefix(k, mediaType+":") {
			seeded = true
			break
		}
	}
	rows := make([]models.AchievementListSnapshot, 0, len(entries))
	var log []models.AchievementLogEntry
	window := now.Add(-12 * time.Hour)
	for _, en := range entries {
		cur := models.AchievementListSnapshot{
			MediaType: mediaType, MediaID: en.m.id, Status: en.status,
			Score: math.Round(en.score * 10), Progress: en.progress, Repeat: en.repeat,
		}
		rows = append(rows, cur)
		if !seeded {
			continue
		}
		prev, had := snap[mediaType+":"+itoa(en.m.id)]
		if !had {
			if cur.Status != "" {
				data, _ := json.Marshal(map[string]string{"from": "", "to": cur.Status})
				log = append(log, models.AchievementLogEntry{At: now.Unix(), Kind: LogKindStatus, MediaType: mediaType, MediaID: en.m.id, Data: string(data)})
			}
			continue
		}
		if prev.Status != cur.Status {
			data, _ := json.Marshal(map[string]string{"from": prev.Status, "to": cur.Status})
			log = append(log, models.AchievementLogEntry{At: now.Unix(), Kind: LogKindStatus, MediaType: mediaType, MediaID: en.m.id, Data: string(data)})
			if cur.Status == "COMPLETED" && !database.HasAchievementLogEntry(LogKindComplete, mediaType, en.m.id, 0, window) {
				log = append(log, models.AchievementLogEntry{At: now.Unix(), Kind: LogKindComplete, MediaType: mediaType, MediaID: en.m.id})
			}
		}
		if prev.Score != cur.Score && cur.Score > 0 {
			data, _ := json.Marshal(map[string]float64{"from": prev.Score})
			log = append(log, models.AchievementLogEntry{At: now.Unix(), Kind: LogKindScore, MediaType: mediaType, MediaID: en.m.id, Number: int(cur.Score), Data: string(data)})
		}
	}
	if len(log) > 0 {
		_ = database.AppendAchievementLog(log...)
	}
	_ = database.ReplaceAchievementListSnapshot(mediaType, rows)
}

// ── Evaluation ───────────────────────────────────────────────────────────────────────────────

func (e *Engine) evaluate(profileID uint) {
	defer func() {
		if r := recover(); r != nil {
			e.logger.Error().Interface("panic", r).Uint("profileID", profileID).Msg("achievement: evaluation panicked")
		}
	}()
	unlock := e.lockProfile(profileID)
	defer unlock()

	e.evalMu.Lock()
	e.lastEval[profileID] = time.Now()
	src := e.sources
	e.evalMu.Unlock()

	database, err := e.getDB(profileID)
	if err != nil {
		return
	}
	e.ensureInitialized(database)

	var animeCol *anilist.AnimeCollection
	var mangaCol *anilist.MangaCollection
	if src.AnimeCollection != nil {
		animeCol = src.AnimeCollection(profileID)
	}
	if src.MangaCollection != nil {
		mangaCol = src.MangaCollection(profileID)
	}

	now := time.Now()
	tz := time.Local
	if src.TimeZone != nil {
		if loc := src.TimeZone(profileID); loc != nil {
			tz = loc
		}
	}

	dailyTotals, _ := database.GetAllActivityLogs()
	logRows, _ := database.GetAchievementLog()
	if len(logRows) == 0 {
		logRows = e.seedLog(database)
	}

	// A profile that has never watched or read anything in this app is not handed its whole
	// AniList history as a wall of unlocks the moment it connects.
	if len(logRows) == 0 && len(dailyTotals) == 0 {
		return
	}

	// Snapshot first, so changes made elsewhere are in the log this pass reads.
	in := &factsInput{now: now, tz: tz, animeCol: animeCol, mangaCol: mangaCol}
	pre := buildFacts(in)
	if animeCol != nil {
		e.diffSnapshot(database, "anime", pre.Anime.entries, now)
	}
	if mangaCol != nil {
		e.diffSnapshot(database, "manga", pre.Manga.entries, now)
	}
	logRows, _ = database.GetAchievementLog()

	ids := make([]int, 0, len(pre.Anime.entries)+len(pre.Manga.entries))
	for _, s := range []*side{pre.Anime, pre.Manga} {
		for _, en := range s.entries {
			ids = append(ids, en.m.id)
		}
	}
	extras := map[int]*MediaExtras{}
	if src.Extras != nil {
		extras = src.Extras.Get(ids)
	}

	in.extras = extras
	in.log = logRows
	in.dailyTotals = dailyTotals
	in.favAnime, in.favManga = database.FavoriteCounts()
	if src.Social != nil {
		in.commentAnime, in.commentManga, in.socialTimes = src.Social(profileID)
	}
	in.liveAnimeHrs = e.activityTracker.SessionHours(profileID, ActivityKindAnime, now)
	in.liveMangaHrs = e.activityTracker.SessionHours(profileID, ActivityKindManga, now)

	rows, _ := database.GetAllAchievements()
	in.achievements = rows
	facts := buildFacts(in)

	batch := &unlockBatch{}

	if database.GetAchievementRulesVersion() < CurrentRulesVersion {
		// Re-check only with the data to do it: both lists present (an unreadable list would
		// "disprove" everything on its side) and most media details fetched.
		covered := 0
		for _, id := range ids {
			if extras[id] != nil {
				covered++
			}
		}
		if animeCol != nil && mangaCol != nil && (len(ids) == 0 || covered*10 >= len(ids)*9) {
			e.revalidate(database, profileID, facts, rows)
			rows, _ = database.GetAllAchievements()
			facts.Achievements = rows
		}
	}

	e.applyRules(database, profileID, facts, rows, batch, false)
	// Meta rules read the unlocks just made: measure them again until nothing new unlocks.
	for pass := 0; pass < 3 && len(batch.payloads) > 0; pass++ {
		before := len(batch.payloads)
		rows, _ = database.GetAllAchievements()
		facts.Achievements = rows
		e.applyRules(database, profileID, facts, rows, batch, true)
		if len(batch.payloads) == before {
			break
		}
	}

	e.flushUnlocks(profileID, batch)
}

// applyRules measures every definition (or only the meta ones) and unlocks what is met.
func (e *Engine) applyRules(database *db.Database, profileID uint, f *Facts, rows []models.Achievement, batch *unlockBatch, metaOnly bool) {
	existing := make(map[string]*models.Achievement, len(rows))
	for i := range rows {
		existing[rowKey(rows[i].Key, rows[i].Tier)] = &rows[i]
	}
	for i := range AllDefinitions {
		def := &AllDefinitions[i]
		if metaOnly && !isMetaCategory(def.Category) {
			continue
		}
		r := rules[def.Key]
		if r == nil {
			continue
		}
		value := safeRule(r, f)
		if def.MaxTier == 0 {
			e.applyTier(database, profileID, def, 0, value, 1, existing[rowKey(def.Key, 0)], batch)
			continue
		}
		for tier := 1; tier <= def.MaxTier && tier <= len(def.TierThresholds); tier++ {
			e.applyTier(database, profileID, def, tier, value, float64(def.TierThresholds[tier-1]), existing[rowKey(def.Key, tier)], batch)
		}
	}
}

func (e *Engine) applyTier(database *db.Database, profileID uint, def *Definition, tier int, value, target float64, row *models.Achievement, batch *unlockBatch) {
	if monotonic[def.Key] && row != nil && row.Progress > value {
		value = row.Progress
	}
	if row != nil && row.IsUnlocked {
		if math.Abs(row.Progress-value) > 1e-6 {
			_ = database.UpdateAchievementProgress(def.Key, tier, value, "")
		}
		return
	}
	if value >= target && target > 0 {
		_ = database.UpdateAchievementProgress(def.Key, tier, value, "")
		e.unlock(database, def, tier, profileID, batch)
		return
	}
	if row == nil || math.Abs(row.Progress-value) > 1e-6 {
		_ = database.UpdateAchievementProgress(def.Key, tier, value, "")
	}
}

func rowKey(key string, tier int) string { return key + "#" + itoa(tier) }

func safeRule(r rule, f *Facts) (v float64) {
	defer func() {
		if recover() != nil {
			v = 0
		}
	}()
	v = r(f)
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	return v
}

// revalidate re-checks every unlock against the current rules (one time per rules version):
// unlocks the rules do not support are revoked with their XP; those that hold keep their date.
func (e *Engine) revalidate(database *db.Database, profileID uint, f *Facts, rows []models.Achievement) {
	revoked, kept := 0, 0
	for _, a := range rows {
		if !a.IsUnlocked {
			continue
		}
		def := e.defMap[a.Key]
		r := rules[a.Key]
		if def == nil || r == nil || canLapse[a.Key] || isMetaCategory(def.Category) {
			kept++
			continue
		}
		value := safeRule(r, f)
		target := 1.0
		if a.Tier > 0 && a.Tier <= len(def.TierThresholds) {
			target = float64(def.TierThresholds[a.Tier-1])
		}
		if monotonic[a.Key] && a.Progress > value {
			value = a.Progress
		}
		if value >= target {
			kept++
			continue
		}
		_ = database.RevokeAchievement(a.Key, a.Tier)
		_ = database.UpdateAchievementProgress(a.Key, a.Tier, value, "")
		revoked++
	}
	// Meta unlocks are re-checked after the rest, against what is left.
	rows, _ = database.GetAllAchievements()
	f.Achievements = rows
	for _, a := range rows {
		def := e.defMap[a.Key]
		if !a.IsUnlocked || def == nil || !isMetaCategory(def.Category) {
			continue
		}
		target := 1.0
		if a.Tier > 0 && a.Tier <= len(def.TierThresholds) {
			target = float64(def.TierThresholds[a.Tier-1])
		}
		if safeRule(rules[a.Key], f) >= target {
			kept++
			continue
		}
		_ = database.RevokeAchievement(a.Key, a.Tier)
		revoked++
	}
	if err := e.RecalculateXP(database); err != nil {
		e.logger.Warn().Err(err).Msg("achievement: failed to recalculate XP after re-check")
	}
	_ = database.SetAchievementRulesVersion(CurrentRulesVersion)
	e.logger.Info().Uint("profileID", profileID).Int("revoked", revoked).Int("kept", kept).
		Int("rulesVersion", CurrentRulesVersion).Msg("achievement: Re-checked unlocks against the current rules")
}

// seedLog builds the first log from the activity events still on record (the last 30 days, with
// times) so history-based rules have something to start from. Older days are covered by the daily
// totals.
func (e *Engine) seedLog(database *db.Database) []models.AchievementLogEntry {
	events, err := database.GetAllActivityEventsAsc()
	if err != nil || len(events) == 0 {
		return nil
	}
	var out []models.AchievementLogEntry
	for _, ev := range events {
		var meta map[string]interface{}
		_ = json.Unmarshal([]byte(ev.Metadata), &meta)
		at := ev.CreatedAt.Unix()
		switch ev.EventType {
		case models.ActivityEventEpisodeWatched:
			out = append(out, models.AchievementLogEntry{At: at, Kind: LogKindEpisode, MediaType: "anime", MediaID: ev.MediaId,
				Number: int(getMetaFloat(meta, "episode")), Minutes: int(getMetaFloat(meta, "duration"))})
		case models.ActivityEventMangaChapterRead:
			out = append(out, models.AchievementLogEntry{At: at, Kind: LogKindChapter, MediaType: "manga", MediaID: ev.MediaId,
				Number: int(getMetaFloat(meta, "chapter")), Minutes: int(getMetaFloat(meta, "readingMinutes"))})
		case "series_complete":
			mt := "anime"
			if getMetaString(meta, "type") == "manga" {
				mt = "manga"
			}
			out = append(out, models.AchievementLogEntry{At: at, Kind: LogKindComplete, MediaType: mt, MediaID: ev.MediaId})
		case models.ActivityEventAnilistEntryEdited:
			mt := "anime"
			if getMetaString(meta, "type") == "manga" {
				mt = "manga"
			}
			if s, ok := meta["score"].(float64); ok && s > 0 {
				out = append(out, models.AchievementLogEntry{At: at, Kind: LogKindScore, MediaType: mt, MediaID: ev.MediaId, Number: int(s), Data: `{"from":0}`})
			}
			if st := getMetaString(meta, "status"); st != "" {
				data, _ := json.Marshal(map[string]string{"from": "", "to": st})
				out = append(out, models.AchievementLogEntry{At: at, Kind: LogKindStatus, MediaType: mt, MediaID: ev.MediaId, Data: string(data)})
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	if err := database.AppendAchievementLog(out...); err != nil {
		e.logger.Warn().Err(err).Msg("achievement: failed to seed the achievement log")
		return nil
	}
	e.logger.Info().Int("rows", len(out)).Msg("achievement: Seeded the achievement log from recent activity")
	return out
}

// ── Unlocking ────────────────────────────────────────────────────────────────────────────────

// Awards are announced once per evaluation pass: one event can unlock a dozen achievements, and
// each sent on its own reached the client spread over seconds, as a popup, a gap and another popup.

// unlockBatch collects everything one evaluation pass unlocks, so it can be announced together.
type unlockBatch struct {
	payloads  []*UnlockPayload
	totalXP   int
	newLevel  int
	leveledUp bool
}

// add files one unlock.
func (b *unlockBatch) add(payload *UnlockPayload) {
	if b == nil || payload == nil {
		return
	}
	b.payloads = append(b.payloads, payload)
	b.totalXP += payload.XPAwarded
}

// noteLevel keeps the highest level reached during the pass.
func (b *unlockBatch) noteLevel(newLevel int) {
	if b == nil || newLevel <= b.newLevel {
		return
	}
	b.newLevel = newLevel
	b.leveledUp = true
}

// flush announces everything the pass unlocked, as one message.
func (e *Engine) flushUnlocks(profileID uint, batch *unlockBatch) {
	if batch == nil || len(batch.payloads) == 0 {
		return
	}

	e.wsEventManager.SendEventToProfile(profileID, events.AchievementsUnlocked, &BatchUnlockPayload{
		Achievements: batch.payloads,
		TotalXP:      batch.totalXP,
		NewLevel:     batch.newLevel,
		LeveledUp:    batch.leveledUp,
	})

	if batch.leveledUp {
		e.wsEventManager.SendEventToProfile(profileID, "level-up", map[string]interface{}{
			"newLevel": batch.newLevel,
		})
		e.logger.Info().Int("level", batch.newLevel).Uint("profileID", profileID).Msg("achievement: level up!")
	}
}

// unlock marks an achievement as unlocked (if it still is locked), awards XP and files the
// announcement.
func (e *Engine) unlock(database *db.Database, def *Definition, tier int, profileID uint, batch *unlockBatch) {
	won, err := database.UnlockAchievementIfLocked(def.Key, tier)
	if err != nil {
		e.logger.Error().Err(err).Str("key", def.Key).Int("tier", tier).Msg("achievement: failed to unlock")
		return
	}
	if !won {
		return // already unlocked by another pass: nothing to award twice
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

	batch.add(&UnlockPayload{
		Key:         def.Key,
		Name:        def.Name,
		Description: FormatThreshold(def.Description, def.TierThresholds, tier),
		Tier:        tier,
		TierName:    tierName,
		Category:    string(def.Category),
		IconSVG:     iconSVG,
		XPAwarded:   xp,
	})

	// Record an activity event so this unlock appears in the user's profile activity feed.
	_ = database.RecordActivityEvent("achievement_unlocked", 0, map[string]interface{}{
		"key":      def.Key,
		"name":     def.Name,
		"tier":     tier,
		"tierName": tierName,
		"category": string(def.Category),
		"xp":       xp,
	})

	if leveledUp && xpErr == nil {
		batch.noteLevel(newLevel)
	}

	e.logger.Info().Str("key", def.Key).Int("tier", tier).Int("xp", xp).Uint("profileID", profileID).Msg("achievement: unlocked")
}

// ensureInitialized creates the rows of new definitions and removes rows of definitions that no
// longer exist. Reconciled by key, so a renamed key is noticed even when the count stays the same.
func (e *Engine) ensureInitialized(database *db.Database) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.initialized[database] {
		return
	}

	existing, _ := database.GetAllAchievements()
	have := make(map[string]bool, len(existing))
	for _, a := range existing {
		have[rowKey(a.Key, a.Tier)] = true
	}
	var rows []models.Achievement
	keys := make([]string, 0, len(AllDefinitions))
	for _, def := range AllDefinitions {
		keys = append(keys, def.Key)
		if def.MaxTier == 0 {
			if !have[rowKey(def.Key, 0)] {
				rows = append(rows, models.Achievement{Key: def.Key, Tier: 0})
			}
			continue
		}
		for tier := 1; tier <= def.MaxTier; tier++ {
			if !have[rowKey(def.Key, tier)] {
				rows = append(rows, models.Achievement{Key: def.Key, Tier: tier})
			}
		}
	}
	if len(rows) > 0 {
		_ = database.BulkUpsertAchievements(rows)
	}
	_ = database.DeleteAchievementRowsNotIn(keys)
	e.initialized[database] = true
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
	return database.SetAchievementXP(totalXP)
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
	switch val := m[key].(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case uint:
		return float64(val)
	}
	return 0
}

func getMetaString(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	s, _ := m[key].(string)
	return s
}

func getMetaBool(m map[string]interface{}, key string) bool {
	if m == nil {
		return false
	}
	b, _ := m[key].(bool)
	return b
}

func getMetaStringSlice(m map[string]interface{}, key string) []string {
	if m == nil {
		return nil
	}
	switch val := m[key].(type) {
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
	return isBinaryNum(int(t.Month())) && isBinaryNum(t.Day())
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
	return phase < (1.0/synodicMonth) || phase > (1.0-1.0/synodicMonth)
}
