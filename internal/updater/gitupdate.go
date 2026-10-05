package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

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
// Checked every fifteen minutes, starting fifteen minutes after the server comes up — a deployment
// is usually synced before it is started, so the first check would only be asking a question
// somebody just answered. SEANIME_AUTO_UPDATE=0 turns it off.

const (
	gitUpdateInterval = 15 * time.Minute
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
	updating   bool
}

// StartGitAutoUpdate starts the fork's auto-updater when the server is running from inside its own
// git checkout — the NAS deployment case. A binary that is not in a checkout has nothing to pull,
// so the updater is simply not started there.
func StartGitAutoUpdate(logger *zerolog.Logger, wsEventManager *events.WSEventManager, appDataDir string) {
	if disabled := os.Getenv("SEANIME_AUTO_UPDATE"); disabled == "0" || strings.EqualFold(disabled, "false") {
		logger.Info().Msg("selfupdate: Auto-update disabled (SEANIME_AUTO_UPDATE=0)")
		return
	}

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

	logger.Info().Str("dir", repoDir).Dur("interval", gitUpdateInterval).
		Msg("selfupdate: Watching the fork's repository for new commits")

	go u.loop()
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

func (u *GitAutoUpdater) loop() {
	defer util.HandlePanicInModuleThen("updater/gitAutoUpdate/loop", func() {})

	ticker := time.NewTicker(gitUpdateInterval)
	defer ticker.Stop()

	for range ticker.C {
		if u.updating {
			continue
		}
		if behind, err := u.checkForUpdate(); err != nil {
			u.logger.Warn().Err(err).Msg("selfupdate: Could not check for an update")
		} else if behind {
			u.update()
		}
	}
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

	local, err := u.git("rev-parse", "HEAD")
	if err != nil {
		return false, err
	}
	remote, err := u.git("rev-parse", fmt.Sprintf("%s/%s", gitUpdateRemote, branch))
	if err != nil {
		return false, err
	}

	behind := strings.TrimSpace(local) != strings.TrimSpace(remote)
	if behind {
		u.logger.Info().
			Str("local", strings.TrimSpace(local)[:min(8, len(local))]).
			Str("remote", strings.TrimSpace(remote)[:min(8, len(remote))]).
			Msg("selfupdate: The fork has a new commit")
	}
	return behind, nil
}

// update pulls, builds, and replaces the running process with what it built.
func (u *GitAutoUpdater) update() {
	u.updating = true
	defer func() { u.updating = false }()

	defer util.HandlePanicInModuleThen("updater/gitAutoUpdate/update", func() {
		u.logger.Error().Msg("selfupdate: The update stopped unexpectedly — the running version is untouched")
	})

	// Local work is never destroyed. A tree with changes in it is somebody's; an update only ever
	// fast-forwards a clean one, and anything else is left for the person to deal with.
	if status, err := u.git("status", "--porcelain"); err != nil || strings.TrimSpace(status) != "" {
		u.logger.Warn().Msg("selfupdate: The working tree has local changes, not updating")
		return
	}

	branch, err := u.git("rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return
	}
	remoteRef := fmt.Sprintf("%s/%s", gitUpdateRemote, strings.TrimSpace(branch))

	if _, err := u.git("merge", "--ff-only", remoteRef); err != nil {
		// A checkout that cannot fast-forward has local commits — not something to discard, so
		// the update stops here rather than forcing its way through.
		u.logger.Warn().Err(err).Msg("selfupdate: Could not fast-forward to the fork's latest commit, not updating")
		return
	}

	u.notify("A new version was found — building it now…")
	u.logger.Info().Msg("selfupdate: Building the new version while the current one keeps running")

	// The build is the web interface first and the server second, which is what the embed in the
	// binary needs. A failed build writes no binary — go build only replaces what it compiled — so
	// the running version is untouched by it.
	build := exec.Command("bash", "build-all.sh")
	build.Dir = u.repoDir
	build.Stdout = os.Stdout
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		u.logger.Error().Err(err).Msg("selfupdate: The build failed — the running version keeps serving")
		u.notify("The update could not be built — still running the current version")
		return
	}

	exePath := getExePath()
	if exePath == "" {
		u.logger.Error().Msg("selfupdate: Could not locate the running binary, not updating")
		return
	}
	info, err := os.Stat(exePath)
	if err != nil || time.Since(info.ModTime()) > 10*time.Minute {
		// The binary on disk is not the one this build produced — a build that did not touch it is
		// not an update.
		u.logger.Warn().Msg("selfupdate: The build did not produce a new binary, not updating")
		return
	}

	// What the update was, written down before the process is replaced underneath itself: the
	// commit's message and its description, so the client can say what arrived rather than only
	// that something did. The file survives the restart, which is the point — a client that was
	// closed while the update happened reads it the next time it signs in.
	u.writeUpdateNotice()

	u.notify("Update built — restarting now…")
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
}

// UpdateNoticeFileName is where the notice lives: in the data directory, because the notice has to
// survive the restart that the updater itself performs.
const UpdateNoticeFileName = "update-notice.json"

func (u *GitAutoUpdater) writeUpdateNotice() {
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
