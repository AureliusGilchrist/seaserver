package anilist

import (
	"strings"
	"sync"
	"time"
)

// AniList goes down. Not rate-limited, not slow — off, answering every request with a 403 saying the
// API has been temporarily disabled.
//
// From inside the app that is indistinguishable from everything being broken: the library will not
// load, entries will not open, progress will not save, and the only explanation is in the server log,
// which nobody is reading while they are trying to watch something. Every screen fails separately and
// none of them says why.
//
// So the condition is recorded once, centrally, the moment any request sees it, and cleared the
// moment any request succeeds. One banner can then say the true thing — AniList is down, this is not
// your server, wait — instead of a dozen components each inventing their own error.

var availability = struct {
	mu        sync.RWMutex
	available bool
	message   string
	since     time.Time
}{available: true}

// Availability is what the app shows the user about AniList's state.
type Availability struct {
	Available bool      `json:"available"`
	Message   string    `json:"message,omitempty"`
	Since     time.Time `json:"since,omitempty"`
}

// GetAvailability reports whether AniList is answering.
func GetAvailability() Availability {
	availability.mu.RLock()
	defer availability.mu.RUnlock()
	return Availability{
		Available: availability.available,
		Message:   availability.message,
		Since:     availability.since,
	}
}

// markUnavailable records that AniList is refusing everything. Idempotent: the first sighting keeps
// its timestamp, so the banner can say how long it has been going.
func markUnavailable(message string) {
	availability.mu.Lock()
	defer availability.mu.Unlock()
	if !availability.available {
		return
	}
	availability.available = false
	availability.message = message
	availability.since = time.Now()
}

// markAvailable clears the condition. Called on any successful request — one answer is proof enough
// that the API is back, and waiting for a second would keep the banner up after it stopped being true.
func markAvailable() {
	availability.mu.Lock()
	defer availability.mu.Unlock()
	if availability.available {
		return
	}
	availability.available = true
	availability.message = ""
	availability.since = time.Time{}
}

// outageSignatures are how AniList words a deliberate shutdown. Matched on the message rather than on
// the status code alone: a 403 on its own is also what an expired token looks like, and telling
// somebody the whole API is down when their login lapsed would be a worse lie than saying nothing.
var outageSignatures = []string{
	"api has been temporarily disabled",
	"temporarily disabled due to",
	"api is temporarily unavailable",
	"service temporarily unavailable",
}

// noteRequestOutcome updates the recorded state from one request's result.
func noteRequestOutcome(err error) {
	if err == nil {
		markAvailable()
		return
	}

	lowered := strings.ToLower(err.Error())
	for _, signature := range outageSignatures {
		if strings.Contains(lowered, signature) {
			markUnavailable("AniList has temporarily disabled its API")
			return
		}
	}
}
