package updater

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
	_ "time/tzdata"

	"seanime/internal/events"
	"seanime/internal/util"

	"github.com/rs/zerolog"
)

// The fork's own auto-updater.
//
// This is a fork of Seanime, and it updates from the fork and from nothing else: the only remote
// it ever names is `origin`, the checkout's own. Upstream Seanime's releases are never read,
// fetched or offered — an update here is a commit on the fork's repository, and the updater cannot
// reach anything else because it never asks.
//
// The updater runs because a NAS deployment is started by hand (`build-all.sh && ./seanime`) and
// nothing would otherwise restart it. So the server does it itself: it watches its own repository
// for new commits, and when there is one it pulls, builds the new version while the server is
// still running, and only then replaces the running process with it. A failed build is not a
// failed update — the old version keeps running, which is what build-then-swap has to mean.
//
// Three properties, the same ones the queues in this app hold themselves to:
//
//   - Nothing outside the fork's repository is touched. Every git command names `origin`.
//   - Local work is never destroyed. A working tree with changes in it is skipped and logged; an
//     update is a fast-forward of a clean tree, and nothing else.
//   - The server does not go down for a build. The check, the pull and the build all happen while
//     the current version is still serving; the only moment that matters is the swap, which is the
//     last thing that happens.
//
// Checked once a day at 2:00 a.m. in the Pacific time zone, so the process replacement does not
// interrupt normal use. SEANIME_AUTO_UPDATE=0 turns it off.

const (
	gitUpdateTimeZone = "America/Los_Angeles"
	// The remote the updater is allowed to name. This is a fork; upstream is never read.
	gitUpdateRemote = "origin"
	// How long the "restarting" message is given to reach the client before the process is
	// replaced underneath it.
	gitUpdateRestartDelay = 5 * time.Second
)

type GitAutoUpdater struct {
	logger         *zerolog.Logger
	wsEventManager *events.WSEventManager
	repoDir        string
	// appDataDir is where the update notice is written. The notice has to survive the restart this
	// updater performs — the process is replaced underneath itself — so it is in the data
	// directory, not in memory.
	appDataDir string
	updating   atomic.Bool
}

// gitUpdaterRef holds the updater the server started with, so the API can ask it whether the
// checkout is behind the fork's latest commit — the question the update check is, now that updates
// are a commit and not a release.
var gitUpdaterRef = util.NewRef[*GitAutoUpdater](nil)

// StartGitAutoUpdate starts the fork's auto-updater when the server is running from inside its own
// git checkout — the NAS deployment case. A binary that is not in a checkout has nothing to pull,
// so the updater is simply not started there.
func StartGitAutoUpdate(logger *zerolog.Logger, wsEventManager *events.WSEventManager, appDataDir string) {
	announceCompletedUpdate(appDataDir)

	repoDir, ok := gitRepoDir()
	if !ok {
		logger.Info().Msg("selfupdate: Not running from a git checkout, auto-update is off")
		return
	}

	u := &GitAutoUpdater{
		logger:         logger,
		wsEventManager: wsEventManager,
		repoDir:        repoDir,
		appDataDir:     appDataDir,
	}
	gitUpdaterRef.Set(u)

	if disabled := os.Getenv("SEANIME_AUTO_UPDATE"); disabled == "0" || strings.EqualFold(disabled, "false") {
		logger.Info().Msg("selfupdate: Auto-update disabled (SEANIME_AUTO_UPDATE=0)")
		return
	}

	location, err := time.LoadLocation(gitUpdateTimeZone)
	if err != nil {
		logger.Error().Err(err).Str("timezone", gitUpdateTimeZone).
			Msg("selfupdate: Could not load the scheduled update time zone; auto-update is off")
		return
	}

	logger.Info().Str("dir", repoDir).Str("schedule", "02:00 "+gitUpdateTimeZone).
		Msg("selfupdate: Scheduled daily check for updates from the fork")

	go u.loop(location)
}

// announceCompletedUpdate runs at start-up. When the notice the previous process wrote just before
// replacing itself is fresh, this process is the new version, so clients connecting to it are
// told the switch succeeded.
func announceCompletedUpdate(appDataDir string) {
	if appDataDir == "" {
		return
	}
	data, err := os.ReadFile(filepath.Join(appDataDir, UpdateNoticeFileName))
	if err != nil {
		return
	}
	var notice UpdateNotice
	if json.Unmarshal(data, &notice) != nil {
		return
	}
	at, err := time.Parse(time.RFC3339, notice.UpdatedAt)
	if err != nil || time.Since(at) > 5*time.Minute {
		return
	}
	msg := "Backend updated successfully — now running the new version"
	if notice.Title != "" {
		msg += ": " + notice.Title
	}
	events.SetStartupToastMessage(msg)
}

