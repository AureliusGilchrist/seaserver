package watchparty

import (
	"sync"
	"testing"
	"time"
)

// historyHarness builds a room with a recorder and lets a test drive status ticks.
func historyHarness(t *testing.T) (*Manager, *Session, *[]HistoryEntry, *sync.Mutex) {
	t.Helper()
	m := newTestManager()
	var mu sync.Mutex
	var got []HistoryEntry
	m.recordHistory = func(e HistoryEntry) {
		mu.Lock()
		got = append(got, e)
		mu.Unlock()
	}
	room, _ := m.Create(1, "a", "Movie night", nil)
	m.Join(2, "b", room.ID)
	m.Join(3, "c", room.ID)
	m.mu.Lock()
	s := m.sessions[room.ID]
	s.MediaInfo = &MediaInfo{MediaId: 7, MediaTitle: "Frieren", EpisodeNumber: 4, StreamType: "localfile"}
	for _, p := range s.Participants {
		p.Epoch = s.Epoch
	}
	m.mu.Unlock()
	return m, s, &got, &mu
}

// play simulates `seconds` of the room playing; who maps clientId → playing.
func play(m *Manager, s *Session, seconds int, who map[string]bool) {
	for i := 0; i < seconds; i++ {
		m.mu.Lock()
		for _, p := range s.Participants {
			p.PlaybackStatus = &PlaybackStatusInfo{Paused: !who[p.ClientId], Duration: 1440}
		}
		if s.tally != nil {
			s.tally.lastTick = time.Now().Add(-time.Second) // one second per tick
		}
		m.saveHistory(m.tickHistoryLocked(s, !who["a"], 1440))
		m.mu.Unlock()
	}
}

func waitEntries(got *[]HistoryEntry, mu *sync.Mutex, n int) []HistoryEntry {
	for i := 0; i < 100; i++ {
		mu.Lock()
		c := len(*got)
		mu.Unlock()
		if c >= n {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	mu.Lock()
	defer mu.Unlock()
	return append([]HistoryEntry(nil), (*got)...)
}

func TestHistoryRecordsWhoWatchedTogether(t *testing.T) {
	m, s, got, mu := historyHarness(t)

	// a and b watch 4 minutes; c only 1 minute.
	play(m, s, 1, map[string]bool{"a": true, "b": true, "c": true}) // starts the tally
	play(m, s, 60, map[string]bool{"a": true, "b": true, "c": true})
	play(m, s, 180, map[string]bool{"a": true, "b": true})

	// Closing the room finishes the episode.
	m.Leave(3, "c")
	m.Leave(2, "b")
	m.Leave(1, "a")

	entries := waitEntries(got, mu, 2)
	if len(entries) != 2 {
		t.Fatalf("want entries for a and b only, got %d: %+v", len(entries), entries)
	}
	for _, e := range entries {
		if e.ProfileID == 3 {
			t.Fatal("c watched too little to count")
		}
		if len(e.Companions) != 1 {
			t.Fatalf("companions = %+v", e.Companions)
		}
		other := uint(1)
		if e.ProfileID == 1 {
			other = 2
		}
		if e.Companions[0].ProfileID != other {
			t.Fatalf("profile %d's companion = %d", e.ProfileID, e.Companions[0].ProfileID)
		}
		if e.Media.MediaId != 7 || e.RoomName != "Movie night" || e.WatchedSeconds < 200 {
			t.Fatalf("entry = %+v", e)
		}
		if (e.ProfileID == 1) != e.WasHost {
			t.Fatalf("host flag wrong on %+v", e)
		}
	}
}

func TestHistoryNeedsTwoPeople(t *testing.T) {
	m, s, got, mu := historyHarness(t)
	play(m, s, 1, map[string]bool{"a": true})
	play(m, s, 400, map[string]bool{"a": true}) // only the host actually watched
	m.mu.Lock()
	m.saveHistory(m.finishTallyLocked(s))
	m.mu.Unlock()
	if entries := waitEntries(got, mu, 1); len(entries) != 0 {
		t.Fatalf("solo viewing recorded: %+v", entries)
	}
}

func TestHistoryEpisodeChangeFinishesTally(t *testing.T) {
	m, s, got, mu := historyHarness(t)
	play(m, s, 1, map[string]bool{"a": true, "b": true})
	play(m, s, 200, map[string]bool{"a": true, "b": true})

	// Next episode: bump the epoch, everyone follows.
	m.mu.Lock()
	s.Epoch++
	s.MediaInfo = &MediaInfo{MediaId: 7, MediaTitle: "Frieren", EpisodeNumber: 5, StreamType: "localfile"}
	for _, p := range s.Participants {
		p.Epoch = s.Epoch
	}
	m.mu.Unlock()
	play(m, s, 1, map[string]bool{"a": true, "b": true})

	entries := waitEntries(got, mu, 2)
	if len(entries) != 2 || entries[0].Media.EpisodeNumber != 4 {
		t.Fatalf("episode 4 should be recorded on the switch: %+v", entries)
	}
}
