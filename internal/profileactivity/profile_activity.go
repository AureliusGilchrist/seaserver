package profileactivity

import "sync"

// Activity kinds.
const (
	KindIdle     = "idle"
	KindWatching = "watching"
	KindReading  = "reading"
)

// Item is what a profile is doing right now, as seen by other profiles on the server.
type Item struct {
	ProfileID       uint    `json:"profileId"`
	Username        string  `json:"username"`
	IsOnline        bool    `json:"isOnline"`
	Kind            string  `json:"kind"` // "watching" | "reading" | "idle"
	MediaTitle      string  `json:"mediaTitle,omitempty"`
	EpisodeNumber   int     `json:"episodeNumber,omitempty"`
	ChapterNumber   int     `json:"chapterNumber,omitempty"`
	ProgressPercent float64 `json:"progressPercent,omitempty"`
}

// List is the payload of the activity endpoint.
type List struct {
	Items []Item `json:"items"`
}

// Manager holds activity reported by clients themselves (manga reading has no
// server-side playback state to derive it from). Watching activity is derived
// from VideoCore at request time and does not live here.
type Manager struct {
	mu             sync.RWMutex
	mangaByProfile map[uint]Item
}

func NewManager() *Manager {
	return &Manager{mangaByProfile: make(map[uint]Item)}
}

// SetReading records (or clears, when title is empty) the manga activity a client
// reported for its profile.
func (m *Manager) SetReading(profileID uint, mediaTitle string, chapterNumber int, progressPercent float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if mediaTitle == "" {
		delete(m.mangaByProfile, profileID)
		return
	}
	m.mangaByProfile[profileID] = Item{
		Kind:            KindReading,
		MediaTitle:      mediaTitle,
		ChapterNumber:   chapterNumber,
		ProgressPercent: progressPercent,
	}
}

// Reading returns a copy of the reported manga activity for a profile.
func (m *Manager) Reading(profileID uint) (Item, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	a, ok := m.mangaByProfile[profileID]
	if !ok {
		return Item{}, false
	}
	return a, true
}
