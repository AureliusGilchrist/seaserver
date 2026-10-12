// Package mangabaka is a fallback metadata source for manga, manhwa, manhua and light novels,
// backed by MangaBaka's public nightly database dump (https://mangabaka.org/data/database).
//
// The dump is streamed straight into a compact local SQLite index (only the few fields the app
// shows) and re-downloaded every week; the previous index is deleted once the new one is complete.
// Lookups never touch the network.
package mangabaka

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/glebarez/sqlite"
	"github.com/rs/zerolog"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

const (
	dumpURL   = "https://api.mangabaka.org/v1/database/series.jsonl.tar.gz"
	maxAge    = 7 * 24 * time.Hour
	maxTitles = 16
	batchSize = 2000
	indexName = "mangabaka.db"
	userAgent = "seanime-mangabaka-fallback"

	schemaStmt = `
CREATE TABLE IF NOT EXISTS series (
	id INTEGER PRIMARY KEY,
	anilist_id INTEGER,
	mal_id INTEGER,
	type TEXT,
	title TEXT,
	year INTEGER,
	cover TEXT,
	description TEXT,
	status TEXT,
	genres TEXT,
	authors TEXT,
	chapters INTEGER
);
CREATE TABLE IF NOT EXISTS titles (norm TEXT, series_id INTEGER);
`
	indexStmt = `
CREATE INDEX IF NOT EXISTS idx_titles_norm ON titles(norm);
CREATE INDEX IF NOT EXISTS idx_series_anilist ON series(anilist_id);
CREATE INDEX IF NOT EXISTS idx_series_mal ON series(mal_id);
`
)

// Record is what the index knows about one series.
type Record struct {
	ID          int
	AniListID   int
	MalID       int
	Type        string
	Title       string
	Year        int
	Cover       string
	Description string
	// Status is in AniList's vocabulary (RELEASING, FINISHED, HIATUS, CANCELLED, NOT_YET_RELEASED).
	Status   string
	Genres   []string
	Authors  []string
	Chapters int
}

var (
	mu       sync.Mutex
	dir      string
	logger   *zerolog.Logger
	db       *gorm.DB
	building bool
	started  bool
)

// Configure sets where the index lives and starts the weekly refresh check. Safe to call twice.
func Configure(l *zerolog.Logger, baseDir string) {
	mu.Lock()
	defer mu.Unlock()
	logger = l
	if baseDir == "" {
		if c, err := os.UserCacheDir(); err == nil {
			baseDir = filepath.Join(c, "Seanime")
		} else {
			baseDir = os.TempDir()
		}
	}
	dir = filepath.Join(baseDir, "mangabaka")
	_ = os.Remove(indexPath() + ".tmp")

	if !started {
		started = true
		go func() {
			Ready()
			for range time.Tick(6 * time.Hour) {
				Ready()
			}
		}()
	}
}

func indexPath() string { return filepath.Join(dir, indexName) }

func log() *zerolog.Logger {
	if logger != nil {
		return logger
	}
	l := zerolog.Nop()
	return &l
}

func openDB(path string) (*gorm.DB, error) {
	return gorm.Open(sqlite.Open(path), &gorm.Config{Logger: gormlogger.Discard})
}

// Ready reports whether an index is available, and starts a rebuild in the background when there is
// none or it is older than a week. Never blocks.
func Ready() bool {
	mu.Lock()
	defer mu.Unlock()
	if dir == "" {
		return false
	}
	info, err := os.Stat(indexPath())
	usable := err == nil && info.Size() > 0
	if (!usable || time.Since(info.ModTime()) > maxAge) && !building {
		building = true
		go func() {
			if err := Build(); err != nil {
				log().Warn().Err(err).Msg("mangabaka: Could not build the metadata index")
			}
		}()
	}
	if !usable {
		return false
	}
	if db == nil {
		d, err := openDB(indexPath())
		if err != nil {
			return false
		}
		db = d
	}
	return true
}

