package shared_platform

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"
)

// IsOutageError reports whether an error from an AniList request looks like a transient
// connectivity/availability problem (network down, timeout, 5xx, rate-limit) rather than a
// permanent client error (auth, validation). Only outage-type errors should be queued for
// retry, so a genuinely-bad mutation never blocks the queue forever.
func IsOutageError(err error) bool {
	if err == nil {
		return false
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	msg := strings.ToLower(err.Error())
	for _, sig := range []string{
		"connection refused", "no such host", "network is unreachable", "timeout",
		"timed out", "eof", "connection reset", "tls handshake", "dial tcp",
		"temporary failure", "503", "502", "504", "500", "server error",
		"service unavailable", "too many requests", "429",
	} {
		if strings.Contains(msg, sig) {
			return true
		}
	}
	return false
}

// PendingMutationKind identifies which AniList mutation a queued entry represents.
type PendingMutationKind string

const (
	PendingKindUpdateEntry         PendingMutationKind = "UpdateMediaListEntry"
	PendingKindUpdateEntryProgress PendingMutationKind = "UpdateMediaListEntryProgress"
	PendingKindUpdateEntryRepeat   PendingMutationKind = "UpdateMediaListEntryRepeat"
	PendingKindDeleteEntry         PendingMutationKind = "DeleteEntry"
)

// PendingMutation is a serialisable record of an AniList mutation that could not be sent
// because the AniList API was unreachable at the time. The queue is replayed when the
// API becomes available again so the user's progress eventually syncs.
type PendingMutation struct {
	ID          string                     `json:"id"`
	Kind        PendingMutationKind        `json:"kind"`
	QueuedAt    time.Time                  `json:"queuedAt"`
	MediaID     *int                       `json:"mediaId,omitempty"`
	EntryID     *int                       `json:"entryId,omitempty"`
	Progress    *int                       `json:"progress,omitempty"`
	ScoreRaw    *int                       `json:"scoreRaw,omitempty"`
	Repeat      *int                       `json:"repeat,omitempty"`
	Status      *anilist.MediaListStatus   `json:"status,omitempty"`
	StartedAt   *anilist.FuzzyDateInput    `json:"startedAt,omitempty"`
	CompletedAt *anilist.FuzzyDateInput    `json:"completedAt,omitempty"`
}

// PendingMutationStore persists a small queue of AniList mutations to disk as JSON.
// The queue is intentionally small: for each (kind, target) pair we keep only the
// latest queued entry (since later progress values supersede earlier ones).
type PendingMutationStore struct {
	mu       sync.Mutex
	path     string
	logger   *zerolog.Logger
	loaded   bool
	entries  []*PendingMutation
	flushing atomic.Bool
}

// NewPendingMutationStore creates (and lazily loads) a queue backed by a JSON file in
// the given cache directory.
func NewPendingMutationStore(cacheDir string, logger *zerolog.Logger) *PendingMutationStore {
	return &PendingMutationStore{
		path:   filepath.Join(cacheDir, "pending_anilist_mutations.json"),
		logger: logger,
	}
}

func (s *PendingMutationStore) loadLocked() {
	if s.loaded {
		return
	}
	s.loaded = true
	s.entries = nil
	data, err := os.ReadFile(s.path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			s.logger.Warn().Err(err).Str("path", s.path).Msg("anilist cache: failed to read pending mutations file")
		}
		return
	}
	var loaded []*PendingMutation
	if err := json.Unmarshal(data, &loaded); err != nil {
		s.logger.Warn().Err(err).Str("path", s.path).Msg("anilist cache: failed to parse pending mutations file, discarding")
		return
	}
	s.entries = loaded
}

func (s *PendingMutationStore) persistLocked() {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		s.logger.Warn().Err(err).Msg("anilist cache: failed to create directory for pending mutations file")
		return
	}
	data, err := json.MarshalIndent(s.entries, "", "  ")
	if err != nil {
		s.logger.Warn().Err(err).Msg("anilist cache: failed to marshal pending mutations")
		return
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		s.logger.Warn().Err(err).Msg("anilist cache: failed to write pending mutations tmp file")
		return
	}
	if err := os.Rename(tmp, s.path); err != nil {
		s.logger.Warn().Err(err).Msg("anilist cache: failed to swap pending mutations file")
	}
}

func (s *PendingMutationStore) genID() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), len(s.entries))
}

