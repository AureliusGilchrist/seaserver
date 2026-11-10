package enmasse

import (
	"bufio"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/goccy/go-json"
)

// Every series the run checks gets one result (queued, skipped with its reason, not found with
// what each provider said), and all of them are kept: a whole database is tens of thousands, so
// they go to their own file next to the progress, one JSON line each, appended as they come.
// The page reads them a page at a time.

// AnimeResultsFilePath is where the run's results are kept. Empty: next to the progress file.
var AnimeResultsFilePath = ""

func resultsPath() string {
	if AnimeResultsFilePath != "" {
		return AnimeResultsFilePath
	}
	return filepath.Join(filepath.Dir(AnimeProgressFilePath), "enmasse-anime-results.jsonl")
}

// resultStore holds every result of the current run, oldest first.
type resultStore struct {
	mu      sync.Mutex
	loaded  bool
	entries []ActivityEntry
	path    string
}

func (s *resultStore) loadLocked() {
	path := resultsPath()
	if s.loaded && s.path == path {
		return
	}
	s.loaded, s.path, s.entries = true, path, nil
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for sc.Scan() {
		var e ActivityEntry
		if json.Unmarshal(sc.Bytes(), &e) == nil {
			explainEntry(&e)
			s.entries = append(s.entries, e)
		}
	}
}

// add records a result and appends it to the file.
func (s *resultStore) add(e ActivityEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
	explainEntry(&e)
	s.entries = append(s.entries, e)
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	_ = os.MkdirAll(filepath.Dir(s.path), 0o755)
	f, err := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(append(b, '\n'))
	return err
}

// reset forgets every result, in memory and on disk.
func (s *resultStore) reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loaded, s.path, s.entries = true, resultsPath(), nil
	_ = os.Remove(s.path)
}

// ReasonCount is how many results share a reason.
type ReasonCount struct {
	Reason string `json:"reason"`
	Count  int    `json:"count"`
}

// ResultCounts counts the results by outcome, and every outcome by its reason.
type ResultCounts struct {
	// SkippedBy counts the skips by reason (In library, Adult, No AniList entry, ...).
	SkippedBy []ReasonCount `json:"skippedBy"`
	// NotFoundBy counts the series no provider could supply, by their overall reason.
	NotFoundBy []ReasonCount `json:"notFoundBy"`
	// ProviderMisses counts what each provider said for those series ("AniZone: No episodes").
	ProviderMisses []ReasonCount `json:"providerMisses"`
	// QueuedFrom counts the series queued, by the provider they came from.
	QueuedFrom []ReasonCount `json:"queuedFrom"`

	Total    int `json:"total"`
	Queued   int `json:"queued"`
	Torrent  int `json:"torrent"`
	Skipped  int `json:"skipped"`
	NotFound int `json:"notFound"`
}

func (s *resultStore) counts() ResultCounts {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
	c := ResultCounts{Total: len(s.entries)}
	skipped, notFound, misses, from := map[string]int{}, map[string]int{}, map[string]int{}, map[string]int{}
	for _, e := range s.entries {
		switch e.Result {
		case "queued":
			c.Queued++
			from[providerLabel(e.Provider)]++
		case "torrent":
			c.Torrent++
			if e.Reason != "" {
				from[e.Reason]++
			} else {
				from[ReasonTorrent]++
			}
		case "skipped":
			c.Skipped++
			skipped[reasonKey(e.Reason, "Skipped")]++
		case "not_found":
			c.NotFound++
			notFound[reasonKey(e.Reason, ReasonNotFound)]++
			for _, r := range e.Reasons {
				name := providerLabel(r.Provider)
				if name == "" {
					name = "Other"
				}
				misses[name+": "+reasonKey(r.Reason, ReasonNotFound)]++
			}
		}
	}
	c.SkippedBy, c.NotFoundBy, c.ProviderMisses, c.QueuedFrom = sortedCounts(skipped), sortedCounts(notFound), sortedCounts(misses), sortedCounts(from)
	return c
}

// ResultsPage is one page of results, newest first.
type ResultsPage struct {
	Total int             `json:"total"`
	Items []ActivityEntry `json:"items"`
}

// page returns results newest first, filtered by outcome ("" or "all" for every one) and by a
// title search.
func (s *resultStore) page(offset, limit int, filter, search string) ResultsPage {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	search = strings.ToLower(strings.TrimSpace(search))
	out := ResultsPage{Items: []ActivityEntry{}}
	for i := len(s.entries) - 1; i >= 0; i-- {
		e := s.entries[i]
		if filter != "" && filter != "all" && e.Result != filter {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(e.Title), search) {
			continue
		}
		if out.Total >= offset && len(out.Items) < limit {
			out.Items = append(out.Items, e)
		}
		out.Total++
	}
	for i := range out.Items {
		explainEntry(&out.Items[i])
	}
	return out
}

// explainEntry gives an entry recorded before reasons existed its reason.
func explainEntry(e *ActivityEntry) {
	if e.Reason != "" || e.Detail == "" {
		return
	}
	switch e.Result {
	case "skipped":
		e.Reason, _ = explainResult(onlineSkip{e.Detail})
	case "not_found":
		e.Reason, e.Reasons = explainResult(errorString(e.Detail))
	}
}

type errorString string

func (e errorString) Error() string { return string(e) }

// Results returns a page of the run's results, newest first.
func (d *Downloader) Results(offset, limit int, filter, search string) ResultsPage {
	return d.results.page(offset, limit, filter, search)
}

// reasonKey groups a reason label: the numbers in it ("Not found (6 spellings)", "Episode count
// mismatch (24 vs 50)") are left out, so every such result counts under one heading.
func reasonKey(label, fallback string) string {
	if label == "" {
		return fallback
	}
	for _, base := range []string{ReasonNotFound, ReasonCountMismatch} {
		if strings.HasPrefix(label, base+" (") {
			return base
		}
	}
	return label
}

func providerLabel(id string) string {
	switch id {
	case "kickassanime":
		return "Kickassanime"
	case "anizone":
		return "AniZone"
	case "megaplay":
		return "MegaPlay"
	case "animeheaven":
		return "AnimeHeaven"
	case "animegg":
		return "AnimeGG"
	case "animepahe":
		return "AnimePahe"
	case "torrent":
		return "Torrent"
	case "":
		return ""
	}
	return id
}

func sortedCounts(m map[string]int) []ReasonCount {
	out := make([]ReasonCount, 0, len(m))
	for k, v := range m {
		out = append(out, ReasonCount{Reason: k, Count: v})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Reason < out[j].Reason
	})
	return out
}
