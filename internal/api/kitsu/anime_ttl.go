package kitsu

import "time"

// ttlFromSeconds is a tiny helper that turns an interval expressed in seconds into a time.Duration.
// Cache keys pass `time.Duration` directly, while the callers often have a `seconds` integer that
// they want to feed into the cache — this saves them a conversion in seven call sites.
func ttlFromSeconds(sec int) time.Duration {
	return time.Duration(sec) * time.Second
}
