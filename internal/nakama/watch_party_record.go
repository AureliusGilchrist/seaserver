package nakama

import (
	"sync"
	"time"
)

// PartyRecord summarizes one watch party this server's user took part in. It feeds the social
// achievements ("host 10 parties", "watch with 20 different peers", "a party past midnight").
type PartyRecord struct {
	ProfileID    uint
	Host         bool
	Started      time.Time
	Ended        time.Time
	Peers        []string // usernames of the other participants
	MaxPeers     int
	ChatMessages int
}

// partyRecorder follows the current session by sampling it, so no lifecycle path (stop, leave,
// host gone, disconnect) can be missed: when the session is no longer there, the party is over.
type partyRecorder struct {
	mu        sync.Mutex
	profileID uint
	active    bool
	rec       PartyRecord
	peers     map[string]bool
	started   bool
	onEnded   func(PartyRecord)
}

const partySampleEvery = 30 * time.Second

// SetPartyProfile names the profile the current (or next) watch party belongs to — the one that
// created or joined it — and starts following parties.
func (wpm *WatchPartyManager) SetPartyProfile(profileID uint) {
	r := wpm.recorder()
	r.mu.Lock()
	r.profileID = profileID
	start := !r.started
	r.started = true
	r.mu.Unlock()
	if start {
		go wpm.followParties()
	}
}

// OnPartyEnded sets the callback that receives each finished party.
func (wpm *WatchPartyManager) OnPartyEnded(fn func(PartyRecord)) {
	r := wpm.recorder()
	r.mu.Lock()
	r.onEnded = fn
	r.mu.Unlock()
}

var recorders sync.Map // *WatchPartyManager → *partyRecorder

func (wpm *WatchPartyManager) recorder() *partyRecorder {
	v, _ := recorders.LoadOrStore(wpm, &partyRecorder{})
	return v.(*partyRecorder)
}

func (wpm *WatchPartyManager) noteChatMessage() {
	r := wpm.recorder()
	r.mu.Lock()
	if r.active {
		r.rec.ChatMessages++
	}
	r.mu.Unlock()
}

func (wpm *WatchPartyManager) followParties() {
	ticker := time.NewTicker(partySampleEvery)
	defer ticker.Stop()
	for range ticker.C {
		wpm.samplePartyState()
	}
}

func (wpm *WatchPartyManager) samplePartyState() {
	session, inParty := wpm.GetCurrentSession()
	r := wpm.recorder()
	now := time.Now()

	r.mu.Lock()
	if inParty && session != nil {
		if !r.active {
			r.active = true
			r.peers = map[string]bool{}
			r.rec = PartyRecord{ProfileID: r.profileID, Host: wpm.manager.IsHost(), Started: now}
		}
		self := wpm.manager.username
		session.mu.RLock()
		n := 0
		for id, p := range session.Participants {
			if p == nil || (wpm.manager.IsHost() && id == "host") || p.Username == self {
				continue
			}
			n++
			if p.Username != "" {
				r.peers[p.Username] = true
			}
		}
		session.mu.RUnlock()
		if n > r.rec.MaxPeers {
			r.rec.MaxPeers = n
		}
		r.mu.Unlock()
		return
	}
	if !r.active {
		r.mu.Unlock()
		return
	}
	r.active = false
	rec := r.rec
	rec.Ended = now
	for p := range r.peers {
		rec.Peers = append(rec.Peers, p)
	}
	cb := r.onEnded
	r.mu.Unlock()
	if cb != nil && rec.ProfileID > 0 && rec.Ended.Sub(rec.Started) >= time.Minute {
		cb(rec)
	}
}