// dedupeKey returns a key used to collapse repeated mutations targeting the same entity.
// For progress / entry / repeat updates keyed by mediaID, the most recent mutation wins.
// DeleteEntry is keyed by entryID. If a key cannot be determined the mutation is kept as-is.
func dedupeKey(m *PendingMutation) string {
	switch m.Kind {
	case PendingKindUpdateEntry, PendingKindUpdateEntryProgress, PendingKindUpdateEntryRepeat:
		if m.MediaID != nil {
			return string(m.Kind) + ":" + fmt.Sprintf("%d", *m.MediaID)
		}
	case PendingKindDeleteEntry:
		if m.EntryID != nil {
			return string(m.Kind) + ":" + fmt.Sprintf("%d", *m.EntryID)
		}
	}
	return ""
}

func (s *PendingMutationStore) enqueueLocked(m *PendingMutation) {
	key := dedupeKey(m)
	if key != "" {
		// Replace any existing entry with the same key so we only keep the most recent value.
		for i, existing := range s.entries {
			if dedupeKey(existing) == key {
				s.entries[i] = m
				return
			}
		}
	}
	s.entries = append(s.entries, m)
}

// Enqueue adds a mutation to the queue and persists it to disk.
func (s *PendingMutationStore) Enqueue(m *PendingMutation) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
	if m.ID == "" {
		m.ID = s.genID()
	}
	if m.QueuedAt.IsZero() {
		m.QueuedAt = time.Now()
	}
	s.enqueueLocked(m)
	s.persistLocked()
	s.logger.Info().
		Str("kind", string(m.Kind)).
		Interface("mediaId", m.MediaID).
		Interface("progress", m.Progress).
		Int("queue_size", len(s.entries)).
		Msg("anilist cache: queued mutation for retry (AniList unavailable)")
}

// Len returns the current number of queued mutations.
func (s *PendingMutationStore) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
	return len(s.entries)
}

// Snapshot returns a copy of the queued mutations without removing them.
func (s *PendingMutationStore) Snapshot() []*PendingMutation {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
	out := make([]*PendingMutation, len(s.entries))
	copy(out, s.entries)
	return out
}

// removeLocked removes the entry with the given ID. Returns true if it was present.
func (s *PendingMutationStore) removeLocked(id string) bool {
	for i, e := range s.entries {
		if e.ID == id {
			s.entries = append(s.entries[:i], s.entries[i+1:]...)
			return true
		}
	}
	return false
}

// Remove deletes the queued mutation with the given ID and persists the queue.
func (s *PendingMutationStore) Remove(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
	if s.removeLocked(id) {
		s.persistLocked()
	}
}

// Flush attempts to replay all queued mutations against the given client. It stops at the
// first failure (assuming the API is down again) so the remaining queue is preserved.
// Safe to call concurrently; only one flush runs at a time.
func (s *PendingMutationStore) Flush(ctx context.Context, client anilist.AnilistClient) {
	if client == nil {
		return
	}
	// Prevent overlapping flushes (e.g. transition watcher + caller-driven call).
	if !s.flushing.CompareAndSwap(false, true) {
		return
	}
	defer s.flushing.Store(false)

	pending := s.Snapshot()
	if len(pending) == 0 {
		return
	}
	s.logger.Info().Int("count", len(pending)).Msg("anilist cache: flushing queued mutations")

	for _, m := range pending {
		if ctx.Err() != nil {
			return
		}
		if err := s.replay(ctx, client, m); err != nil {
			// Stop the flush; assume the API is unavailable again. The remaining entries
			// stay in the queue for the next attempt.
			s.logger.Warn().Err(err).Str("kind", string(m.Kind)).Msg("anilist cache: queued mutation failed to replay; will retry later")
			return
		}
		s.Remove(m.ID)
	}
	s.logger.Info().Msg("anilist cache: queued mutations flushed successfully")
}

func (s *PendingMutationStore) replay(ctx context.Context, client anilist.AnilistClient, m *PendingMutation) error {
	switch m.Kind {
	case PendingKindUpdateEntry:
		_, err := client.UpdateMediaListEntry(ctx, m.MediaID, m.Status, m.ScoreRaw, m.Progress, m.StartedAt, m.CompletedAt)
		return err
	case PendingKindUpdateEntryProgress:
		_, err := client.UpdateMediaListEntryProgress(ctx, m.MediaID, m.Progress, m.Status, m.StartedAt, m.CompletedAt)
		return err
	case PendingKindUpdateEntryRepeat:
		_, err := client.UpdateMediaListEntryRepeat(ctx, m.MediaID, m.Repeat)
		return err
	case PendingKindDeleteEntry:
		_, err := client.DeleteEntry(ctx, m.EntryID)
		return err
	default:
		return fmt.Errorf("unknown pending mutation kind: %s", m.Kind)
	}
}
