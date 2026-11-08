package onlinestream_download

import (
	"sort"
	"time"
)

// The queue can hold thousands of episodes (a whole catalogue from the en masse downloader), so
// clients never get the full list. They get a summary — counts, one line per series and the
// episode downloading now — and fetch a series' episodes only when they open it.

const (
	// ProgressEvent carries just the episode downloading now, a few times a second at most.
	ProgressEvent = "onlinestream-download-progress"
	// FinishedEvent carries an episode that just completed or failed.
	FinishedEvent = "onlinestream-download-finished"
)

// QueueCounts counts the queue's episodes by state.
type QueueCounts struct {
	Queued    int `json:"queued"`
	Running   int `json:"running"`
	Completed int `json:"completed"`
	Failed    int `json:"failed"`
	Cancelled int `json:"cancelled"`
	Total     int `json:"total"`
}

// SeriesSummary is one anime's line in the queue.
type SeriesSummary struct {
	MediaId        int     `json:"mediaId"`
	Title          string  `json:"title"`
	Image          string  `json:"image,omitempty"`
	Total          int     `json:"total"`
	Queued         int     `json:"queued"`
	Done           int     `json:"done"`
	Failed         int     `json:"failed"`
	Cancelled      int     `json:"cancelled"`
	Running        bool    `json:"running"`
	RunningEpisode int     `json:"runningEpisode,omitempty"`
	Progress       float64 `json:"progress"` // finished episodes plus the running one's fraction, 0..1
	Bytes          int64   `json:"bytes"`
}

// QueueSummary is what the queue endpoint and event send.
type QueueSummary struct {
	Paused  bool   `json:"paused"`
	Blocked string `json:"blocked,omitempty"`
	// Rev changes whenever an episode is added, removed, reordered or changes state; a client
	// refetches the series it has open when it moves.
	Rev     int64            `json:"rev"`
	Counts  QueueCounts      `json:"counts"`
	Running *Item            `json:"running,omitempty"`
	Series  []*SeriesSummary `json:"series"`
}

// HistorySeries is one anime in the Downloaded list.
type HistorySeries struct {
	MediaId     int       `json:"mediaId"`
	Title       string    `json:"title"`
	Image       string    `json:"image,omitempty"`
	Episodes    int       `json:"episodes"`
	Bytes       int64     `json:"bytes"`
	CompletedAt time.Time `json:"completedAt"`
}

func copyItem(it *Item) *Item {
	c := *it
	c.Warnings = append([]string(nil), it.Warnings...)
	c.cancel = nil
	return &c
}

// summaryLocked builds the summary. Called with m.mu held.
func (m *Manager) summaryLocked() *QueueSummary {
	s := &QueueSummary{Paused: m.paused, Blocked: m.blocked, Rev: m.rev, Series: []*SeriesSummary{}}
	bySeries := make(map[int]*SeriesSummary)
	for _, it := range m.items {
		ss, ok := bySeries[it.MediaId]
		if !ok {
			ss = &SeriesSummary{MediaId: it.MediaId, Title: it.Title, Image: it.Image}
			bySeries[it.MediaId] = ss
			s.Series = append(s.Series, ss) // queue order of each series' first episode
		}
		ss.Total++
		s.Counts.Total++
		switch it.Status {
		case StatusQueued:
			ss.Queued++
			s.Counts.Queued++
		case StatusCompleted:
			ss.Done++
			ss.Bytes += it.Bytes
			s.Counts.Completed++
		case StatusFailed:
			ss.Failed++
			s.Counts.Failed++
		case StatusCancelled:
			ss.Cancelled++
			s.Counts.Cancelled++
		default: // fetching, downloading, muxing, registering
			ss.Running = true
			ss.RunningEpisode = it.EpisodeNumber
			s.Counts.Running++
			if s.Running == nil {
				s.Running = copyItem(it)
			}
		}
	}
	for _, ss := range s.Series {
		if ss.Total == 0 {
			continue
		}
		f := float64(ss.Done)
		if ss.Running && s.Running != nil && s.Running.MediaId == ss.MediaId && s.Running.Status == StatusDownloading {
			f += s.Running.Progress
		}
		ss.Progress = f / float64(ss.Total)
	}
	return s
}

// Summary returns the queue summary.
func (m *Manager) Summary() *QueueSummary {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.summaryLocked()
}

// SeriesItems returns one anime's episodes in queue order.
func (m *Manager) SeriesItems(mediaId int) []*Item {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*Item, 0)
	for _, it := range m.items {
		if it.MediaId == mediaId {
			out = append(out, copyItem(it))
		}
	}
	return out
}

// HistorySummary groups the Downloaded list by anime, most recent first.
func (m *Manager) HistorySummary() []*HistorySeries {
	m.mu.Lock()
	defer m.mu.Unlock()
	byMedia := make(map[int]*HistorySeries)
	for _, h := range m.history {
		hs, ok := byMedia[h.MediaId]
		if !ok {
			hs = &HistorySeries{MediaId: h.MediaId, Title: h.Title, Image: h.Image}
			byMedia[h.MediaId] = hs
		}
		hs.Episodes++
		hs.Bytes += h.Bytes
		if h.CompletedAt.After(hs.CompletedAt) {
			hs.CompletedAt = h.CompletedAt
		}
	}
	out := make([]*HistorySeries, 0, len(byMedia))
	for _, hs := range byMedia {
		out = append(out, hs)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CompletedAt.After(out[j].CompletedAt) })
	return out
}