// gitRepoDir returns the working directory when it is inside a git checkout.
func gitRepoDir() (string, bool) {
	wd, err := os.Getwd()
	if err != nil {
		return "", false
	}
	if _, err := os.Stat(filepath.Join(wd, ".git")); err != nil {
		return "", false
	}
	return wd, true
}

func (u *GitAutoUpdater) loop(location *time.Location) {
	defer util.HandlePanicInModuleThen("updater/gitAutoUpdate/loop", func() {})

	for {
		nextCheck := nextGitAutoUpdateTime(time.Now(), location)
		timer := time.NewTimer(time.Until(nextCheck))
		<-timer.C

		if u.updating.Load() {
			u.logger.Info().Msg("selfupdate: Skipping scheduled check because an update is already running")
			continue
		}
		if behind, err := u.checkForUpdate(); err != nil {
			u.logger.Warn().Err(err).Msg("selfupdate: Could not check for an update")
		} else if behind {
			u.update()
		}
	}
}

func nextGitAutoUpdateTime(now time.Time, location *time.Location) time.Time {
	localNow := now.In(location)
	year, month, day := localNow.Date()
	next := time.Date(year, month, day, 2, 0, 0, 0, location)
	if next.Hour() != 2 {
		next = time.Date(year, month, day, 3, 0, 0, 0, location)
	}
	if !next.After(localNow) {
		nextDay := localNow.AddDate(0, 0, 1)
		year, month, day = nextDay.Date()
		next = time.Date(year, month, day, 2, 0, 0, 0, location)
		if next.Hour() != 2 {
			next = time.Date(year, month, day, 3, 0, 0, 0, location)
		}
	}
	return next
}

// checkForUpdate fetches the fork's repository — origin, and only origin — and reports whether the
// checkout is behind it.
func (u *GitAutoUpdater) checkForUpdate() (bool, error) {
	branch, err := u.git("rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return false, err
	}
	branch = strings.TrimSpace(branch)
	if branch == "" || branch == "HEAD" {
		// Detached. The only remote that may be named here is still origin, and only the branch
		// main is tracked when there is nothing else to go on.
		branch = "main"
	}

	// Fetch names the remote explicitly: `git fetch origin` is the fork's repository and nothing
	// else. A bare `git fetch` would be wrong for exactly the reason this comment exists.
	if _, err := u.git("fetch", gitUpdateRemote, branch); err != nil {
		return false, err
	}

	// Behind means the fork has commits this checkout lacks. A checkout that merely differs (it is
	// ahead, or has diverged) is not behind, and reporting it as such made the update look
	// permanently available while the fast-forward could never succeed.
	remoteRef := fmt.Sprintf("%s/%s", gitUpdateRemote, branch)
	countStr, err := u.git("rev-list", "--count", "HEAD.."+remoteRef)
	if err != nil {
		return false, err
	}
	count, _ := strconv.Atoi(strings.TrimSpace(countStr))
	behind := count > 0
	if behind {
		u.logger.Info().Int("commits", count).Msg("selfupdate: The fork has new commits")
	} else if built := u.builtCommit(); built != "" && built != u.headCommit() {
		// HEAD already matches the fork, but the last successful build was of an older commit: an
		// earlier update moved the checkout and then failed to build, so the running binary is old.
		u.logger.Info().Msg("selfupdate: The checkout is newer than the last successful build")
		behind = true
	} else if built == "" && u.binaryOlderThanHead() {
		u.logger.Info().Msg("selfupdate: The running binary is older than the checked-out commit")
		behind = true
	}
	return behind, nil
}

// binaryOlderThanHead covers a checkout moved by an update from before builds were tracked.
func (u *GitAutoUpdater) binaryOlderThanHead() bool {
	exe := getExePath()
	if exe == "" {
		return false
	}
	info, err := os.Stat(exe)
	if err != nil {
		return false
	}
	out, err := u.git("show", "-s", "--format=%ct", "HEAD")
	if err != nil {
		return false
	}
	secs, err := strconv.ParseInt(strings.TrimSpace(out), 10, 64)
	return err == nil && time.Unix(secs, 0).After(info.ModTime())
}

func (u *GitAutoUpdater) markerPath() string {
	return filepath.Join(u.repoDir, ".git", "seanime-built-commit")
}

