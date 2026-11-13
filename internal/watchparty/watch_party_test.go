package watchparty

import (
	"fmt"
	"testing"

	"seanime/internal/events"

	"github.com/rs/zerolog"
)

func newTestManager() *Manager {
	l := zerolog.Nop()
	return New(NewManagerOptions{
		Logger:             &l,
		WsEventManager:     events.NewMockWSEventManager(&l),
		GetProfileNameFunc: func(id uint) string { return fmt.Sprintf("P%d", id) },
	})
}

func seatCount(sessions []*Session, profileID uint) int {
	n := 0
	for _, s := range sessions {
		for _, p := range s.Participants {
			if p.ProfileID == profileID {
				n++
			}
		}
	}
	return n
}

func TestCreateJoinAndRemote(t *testing.T) {
	m := newTestManager()

	room, err := m.Create(1, "a", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if room.Name != "P1's room" {
		t.Fatalf("default name = %q", room.Name)
	}
	if _, err := m.Join(2, "b", room.ID); err != nil {
		t.Fatal(err)
	}

	// Only the remote holder can pass it.
	if _, err := m.PassRemote(2, "b", "a"); err == nil {
		t.Fatal("a non-holder passed the remote")
	}
	s, err := m.PassRemote(1, "a", "b")
	if err != nil {
		t.Fatal(err)
	}
	if s.participant("b").IsSource == false || s.participant("a").IsSource {
		t.Fatal("remote did not move to b")
	}

	// When the holder leaves, the remote passes on and the room stays open.
	if err := m.Leave(2, "b"); err != nil {
		t.Fatal(err)
	}
	st := m.Status()
	if len(st) != 1 || !st[0].participant("a").IsSource {
		t.Fatal("remote was not handed back to a")
	}

	// Last one out closes the room.
	if err := m.Leave(1, "a"); err != nil {
		t.Fatal(err)
	}
	if len(m.Status()) != 0 {
		t.Fatal("room not closed")
	}
}

func TestOneSeatPerProfile(t *testing.T) {
	m := newTestManager()

	room, _ := m.Create(1, "a", "movie night", nil)
	m.Join(2, "b", room.ID)

	// Profile 2 joins again from another device: the seat moves, it is not duplicated.
	s, err := m.Join(2, "b2", room.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Participants) != 2 || s.participant("b") != nil || s.participant("b2") == nil {
		t.Fatalf("seat did not move: %+v", s.Participants)
	}

	// The remote holder moving devices keeps the remote.
	s, _ = m.Join(1, "a2", room.ID)
	if p := s.participant("a2"); p == nil || !p.IsSource {
		t.Fatal("remote lost on device move")
	}

	// Profile 2 opens a second room: it leaves the first one.
	room2, err := m.Create(2, "b2", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	st := m.Status()
	if seatCount(st, 2) != 1 {
		t.Fatalf("profile 2 holds %d seats", seatCount(st, 2))
	}

	// Profile 1 joins room 2: room 1 empties and closes.
	m.Join(1, "a2", room2.ID)
	st = m.Status()
	if len(st) != 1 || st[0].ID != room2.ID || seatCount(st, 1) != 1 {
		t.Fatalf("unexpected rooms: %+v", st)
	}
}

func TestChat(t *testing.T) {
	m := newTestManager()
	room, _ := m.Create(1, "a", "", nil)
	m.Join(2, "b", room.ID)

	if _, err := m.SendChat(3, "c", "hi"); err == nil {
		t.Fatal("outsider could chat")
	}
	if _, err := m.SendChat(2, "b", "   "); err == nil {
		t.Fatal("empty message accepted")
	}
	msg, err := m.SendChat(2, "b", "hello\nthere")
	if err != nil {
		t.Fatal(err)
	}
	if msg.Text != "hello there" || msg.Username != "P2" {
		t.Fatalf("msg = %+v", msg)
	}

	// Rate limit.
	var limited bool
	for i := 0; i < chatRateLimitCount+2; i++ {
		if _, err := m.SendChat(1, "a", "spam"); err != nil {
			limited = true
		}
	}
	if !limited {
		t.Fatal("no rate limit")
	}

	hist := m.ChatHistory("b")
	var users int
	for _, h := range hist {
		if h.Kind == "user" {
			users++
		}
	}
	if users != 1+chatRateLimitCount {
		t.Fatalf("history has %d user messages", users)
	}
	if len(m.ChatHistory("zzz")) != 0 {
		t.Fatal("outsider sees history")
	}
}

func TestNoProfilesSeatsPerDevice(t *testing.T) {
	m := newTestManager()
	room, _ := m.Create(0, "a", "", nil)
	s, err := m.Join(0, "b", room.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Participants) != 2 {
		t.Fatalf("without profiles two devices should both be seated, got %d", len(s.Participants))
	}
	// The same device joining again is still one seat.
	s, _ = m.Join(0, "b", room.ID)
	if len(s.Participants) != 2 {
		t.Fatalf("duplicate seat for the same device: %d", len(s.Participants))
	}
}