func normalize(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func current() *gorm.DB {
	mu.Lock()
	defer mu.Unlock()
	return db
}

// FindByTitle returns the series whose title (or any alias) matches exactly, ignoring case and
// punctuation. Nothing fuzzy: a wrong synopsis is worse than none.
func FindByTitle(title string, year int) *Record {
	norm := normalize(title)
	if norm == "" || !Ready() {
		return nil
	}
	d := current()
	if d == nil {
		return nil
	}
	query := `SELECT s.id FROM titles t JOIN series s ON s.id = t.series_id WHERE t.norm = ? ORDER BY (s.anilist_id IS NOT NULL) DESC, s.id ASC LIMIT 1`
	args := []any{norm}
	if year > 0 {
		query = `SELECT s.id FROM titles t JOIN series s ON s.id = t.series_id WHERE t.norm = ? ORDER BY (s.year = ?) DESC, (s.anilist_id IS NOT NULL) DESC, s.id ASC LIMIT 1`
		args = append(args, year)
	}
	var id int
	if err := d.Raw(query, args...).Row().Scan(&id); err != nil {
		return nil
	}
	return load(d, "id = ?", id)
}

// FindByAniListID returns the series linked to an AniList manga ID.
func FindByAniListID(anilistID int) *Record {
	if anilistID <= 0 || !Ready() {
		return nil
	}
	d := current()
	if d == nil {
		return nil
	}
	return load(d, "anilist_id = ?", anilistID)
}

func load(d *gorm.DB, where string, arg any) *Record {
	var (
		r                       Record
		al, mal, year, chapters sql.NullInt64
		typ, title, cover, desc sql.NullString
		status, genres, authors sql.NullString
	)
	row := d.Raw(`SELECT id, anilist_id, mal_id, type, title, year, cover, description, status, genres, authors, chapters FROM series WHERE `+where+` LIMIT 1`, arg).Row()
	if err := row.Scan(&r.ID, &al, &mal, &typ, &title, &year, &cover, &desc, &status, &genres, &authors, &chapters); err != nil {
		return nil
	}
	r.AniListID, r.MalID, r.Year, r.Chapters = int(al.Int64), int(mal.Int64), int(year.Int64), int(chapters.Int64)
	r.Type, r.Title, r.Cover, r.Description, r.Status = typ.String, title.String, cover.String, desc.String, status.String
	r.Genres = splitList(genres.String)
	r.Authors = splitList(authors.String)
	return &r
}

func splitList(s string) []string {
	if s == "" {
		return nil
	}
	return strings.Split(s, "\x1f")
}

// flexStrings reads a JSON array of strings, or of objects carrying a "name"/"title", without failing
// the whole record on an unexpected shape.
type flexStrings []string

func (f *flexStrings) UnmarshalJSON(b []byte) error {
	var items []json.RawMessage
	if json.Unmarshal(b, &items) != nil {
		return nil
	}
	for _, it := range items {
		var s string
		if json.Unmarshal(it, &s) == nil {
			*f = append(*f, s)
			continue
		}
		var o map[string]any
		if json.Unmarshal(it, &o) == nil {
			for _, k := range []string{"name", "title"} {
				if v, ok := o[k].(string); ok && v != "" {
					*f = append(*f, v)
					break
				}
			}
		}
	}
	return nil
}

type titleEntry struct {
	Title string `json:"title"`
}

type rawSeries struct {
	ID              int                     `json:"id"`
	Type            string                  `json:"type"`
	Title           string                  `json:"title"`
	RomanizedTitle  string                  `json:"romanized_title"`
	NativeTitle     string                  `json:"native_title"`
	State           string                  `json:"state"`
	Status          string                  `json:"status"`
	Description     string                  `json:"description"`
	Year            *int                    `json:"year"`
	MergedWith      *int                    `json:"merged_with"`
	Genres          flexStrings             `json:"genres"`
	Authors         flexStrings             `json:"authors"`
	TotalChapters   any                     `json:"total_chapters"`
	Titles          []titleEntry            `json:"titles"`
	SecondaryTitles map[string][]titleEntry `json:"secondary_titles"`
	Cover           *struct {
		Raw *struct {
			URL string `json:"url"`
		} `json:"raw"`
	} `json:"cover"`
	Source *struct {
		AniList *struct {
			ID any `json:"id"`
		} `json:"anilist"`
		MAL *struct {
			ID any `json:"id"`
		} `json:"my_anime_list"`
	} `json:"source"`
}

func toInt(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(t))
		return n
	}
	return 0
}

func mapStatus(s string) string {
	switch strings.ToLower(s) {
	case "releasing", "ongoing":
		return "RELEASING"
	case "completed", "finished":
		return "FINISHED"
	case "hiatus":
		return "HIATUS"
	case "cancelled", "canceled":
		return "CANCELLED"
	case "upcoming", "not_yet_released":
		return "NOT_YET_RELEASED"
	}
	return ""
}