func (u *GitAutoUpdater) headCommit() string {
	out, err := u.git("rev-parse", "HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// builtCommit is the commit the running binary was last successfully built from, or "".
func (u *GitAutoUpdater) builtCommit() string {
	b, err := os.ReadFile(u.markerPath())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func (u *GitAutoUpdater) setBuiltCommit(commit string) {
	if commit == "" {
		return
	}
	_ = os.WriteFile(u.markerPath(), []byte(commit+"\n"), 0o644)
}

// diffBase is what the update's changes are measured from: the last successfully built commit when
// there is one, otherwise HEAD.
func (u *GitAutoUpdater) diffBase() string {
	if b := u.builtCommit(); b != "" {
		return b
	}
	return "HEAD"
}

// localWork describes local changes or commits that an update will shelve, or "" when the checkout
// is clean and simply behind.
func (u *GitAutoUpdater) localWork(remoteRef string) string {
	var notes []string
	if status, err := u.git("status", "--porcelain", "--untracked-files=no"); err == nil {
		if s := strings.TrimSpace(status); s != "" {
			lines := strings.Split(s, "\n")
			if len(lines) > 5 {
				lines = append(lines[:5], fmt.Sprintf("… and %d more", len(lines)-5))
			}
			notes = append(notes, "local changes ("+strings.Join(lines, "; ")+")")
		}
	}
	if _, err := u.git("merge-base", "--is-ancestor", "HEAD", remoteRef); err != nil {
		notes = append(notes, "local commits that are not on the fork")
	}
	if len(notes) == 0 {
		return ""
	}
	return "this checkout has " + strings.Join(notes, " and ") + "; they will be saved to a backup ref and replaced by the fork's version"
}

// resetBlockRe matches the paths git names when it cannot replace a tracked file, e.g.
// "error: unable to unlink old 'seanime-web/public/jassub/jassub-worker.js': Permission denied".
var resetBlockRe = regexp.MustCompile(`(?:unable to unlink old|unable to create file) '([^']+)'`)

// resetBlocked reports whether a failed reset was blocked by files this process cannot replace —
// leftovers owned by another user, almost always root's from a build that was run with sudo.
func resetBlocked(err error) bool {
	if err == nil || runtime.GOOS == "windows" {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "unable to unlink old") ||
		strings.Contains(msg, "unable to create file") ||
		strings.Contains(msg, "Operation not permitted") ||
		strings.Contains(msg, "Permission denied")
}

// shelve saves whatever local work the checkout has under refs/seanime-backup/ (so nothing is
// lost) and then moves the checkout onto the fork's latest commit, whatever state it was in.
func (u *GitAutoUpdater) shelve(remoteRef string) error {
	stamp := time.Now().Format("20060102-150405")
	if head, err := u.git("rev-parse", "HEAD"); err == nil {
		_, _ = u.git("update-ref", "refs/seanime-backup/"+stamp+"-head", strings.TrimSpace(head))
	}
	// `stash create` records the tracked changes as a commit without touching the tree.
	if snap, err := u.git("stash", "create"); err == nil && strings.TrimSpace(snap) != "" {
		_, _ = u.git("update-ref", "refs/seanime-backup/"+stamp+"-changes", strings.TrimSpace(snap))
	}
	out, err := u.git("reset", "--hard", remoteRef)
	// A build run with sudo leaves root-owned files behind that this process cannot overwrite, and
	// the reset fails on them. Repair what git named — take the files back with passwordless sudo
	// when it exists, move them aside when it does not, which needs only write access to their
	// parent directory — and retry a few times, since each pass can surface another blocked path.
	for attempt := 0; err != nil && attempt < 4 && resetBlocked(err); attempt++ {
		u.logger.Warn().Msg("selfupdate: The checkout holds files owned by another user (root's, from a sudo build) — attempting automatic repair")
		if !u.repairBlockedPaths(err.Error(), stamp) {
			return fmt.Errorf("%w (files in the checkout are owned by another user, probably root from a sudo build; fix once with: sudo chown -R %d:%d %s)",
				err, os.Getuid(), os.Getgid(), u.repoDir)
		}
		out, err = u.git("reset", "--hard", remoteRef)
	}
	if err != nil {
		return fmt.Errorf("%s %w", strings.TrimSpace(out), err)
	}
	return nil
}

// repairBlockedPaths frees the paths a failed reset named, so the retry can replace them. When
// passwordless sudo works, ownership is taken back with it — the clean repair. When it does not,
// the blocked path's nearest movable ancestor is renamed aside instead: git recreates the whole
// path, and the rename only needs write access to the parent directory, which this process has
// where the root-owned file inside does not. Reports whether anything was freed.
func (u *GitAutoUpdater) repairBlockedPaths(gitOutput, stamp string) bool {
	var paths []string
	seen := map[string]bool{}
	for _, m := range resetBlockRe.FindAllStringSubmatch(gitOutput, -1) {
		rel := filepath.Clean(m[1])
		if rel == "." || strings.HasPrefix(rel, "..") || strings.HasPrefix(rel, ".git") || seen[rel] {
			continue
		}
		seen[rel] = true
		paths = append(paths, rel)
	}

	if len(paths) == 0 {
		// The blocked paths were not named; the only automatic repair left is a blanket chown.
		return u.sudoChown(u.repoDir)
	}

	if u.sudoChown(paths...) {
		return true
	}

	repaired := false
	for _, rel := range paths {
		abs := filepath.Join(u.repoDir, rel)
		for abs != u.repoDir {
			if os.Rename(abs, abs+".stale-"+stamp) == nil {
				u.logger.Info().Str("path", rel).Msg("selfupdate: Moved a blocked path aside; git will recreate it")
				repaired = true
				break
			}
			// The path itself cannot be renamed — its parent is the root-owned one. Walk up.
			abs = filepath.Dir(abs)
		}
	}
	return repaired
}

// sudoChown takes ownership of the given paths with passwordless sudo, which works only when the
// server's user has been granted NOPASSWD sudo. Reports whether the chown ran.
func (u *GitAutoUpdater) sudoChown(paths ...string) bool {
	args := append([]string{"-n", "chown", "-R", fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid())}, paths...)
	chown := exec.Command("sudo", args...)
	chown.Dir = u.repoDir
	if err := chown.Run(); err != nil {
		return false
	}
	u.logger.Info().Strs("paths", paths).Msg("selfupdate: Took ownership of the blocked paths with sudo")
	return true
}

// CheckForUpdate is the exported form, for the API's update check. An update here is a commit on
// the fork's repository — what the server pulls — and nothing else, so the check asks git and
// never a releases endpoint.
func (u *GitAutoUpdater) CheckForUpdate() (bool, error) {
	return u.checkForUpdate()
}

// CurrentGitUpdater returns the git updater the server started with, or nil when the server is not
// running from a checkout (a binary deployment has nothing to pull, and so nothing to ask).
func CurrentGitUpdater() *GitAutoUpdater {
	return gitUpdaterRef.Get()
}

// CheckPending fetches and reports what an update would change and whether the checkout is able to
// take it, without changing anything.
func (u *GitAutoUpdater) CheckPending() (behind bool, files []FileChange, blocked string, err error) {
	behind, err = u.checkForUpdate()
	if err != nil || !behind {
		return false, nil, "", err
	}
	ref := u.remoteRef()
	return true, u.diffFiles(ref), u.localWork(ref), nil
}

// UpdateNow is the manual "update backend": it fetches origin (the fork's repository) and, when the
// checkout is behind, pulls, builds and restarts in the background. It reports whether an update
// was started; the build and restart themselves happen after this returns.
func (u *GitAutoUpdater) UpdateNow() (started bool, files []FileChange, err error) {
	if !u.updating.CompareAndSwap(false, true) {
		return false, nil, fmt.Errorf("an update is already running")
	}
	behind, err := u.checkForUpdate()
	if err != nil {
		u.updating.Store(false)
		return false, nil, err
	}
	if !behind {
		u.updating.Store(false)
		return false, nil, nil
	}
	// Read before the background update moves the checkout, after which there is nothing left to diff.
	files = u.PendingChanges()
	go func() {
		defer u.updating.Store(false)
		u.runUpdate()
	}()
	return true, files, nil
}

// RemoteCommit returns the commit the checkout is behind, without fetching — the ref the update
// check names. Empty when the last fetch left nothing to compare against.
func (u *GitAutoUpdater) RemoteCommit() (string, error) {
	branch, err := u.git("rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	branch = strings.TrimSpace(branch)
	if branch == "" || branch == "HEAD" {
		branch = "main"
	}
	remote, err := u.git("rev-parse", fmt.Sprintf("%s/%s", gitUpdateRemote, branch))
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(remote), nil
}

// update pulls, builds, and replaces the running process with what it built.
func (u *GitAutoUpdater) update() {
	if !u.updating.CompareAndSwap(false, true) {
		return
	}
	defer u.updating.Store(false)
	u.runUpdate()
}

// runUpdate is the update itself; the caller holds the updating flag.
func (u *GitAutoUpdater) runUpdate() {
	defer util.HandlePanicInModuleThen("updater/gitAutoUpdate/update", func() {
		u.logger.Error().Msg("selfupdate: The update stopped unexpectedly — the running version is untouched")
	})

	u.progress(5, "Fetching the latest commits from origin")
	// An update always lands: local work is saved under refs/seanime-backup/ and the checkout is
	// moved onto the fork's latest commit, so nothing is left behind and nothing is lost.
	remoteRef := u.remoteRef()
	if _, err := u.git("fetch", gitUpdateRemote); err != nil {
		u.fail("fetching the fork", err, "")
		return
	}
	u.progress(15, "Reviewing local changes and update contents")
	if note := u.localWork(remoteRef); note != "" {
		u.logger.Warn().Msg("selfupdate: " + note)
		u.notify("Saving local work to a backup ref before updating")
		u.progress(20, "Backing up local changes")
	}

	stats := u.diffStats(remoteRef)

	// Record what the running binary was built from before the checkout moves, so a failed build
	// still counts as "update available" afterwards.
	if u.builtCommit() == "" {
		u.setBuiltCommit(u.headCommit())
	}
	remoteHead, _ := u.git("rev-parse", remoteRef)
	// Also reset when HEAD already matches but the tree or index is dirty (an earlier attempt can
	// move HEAD and then fail halfway, leaving staged leftovers).
	dirty, _ := u.git("status", "--porcelain", "--untracked-files=no")
	if strings.TrimSpace(remoteHead) != u.headCommit() || strings.TrimSpace(dirty) != "" {
		u.progress(25, "Moving the checkout to the latest commit")
		if err := u.shelve(remoteRef); err != nil {
			u.fail("moving the checkout to the fork's latest commit (git reset --hard)", err, "")
			return
		}
	}

	// The tree has to stay clean through the whole update; the merge is the step most able to have
	// left something behind.
	u.progress(30, "Verifying the updated checkout")
	status, err := u.git("status", "--porcelain", "--untracked-files=no")
	if err != nil || strings.TrimSpace(status) != "" {
		u.fail("verifying the checkout after the reset", fmt.Errorf("tracked files are still modified: %s %v", strings.TrimSpace(status), err), "")
		return
	}

	u.notify("A new version was found — building it now…")
	u.progress(38, "Preparing the build")
	u.logger.Info().Msg("selfupdate: Building the new version while the current one keeps running")

	// The build is the web interface first and the server second, which is what the embed in the
	// binary needs. A failed build writes no binary — go build only replaces what it compiled — so
	// the running version is untouched by it. The script is run through its shell (bash on the NAS,
	// powershell on Windows) so the platform's own script handles the platform's own paths, and the
	// command runs attached to a console-independent process on Windows so a GUI binary does not
	// flash a shell window for every step of the build.
	build, err := buildCommand(u.repoDir)
	if err != nil {
		u.fail("preparing the build", err, "")
		return
	}
	u.notify("Build started: " + strings.Join(build.Args, " "))
	u.progress(42, "Building the web assets and backend")
	started := time.Now()
	build.Dir = u.repoDir
	var buildOut bytes.Buffer
	build.Stdout = io.MultiWriter(os.Stdout, &buildOut)
	build.Stderr = io.MultiWriter(os.Stderr, &buildOut)
	if err := build.Run(); err != nil {
		u.fail(fmt.Sprintf("running the build script (%s, failed after %s)", strings.Join(build.Args, " "), time.Since(started).Round(time.Millisecond)), err, buildOut.String())
		return
	}

	u.progress(70, "Build finished; validating the new binary")
	exePath := getExePath()
	if exePath == "" {
		u.fail("locating the running binary", fmt.Errorf("could not determine the running executable's path"), "")
		return
	}
	// The mtime check guards against a build that produced no binary. But the build does not write
	// to the running binary's path — it writes the repo's output (seanime_exe / seanime.exe in the
	// checkout) — so the check is made against the file the build actually produced. When the
	// running binary is that same file (started as ./seanime_exe from the checkout) the paths
	// agree; when it is not, the freshly built binary is carried to the running binary's path
	// before the swap instead of the update being thrown away.
	builtPath := filepath.Join(u.repoDir, builtBinaryName())
	info, err := os.Stat(builtPath)
	if err != nil {
		u.fail("looking for the built binary at "+builtPath, err, buildOut.String())
		return
	}
	if time.Since(info.ModTime()) > 10*time.Minute {
		u.fail("checking the built binary", fmt.Errorf("%s was last written %s ago, so the build did not produce a new binary", builtPath, time.Since(info.ModTime()).Round(time.Second)), buildOut.String())
		return
	}
	u.progress(78, "Running the new binary startup check")
	if err := smokeTestBinary(builtPath); err != nil {
		u.fail("start-up check of the new binary", err, "")
		return
	}
	u.logger.Info().Msg("selfupdate: The new version started and answered — switching to it")

	u.progress(86, "Preparing the updated binary for restart")
	if sameFile, err := sameFilePath(exePath, builtPath); err == nil && !sameFile {
		// The server was started from somewhere other than the checkout's output (a copy in
		// /usr/local/bin, say). The checkout's binary is the new version; the running one is the
		// old. Move the new over the old, which is what "swap" has to mean here.
		if err := copyBinary(builtPath, exePath); err != nil {
			u.fail("copying the new binary over "+exePath, err, "")
			return
		}
		u.logger.Info().Str("from", builtPath).Str("to", exePath).Msg("selfupdate: New binary moved to the running binary's location")
	}

	// What the update was, written down before the process is replaced underneath itself: the
	// commit's message and its description, so the client can say what arrived rather than only
	// that something did. The file survives the restart, which is the point — a client that was
	// closed while the update happened reads it the next time it signs in.
	u.setBuiltCommit(u.headCommit())
	u.progress(92, "Saving the update summary")
	u.writeUpdateNotice(stats)

	u.notify("Update built — restarting now…")
	u.progress(96, "Build complete; restarting the server")
	if u.wsEventManager != nil {
		u.wsEventManager.SendEvent(events.ServerGoingDown, map[string]string{"reason": "a backend update"})
	}
	u.logger.Info().Str("exe", exePath).Msg("selfupdate: Restarting with the new version")

	// Long enough for the message to reach the client, short enough that the restart is felt as
	// the reload it is. The client reconnects on its own.
	time.Sleep(gitUpdateRestartDelay)

	// The running process is replaced in place: same pid, same working directory, same
	// environment, new binary — which is what "restart" has to mean when nothing outside is
	// watching this process.
	args := os.Args
	if len(args) == 0 {
		args = []string{exePath}
	} else {
		args[0] = exePath
	}
	if err := syscallExec(exePath, args, os.Environ()); err != nil {
		u.logger.Error().Err(err).Msg("selfupdate: Could not restart with the new version")
	}
}

// UpdateNotice is what an update was, shown to the client after it signs in.
type UpdateNotice struct {
	// Title is the commit's subject line; Description is its body.
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	Commit      string `json:"commit,omitempty"`
	UpdatedAt   string `json:"updatedAt"`
	// The size of the update: files touched and lines added and removed.
	FilesChanged int `json:"filesChanged"`
	Insertions   int `json:"insertions"`
	Deletions    int `json:"deletions"`
}

type updateStats struct{ files, insertions, deletions int }

// FileChange is one file an update touches and how many lines it adds and removes.
type FileChange struct {
	Path       string `json:"path"`
	Insertions int    `json:"insertions"`
	Deletions  int    `json:"deletions"`
}

// remoteRef is the fork's ref for the branch being tracked.
func (u *GitAutoUpdater) remoteRef() string {
	branch, err := u.git("rev-parse", "--abbrev-ref", "HEAD")
	branch = strings.TrimSpace(branch)
	if err != nil || branch == "" || branch == "HEAD" {
		branch = "main"
	}
	return fmt.Sprintf("%s/%s", gitUpdateRemote, branch)
}

// PendingChanges lists the files the update would change, read from the last fetch.
func (u *GitAutoUpdater) PendingChanges() []FileChange {
	return u.diffFiles(u.remoteRef())
}

func (u *GitAutoUpdater) diffFiles(remoteRef string) []FileChange {
	out, err := u.git("diff", "--numstat", u.diffBase(), remoteRef)
	if err != nil {
		return nil
	}
	var files []FileChange
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		parts := strings.SplitN(strings.TrimSpace(line), "\t", 3)
		if len(parts) != 3 {
			continue
		}
		// Binary files report "-" for both counts.
		ins, _ := strconv.Atoi(parts[0])
		del, _ := strconv.Atoi(parts[1])
		files = append(files, FileChange{Path: parts[2], Insertions: ins, Deletions: del})
	}
	return files
}

var shortstatRe = regexp.MustCompile(`(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?`)

// diffStats is what merging the remote ref would change, read before the merge.
func (u *GitAutoUpdater) diffStats(remoteRef string) updateStats {
	out, err := u.git("diff", "--shortstat", u.diffBase(), remoteRef)
	if err != nil {
		return updateStats{}
	}
	m := shortstatRe.FindStringSubmatch(out)
	if m == nil {
		return updateStats{}
	}
	var s updateStats
	s.files, _ = strconv.Atoi(m[1])
	s.insertions, _ = strconv.Atoi(m[2])
	s.deletions, _ = strconv.Atoi(m[3])
	return s
}

// UpdateNoticeFileName is where the notice lives: in the data directory, because the notice has to
// survive the restart that the updater itself performs.
const UpdateNoticeFileName = "update-notice.json"

func (u *GitAutoUpdater) writeUpdateNotice(stats updateStats) {
	if u.appDataDir == "" {
		return
	}

	// The commit's subject and body, read from what was just pulled — `git log -1` on the new HEAD.
	out, err := u.git("log", "-1", "--format=%s%n%n%b")
	if err != nil {
		u.logger.Warn().Err(err).Msg("selfupdate: Could not read the new commit's message")
	}

	title, description := "", ""
	if lines := strings.SplitN(strings.TrimSpace(out), "\n", 2); len(lines) > 0 {
		title = strings.TrimSpace(lines[0])
		if len(lines) > 1 {
			description = strings.TrimSpace(lines[1])
		}
	}

	commit, _ := u.git("rev-parse", "HEAD")
	commit = strings.TrimSpace(commit)
	if len(commit) > 8 {
		commit = commit[:8]
	}

	notice := UpdateNotice{
		Title:       title,
		Description: description,
		Commit:      commit,
		UpdatedAt:   time.Now().Format(time.RFC3339),

		FilesChanged: stats.files,
		Insertions:   stats.insertions,
		Deletions:    stats.deletions,
	}

	data, err := json.Marshal(notice)
	if err != nil {
		return
	}
	if err := util.WriteFileCrashSafe(filepath.Join(u.appDataDir, UpdateNoticeFileName), data, 0o644); err != nil {
		u.logger.Warn().Err(err).Msg("selfupdate: Could not write the update notice")
		return
	}

	if u.wsEventManager != nil {
		u.wsEventManager.SendEvent(events.UpdateNoticeAvailable, nil)
	}
}

// notify tells every client what the updater is doing, best-effort. The swap happens regardless.
func (u *GitAutoUpdater) notify(message string) {
	if u.wsEventManager != nil {
		u.wsEventManager.SendEvent(events.InfoToast, message)
	}
}

func (u *GitAutoUpdater) progress(percent int, step string) {
	if u.wsEventManager != nil {
		u.wsEventManager.SendEvent(events.UpdateBackendProgress, struct {
			Percent int    `json:"percent"`
			Step    string `json:"step"`
		}{Percent: percent, Step: step})
	}
}

// fail reports where an update stopped and why: to the server log, to a toast, and as a log block
// (step, error, and the tail of the build output) for the settings page.
func (u *GitAutoUpdater) fail(step string, err error, output string) {
	tail := strings.Split(strings.TrimSpace(output), "\n")
	if len(tail) > 40 {
		tail = tail[len(tail)-40:]
	}
	detail := strings.TrimSpace(strings.Join(tail, "\n"))
	u.logger.Error().Err(err).Str("step", step).Msg("selfupdate: The update failed — the running version keeps serving")
	msg := fmt.Sprintf("Update failed while %s\nReason: %v", step, err)
	if detail != "" {
		msg += "\nLast build output:\n" + detail
	}
	u.notify(fmt.Sprintf("The update failed while %s: %v", step, err))
	if u.wsEventManager != nil {
		u.wsEventManager.SendEvent(events.UpdateBackendLog, msg)
	}
}

// git runs one command inside the checkout.
func (u *GitAutoUpdater) git(args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = u.repoDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

// syscallExec is the process replacement, on its own function so the platforms that do not have it
// fail to compile here rather than everywhere.
func syscallExec(path string, args []string, env []string) error {
	return syscallExecImpl(path, args, env)
}

// builtBinaryName is the file the build scripts leave the new server binary at, inside the
// checkout. build-all.sh (NAS, Linux) writes seanime_exe; build-all-desktop.ps1 (Windows) writes
// seanime.exe.
func builtBinaryName() string {
	if runtime.GOOS == "windows" {
		return "seanime.exe"
	}
	return "seanime_exe"
}

// buildCommand returns the command that runs the checkout's build script. Each platform runs its
// own script: bash runs build-all.sh on the NAS, and on Windows powershell runs the desktop
// script. The Windows command is created through util.NewCmd so a GUI binary does not flash a
// console window for the duration of the build.
// smokeTestBinary starts the freshly built binary in isolation — a throwaway data directory, a
// loopback-only free port — and waits for it to answer HTTP. The running server is only replaced
// once the new one has proven it can start; the test process is always killed afterwards and the
// throwaway directory removed, so nothing of the real installation is touched.
func smokeTestBinary(binPath string) error {
	dataDir, err := os.MkdirTemp("", "seanime-smoketest-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dataDir)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, binPath,
		"-datadir", dataDir, "-host", "127.0.0.1", "-port", fmt.Sprint(port), "-disable-password")
	cmd.Env = append(os.Environ(), "SEANIME_AUTO_UPDATE=0")
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("could not launch the new binary: %w", err)
	}
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	defer func() {
		_ = cmd.Process.Kill()
		select {
		case <-exited:
		case <-time.After(5 * time.Second):
		}
	}()

	client := &http.Client{Timeout: 3 * time.Second}
	url := fmt.Sprintf("http://127.0.0.1:%d/api/v1/status", port)
	for {
		select {
		case err := <-exited:
			exited <- err
			tail := out.String()
			if len(tail) > 600 {
				tail = tail[len(tail)-600:]
			}
			return fmt.Errorf("the new binary exited during start-up (%v): %s", err, tail)
		case <-ctx.Done():
			return fmt.Errorf("the new binary did not answer within 90s")
		case <-time.After(500 * time.Millisecond):
		}
		if resp, err := client.Get(url); err == nil {
			_ = resp.Body.Close()
			return nil
		}
	}
}

func buildCommand(repoDir string) (*exec.Cmd, error) {
	if runtime.GOOS == "windows" {
		ps, err := exec.LookPath("powershell")
		if err != nil {
			return nil, fmt.Errorf("powershell not found: %w", err)
		}
		return util.NewCmd(ps, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", filepath.Join(repoDir, "build-all-desktop.ps1")), nil
	}
	bash, err := exec.LookPath("bash")
	if err != nil {
		return nil, fmt.Errorf("bash not found: %w", err)
	}
	return exec.Command(bash, "build-all.sh"), nil
}

// sameFilePath reports whether two paths name the same file.
func sameFilePath(a, b string) (bool, error) {
	if filepath.Clean(a) == filepath.Clean(b) {
		return true, nil
	}
	ai, err := os.Stat(a)
	if err != nil {
		return false, err
	}
	bi, err := os.Stat(b)
	if err != nil {
		return false, err
	}
	return os.SameFile(ai, bi), nil
}

// copyBinary copies the freshly built binary over the running one. On Linux the running image is
// fine with this — the file's contents are replaced, but the kernel keeps the mapped inode of the
// old file alive until the process exits, which is exactly how long it needs to. On Windows the
// running image's file cannot be opened for writing, so the old binary is renamed aside first —
// a running executable can be renamed even though it cannot be overwritten — and the new one
// takes its place; the renamed copy is removed on the next start.
func copyBinary(src, dst string) error {
	if runtime.GOOS == "windows" {
		old := dst + ".old"
		_ = os.Remove(old)
		if err := os.Rename(dst, old); err != nil {
			return fmt.Errorf("could not set aside the running binary: %w", err)
		}
		if err := copyFile(src, dst); err != nil {
			// Put the running binary back rather than leave the path empty.
			if rbErr := os.Rename(old, dst); rbErr != nil {
				return fmt.Errorf("copy failed (%v) and the old binary could not be restored: %w", err, rbErr)
			}
			return err
		}
		if err := os.Chmod(dst, 0o755); err != nil {
			return err
		}
		return nil
	}
	if err := copyFile(src, dst+".tmp"); err != nil {
		_ = os.Remove(dst + ".tmp")
		return err
	}
	if err := os.Chmod(dst+".tmp", 0o755); err != nil {
		_ = os.Remove(dst + ".tmp")
		return err
	}
	// Keep the previous binary as a manual rollback, then swap atomically so a crash mid-copy
	// can never leave a half-written executable at the running path.
	_ = copyFile(dst, dst+".bak")
	if err := os.Rename(dst+".tmp", dst); err != nil {
		_ = os.Remove(dst + ".tmp")
		return err
	}
	return nil
}
