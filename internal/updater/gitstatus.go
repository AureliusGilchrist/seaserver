package updater

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/constants"
	"seanime/internal/events"
	"seanime/internal/util"
)

// The update status the settings page shows.
//
// Every few minutes the server fetches the fork and records whether it is behind, what is waiting
// (commits and files), and when it last looked. Checking never installs anything: the nightly
// install and the "Update now" button are the only things that do. The page reads this cached
// status, so opening it never waits on GitHub.

// StatusCheckInterval is how often the server checks the fork for new commits.
const StatusCheckInterval = 5 * time.Minute

// maxStatusCommits caps the commit list in the status.
const maxStatusCommits = 30

// PendingCommit is one commit an update would bring.
type PendingCommit struct {
	Hash    string `json:"hash"`
	Subject string `json:"subject"`
	Author  string `json:"author"`
	Date    int64  `json:"date"` // unix seconds
}

// UpdateStatus is the cached result of the last check.
type UpdateStatus struct {
	Version       string          `json:"version"`
	Commit        string          `json:"commit"`
	Behind        bool            `json:"behind"`
	CommitsBehind int             `json:"commitsBehind"`
	Commits       []PendingCommit `json:"commits"`
	Files         []FileChange    `json:"files"`
	Blocked       string          `json:"blocked,omitempty"`
	Updating      bool            `json:"updating"`
	Checking      bool            `json:"checking"`
	LastChecked   int64           `json:"lastChecked,omitempty"` // unix seconds
	NextCheck     int64           `json:"nextCheck,omitempty"`   // unix seconds
	LastError     string          `json:"lastError,omitempty"`
	LastUpdated   string          `json:"lastUpdated,omitempty"` // RFC3339, from the last update notice
	// Progress is where a running update is, so a page opened mid-update shows the real step. It
	// used to be sent only as websocket events, so a page opened after the update started sat at
	// "Starting the update… 0%" until the server restarted.
	Progress *UpdateProgress `json:"progress,omitempty"`
}

// UpdateProgress is the running update's current step.
type UpdateProgress struct {
	Percent   int    `json:"percent"`
	Step      string `json:"step"`
	Detail    string `json:"detail,omitempty"` // the build's latest output line
	StartedAt int64  `json:"startedAt"`        // unix seconds
	StepAt    int64  `json:"stepAt"`           // unix seconds the step began
}

type statusCache struct {
	mu       sync.Mutex
	status   UpdateStatus
	checking bool
}

var gitStatus statusCache

// Status returns the cached status, with the live "updating" flag and running version.
func (u *GitAutoUpdater) Status() UpdateStatus {
	gitStatus.mu.Lock()
	s := gitStatus.status
	s.Checking = gitStatus.checking
	gitStatus.mu.Unlock()
	s.Version = constants.Version
	s.Commit = shortHash(u.headCommit())
	s.Updating = u.updating.Load()
	if s.Updating {
		s.Progress = u.currentProgress()
	}
	if s.Commits == nil {
		s.Commits = []PendingCommit{}
	}
	if s.Files == nil {
		s.Files = []FileChange{}
	}
	return s
}

// RefreshStatus checks the fork now and updates the cached status. Returns the error of the check.
func (u *GitAutoUpdater) RefreshStatus() error {
	gitStatus.mu.Lock()
	if gitStatus.checking {
		gitStatus.mu.Unlock()
		return nil
	}
	gitStatus.checking = true
	wasBehind := gitStatus.status.Behind
	gitStatus.mu.Unlock()

	next := UpdateStatus{LastChecked: time.Now().Unix(), NextCheck: time.Now().Add(StatusCheckInterval).Unix()}
	behind, err := u.checkForUpdate()
	if err != nil {
		next.LastError = err.Error()
		u.logger.Warn().Err(err).Msg("selfupdate: Update check failed")
	} else if behind {
		ref := u.remoteRef()
		next.Behind = true
		next.Commits, next.CommitsBehind = u.pendingCommits(ref)
		next.Files = u.diffFiles(ref)
		next.Blocked = u.localWork(ref)
	}
	if notice := readLastUpdated(u.appDataDir); notice != "" {
		next.LastUpdated = notice
	}

	gitStatus.mu.Lock()
	gitStatus.status = next
	gitStatus.checking = false
	gitStatus.mu.Unlock()

	if next.Behind && !wasBehind {
		u.logger.Info().Int("commits", next.CommitsBehind).Msg("selfupdate: An update is available")
	}
	if u.wsEventManager != nil {
		u.wsEventManager.SendEvent(events.UpdateBackendStatus, nil)
	}
	return err
}

func (u *GitAutoUpdater) statusLoop() {
	defer util.HandlePanicInModuleThen("updater/gitAutoUpdate/statusLoop", func() {})
	// A short delay so start-up isn't competing with the first fetch.
	time.Sleep(20 * time.Second)
	for {
		if !u.updating.Load() {
			_ = u.RefreshStatus()
		}
		time.Sleep(StatusCheckInterval)
	}
}

// pendingCommits lists the commits HEAD..ref, newest first, and how many there are in all.
func (u *GitAutoUpdater) pendingCommits(ref string) ([]PendingCommit, int) {
	countOut, _ := u.git("rev-list", "--count", "HEAD.."+ref)
	count, _ := strconv.Atoi(strings.TrimSpace(countOut))
	out, err := u.git("log", "--format=%h%x1f%s%x1f%an%x1f%ct", "-n", strconv.Itoa(maxStatusCommits), "HEAD.."+ref)
	if err != nil {
		return nil, count
	}
	return parsePendingCommits(out), count
}

func parsePendingCommits(out string) []PendingCommit {
	var commits []PendingCommit
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		parts := strings.Split(line, "\x1f")
		if len(parts) != 4 {
			continue
		}
		date, _ := strconv.ParseInt(strings.TrimSpace(parts[3]), 10, 64)
		commits = append(commits, PendingCommit{Hash: parts[0], Subject: parts[1], Author: parts[2], Date: date})
	}
	return commits
}

// lastUpdateFileName holds when the server last updated itself (RFC3339).
const lastUpdateFileName = "last-update-at"

func readLastUpdated(appDataDir string) string {
	if appDataDir == "" {
		return ""
	}
	if data, err := os.ReadFile(filepath.Join(appDataDir, lastUpdateFileName)); err == nil {
		return strings.TrimSpace(string(data))
	}
	if data, err := os.ReadFile(filepath.Join(appDataDir, UpdateNoticeFileName)); err == nil {
		var n UpdateNotice
		if json.Unmarshal(data, &n) == nil {
			return n.UpdatedAt
		}
	}
	return ""
}

func shortHash(h string) string {
	h = strings.TrimSpace(h)
	if len(h) > 8 {
		return h[:8]
	}
	return h
}