// Build downloads the dump into a fresh index, then swaps it in and deletes the old one. The old index
// keeps serving lookups until the new one is complete.
func Build() error {
	defer func() {
		mu.Lock()
		building = false
		mu.Unlock()
	}()

	if dir == "" {
		return errors.New("not configured")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp := indexPath() + ".tmp"
	_ = os.Remove(tmp)
	defer os.Remove(tmp)

	log().Info().Msg("mangabaka: Downloading the weekly metadata dump")

	req, _ := http.NewRequest(http.MethodGet, dumpURL, nil)
	req.Header.Set("User-Agent", userAgent)
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("dump download returned %s", resp.Status)
	}

	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}
	tr := tar.NewReader(gz)

	g, err := openDB(tmp)
	if err != nil {
		return err
	}
	sqlDB, err := g.DB()
	if err != nil {
		return err
	}
	closed := false
	closeTmp := func() {
		if !closed {
			closed = true
			_ = sqlDB.Close()
		}
	}
	defer closeTmp()
	sqlDB.SetMaxOpenConns(1)

	for _, p := range []string{"PRAGMA journal_mode=OFF", "PRAGMA synchronous=OFF"} {
		_, _ = sqlDB.Exec(p)
	}
	if _, err := sqlDB.Exec(schemaStmt); err != nil {
		return err
	}

	count := 0
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if hdr.Typeflag != tar.TypeReg || !strings.HasSuffix(hdr.Name, ".jsonl") {
			continue
		}
		n, err := ingest(sqlDB, tr)
		count += n
		if err != nil {
			return err
		}
	}
	if count == 0 {
		return errors.New("the dump held no series")
	}
	if _, err := sqlDB.Exec(indexStmt); err != nil {
		return err
	}
	closeTmp()

	mu.Lock()
	defer mu.Unlock()
	if db != nil {
		if old, err := db.DB(); err == nil {
			_ = old.Close()
		}
		db = nil
	}
	_ = os.Remove(indexPath())
	if err := os.Rename(tmp, indexPath()); err != nil {
		return err
	}
	log().Info().Int("series", count).Msg("mangabaka: Metadata index refreshed, old one deleted")
	return nil
}

const insSeriesSQL = `INSERT OR REPLACE INTO series VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`

func ingest(sqlDB *sql.DB, r io.Reader) (int, error) {
	br := bufio.NewReaderSize(r, 1<<20)

	var (
		tx        *sql.Tx
		insSeries *sql.Stmt
		insTitle  *sql.Stmt
	)
	begin := func() error {
		var err error
		if tx, err = sqlDB.Begin(); err != nil {
			return err
		}
		if insSeries, err = tx.Prepare(insSeriesSQL); err != nil {
			return err
		}
		insTitle, err = tx.Prepare(`INSERT INTO titles VALUES (?,?)`)
		return err
	}
	if err := begin(); err != nil {
		return 0, err
	}

	total, inBatch := 0, 0
	for {
		line, rerr := br.ReadBytes('\n')
		if len(bytes.TrimSpace(line)) > 0 {
			var s rawSeries
			if json.Unmarshal(line, &s) == nil && s.ID > 0 && s.MergedWith == nil && (s.State == "" || s.State == "active") {
				store(insSeries, insTitle, &s)
				total++
				inBatch++
			}
		}
		if inBatch >= batchSize {
			if err := tx.Commit(); err != nil {
				return total, err
			}
			if err := begin(); err != nil {
				return total, err
			}
			inBatch = 0
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			_ = tx.Rollback()
			return total, rerr
		}
	}
	return total, tx.Commit()
}

func store(insSeries, insTitle *sql.Stmt, s *rawSeries) {
	var al, mal, year any
	if s.Source != nil {
		if s.Source.AniList != nil {
			if n := toInt(s.Source.AniList.ID); n > 0 {
				al = n
			}
		}
		if s.Source.MAL != nil {
			if n := toInt(s.Source.MAL.ID); n > 0 {
				mal = n
			}
		}
	}
	if s.Year != nil && *s.Year > 0 {
		year = *s.Year
	}
	cover := ""
	if s.Cover != nil && s.Cover.Raw != nil {
		cover = s.Cover.Raw.URL
	}
	title := s.Title
	if title == "" {
		title = s.RomanizedTitle
	}

	if _, err := insSeries.Exec(s.ID, al, mal, s.Type, title, year, cover, s.Description, mapStatus(s.Status),
		strings.Join(s.Genres, "\x1f"), strings.Join(s.Authors, "\x1f"), toInt(s.TotalChapters)); err != nil {
		return
	}

	seen := map[string]bool{}
	add := func(t string) {
		if len(seen) >= maxTitles {
			return
		}
		n := normalize(t)
		if n == "" || seen[n] {
			return
		}
		seen[n] = true
		_, _ = insTitle.Exec(n, s.ID)
	}
	add(s.Title)
	add(s.RomanizedTitle)
	add(s.NativeTitle)
	for _, t := range s.Titles {
		add(t.Title)
	}
	for _, list := range s.SecondaryTitles {
		for _, t := range list {
			add(t.Title)
		}
	}
}
