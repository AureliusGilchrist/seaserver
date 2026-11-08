package enmasse

import (
	"bufio"
	"os"
	"path/filepath"
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
			s.entries = append(s.entries, e)
		}
	}
}

// add records a result and appends it to the file.
func (s *resultStore) add(e ActivityEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
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

// ResultCounts counts the results by outcome.
type ResultCounts struct {
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
	for _, e := range s.entries {
		switch e.Result {
		case "queued":
			c.Queued++
		case "torrent":
			c.Torrent++
		case "skipped":
			c.Skipped++
		case "not_found":
			c.NotFound++
		}
	}
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
