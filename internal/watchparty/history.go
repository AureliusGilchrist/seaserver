package watchparty

// Watch party history: who watched which episode together.
//
// While a room plays, every status tick of the remote holder adds the elapsed time to each
// participant who is on the room's current media and not paused. When the media changes,
// stops, or the room closes, everyone who watched enough of it gets a history entry naming
// the others who did too.

import (
	"math"
	"time"
)

const (
	historyMinSeconds   = 180.0           // watched at least this long…
	historyMinFraction  = 0.5             // …or this much of a short episode
	historyMaxTickDelta = 3 * time.Second // a stalled tick doesn't count as watching
)

type (
	// HistoryCompanion is someone who watched the episode alongside.
	HistoryCompanion struct {
		ProfileID uint   `json:"profileId"`
		Username  string `json:"username"`
		Avatar    string `json:"avatar,omitempty"`
	}

	// HistoryEntry is one finished episode, from one profile's point of view.
	HistoryEntry struct {
		ProfileID      uint
		SessionID      string
		RoomName       string
		Media          MediaInfo
		WatchedSeconds float64
		WasHost        bool
		Companions     []HistoryCompanion
		WatchedAt      time.Time
	}

	// tally accumulates watch time for one media generation (epoch) of a room.
	tally struct {
		epoch    int
		media    MediaInfo
		started  time.Time
		lastTick time.Time
		duration float64
		seconds  map[uint]float64
		people   map[uint]HistoryCompanion
		host     uint
	}
)

// tickHistoryLocked is called on every status event from the remote holder. Callers hold m.mu.
// Returns entries from a tally that just finished (the media changed).
func (m *Manager) tickHistoryLocked(s *Session, sourcePaused bool, duration float64) []HistoryEntry {
	if m.recordHistory == nil {
		return nil
	}
	if s.MediaInfo == nil {
		return m.finishTallyLocked(s)
	}

	var done []HistoryEntry
	if s.tally != nil && s.tally.epoch != s.Epoch {
		done = m.finishTallyLocked(s)
	}
	now := time.Now()
	if s.tally == nil {
		s.tally = &tally{
			epoch:    s.Epoch,
			media:    *s.MediaInfo,
			started:  now,
			lastTick: now,
			seconds:  map[uint]float64{},
			people:   map[uint]HistoryCompanion{},
		}
		return done
	}

	t := s.tally
	delta := now.Sub(t.lastTick)
	t.lastTick = now
	if duration > 0 {
		t.duration = duration
	}
	if delta <= 0 || delta > historyMaxTickDelta {
		return done
	}

	for _, p := range s.Participants {
		if p.ProfileID == 0 {
			continue // no profile to keep history for
		}
		if p.IsSource {
			t.host = p.ProfileID
		}
		t.people[p.ProfileID] = HistoryCompanion{ProfileID: p.ProfileID, Username: p.Username, Avatar: p.Avatar}
		playing := false
		if p.IsSource {
			playing = !sourcePaused
		} else {
			playing = p.Epoch == s.Epoch && p.PlaybackStatus != nil && !p.PlaybackStatus.Paused
		}
		if playing {
			t.seconds[p.ProfileID] += delta.Seconds()
		}
	}
	return done
}

// finishTallyLocked closes the room's current tally. Callers hold m.mu.
func (m *Manager) finishTallyLocked(s *Session) []HistoryEntry {
	t := s.tally
	s.tally = nil
	if t == nil || m.recordHistory == nil {
		return nil
	}

	need := historyMinSeconds
	if t.duration > 0 {
		need = math.Min(need, t.duration*historyMinFraction)
	}
	var who []uint
	for id, sec := range t.seconds {
		if sec >= need {
			who = append(who, id)
		}
	}
	// It's only a watch party with at least two people.
	if len(who) < 2 {
		return nil
	}

	out := make([]HistoryEntry, 0, len(who))
	for _, id := range who {
		var comp []HistoryCompanion
		for _, other := range who {
			if other != id {
				comp = append(comp, t.people[other])
			}
		}
		out = append(out, HistoryEntry{
			ProfileID:      id,
			SessionID:      s.ID,
			RoomName:       s.Name,
			Media:          t.media,
			WatchedSeconds: math.Round(t.seconds[id]),
			WasHost:        t.host == id,
			Companions:     comp,
			WatchedAt:      t.started,
		})
	}
	return out
}

// saveHistory hands finished entries to the store, off the caller's goroutine.
func (m *Manager) saveHistory(entries []HistoryEntry) {
	if len(entries) == 0 || m.recordHistory == nil {
		return
	}
	go func() {
		for _, e := range entries {
			m.recordHistory(e)
		}
	}()
}

// HistoryItem is a stored history entry as the profile page shows it.
type HistoryItem struct {
	ID             uint               `json:"id"`
	SessionID      string             `json:"sessionId"`
	RoomName       string             `json:"roomName"`
	MediaID        int                `json:"mediaId"`
	MediaTitle     string             `json:"mediaTitle"`
	MediaImage     string             `json:"mediaImage,omitempty"`
	EpisodeNumber  int                `json:"episodeNumber"`
	WatchedSeconds float64            `json:"watchedSeconds"`
	WasHost        bool               `json:"wasHost"`
	Companions     []HistoryCompanion `json:"companions"`
	WatchedAt      time.Time          `json:"watchedAt"`
}
