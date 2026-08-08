package enqueuefuture

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// ProgressFileName is where an in-flight run records itself, inside the app data directory.
const ProgressFileName = "enqueue-future-progress.json"

// RunProgress is everything needed to pick a run back up exactly where it stopped.
//
// The queue itself and every prepared snapshot already live in the database, so none of that is
// duplicated here. What the database cannot answer is the part that only exists while the worker is
// alive: which anime this run started from, and which ones it has already walked. Without the walk
// state a resumed run would rediscover anime it had already decided about and re-expand rings it
// had already expanded, and the 125 it eventually queued would not be the 125 it was going to.
//
// It is a file rather than a table because it is scratch state for one run, rewritten constantly and
// meaningless once the run ends — putting it in the database would mean migrating a table whose
// entire contents are deleted the moment the work finishes.
type RunProgress struct {
	RootMediaID int    `json:"rootMediaId"`
	RootTitle   string `json:"rootTitle"`
	ProfileID   uint   `json:"profileId"`
	// Seen is every anime this run has already made a decision about — queued, skipped or walked
	// past. A recommendation graph loops constantly, so this is what stops it going in circles.
	Seen []int `json:"seen"`
	// Depths records how far out each anime was found, so a resumed run keeps numbering its rings
	// from where it left off rather than restarting at 1.
	Depths map[int]int `json:"depths"`
	// RootWalked distinguishes "stopped before the first ring was fetched" from "stopped later" —
	// the root is walked once for its recommendations and must not be walked again.
	RootWalked bool      `json:"rootWalked"`
	Discovered int       `json:"discovered"`
	Prepared   int       `json:"prepared"`
	Failed     int       `json:"failed"`
	Skipped    int       `json:"skipped"`
	StartedAt  time.Time `json:"startedAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (r *Repository) progressPath() string {
	if r.dataDir == "" {
		return ""
	}
	return filepath.Join(r.dataDir, ProgressFileName)
}

// saveProgress records the run so it survives the process. Best effort: failing to write is worth a
// log line, not abandoning a run that is otherwise working.
func (r *Repository) saveProgress(p *RunProgress) {
	path := r.progressPath()
	if path == "" || p == nil {
		return
	}

	p.UpdatedAt = time.Now()
	data, err := json.Marshal(p)
	if err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to encode progress")
		return
	}

	// Write beside the target and rename over it, so a process killed mid-write leaves the previous
	// good file rather than a truncated one — which is the exact moment this feature has to survive.
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to write progress")
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to replace progress file")
		_ = os.Remove(tmp)
	}
}

// loadProgress reads back an interrupted run, or nil when there is nothing to resume.
func (r *Repository) loadProgress() *RunProgress {
	path := r.progressPath()
	if path == "" {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var p RunProgress
	if err := json.Unmarshal(data, &p); err != nil {
		// A corrupt progress file must not wedge the feature: drop it and let the queue be
		// restarted by hand rather than failing to load on every boot from here on.
		r.logger.Warn().Err(err).Msg("enqueuefuture: Discarding unreadable progress file")
		_ = os.Remove(path)
		return nil
	}
	if p.RootMediaID == 0 {
		return nil
	}
	if p.Depths == nil {
		p.Depths = map[int]int{}
	}
	return &p
}

// clearProgress removes the record of a run. Called when a run finishes on its own terms or the
// queue is cleared — anything left resumable at that point would be resuming work that is done.
func (r *Repository) clearProgress() {
	path := r.progressPath()
	if path == "" {
		return
	}
	_ = os.Remove(path)
}
