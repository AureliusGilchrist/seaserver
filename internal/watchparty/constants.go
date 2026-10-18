package watchparty

import "time"

// Sync tuning, adapted from the Nakama watch party.
const (
	defaultSyncThreshold = 2.0

	// Sync thresholds
	minSyncThreshold         = 0.8 // Minimum sync threshold to prevent excessive seeking
	maxSyncThreshold         = 5.0 // Maximum sync threshold for loose synchronization
	aggressiveSyncMultiplier = 0.4 // Multiplier for large drift (>3s) to sync aggressively
	moderateSyncMultiplier   = 0.6 // Multiplier for medium drift (>1.5s) to sync more frequently

	seekCooldown = 1 * time.Second // Minimum time between seeks to a participant

	// Position and state detection
	resumePositionDriftThreshold = 1.0                     // Seconds of drift before syncing on resume
	resumeAheadTolerance         = 2.0                     // Seconds ahead tolerance to prevent jitter on resume
	pausePositionSyncThreshold   = 0.7                     // Seconds of drift threshold for pause sync
	catchUpBehindThreshold       = 2.0                     // Seconds behind before letting a participant catch up to the pause position
	catchUpTolerance             = 0.5                     // Seconds within the target to stop catch-up
	maxCatchUpDuration           = 4 * time.Second         // Maximum duration for catch-up operations
	catchUpTickInterval          = 200 * time.Millisecond  // Interval for catch-up progress checks
)
