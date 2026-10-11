package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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

// gitUpdaterRef holds the updater the server started with, so the API can ask it whether the
// checkout is behind the fork's latest commit — the question the update check is, now that updates
// are a commit and not a release.
var gitUpdaterRef = util.NewRef[*GitAutoUpdater](nil)

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
	gitUpdaterRef.Set(u)

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

	// The working tree has to stay clean through the whole update — the check above ran before the
	// merge, and the merge itself is the step most able to have left something behind (a pull that
	// pauses for a credential prompt, for instance, can leave a partially-written index behind).
	status, err := u.git("status", "--porcelain")
	if err != nil || strings.TrimSpace(status) != "" {
		u.logger.Warn().Msg("selfupdate: The merge left the working tree dirty, not updating")
		return
	}

	u.notify("A new version was found — building it now…")
	u.logger.Info().Msg("selfupdate: Building the new version while the current one keeps running")

	// The build is the web interface first and the server second, which is what the embed in the
	// binary needs. A failed build writes no binary — go build only replaces what it compiled — so
	// the running version is untouched by it. The script is run through its shell (bash on the NAS,
	// powershell on Windows) so the platform's own script handles the platform's own paths, and the
	// command runs attached to a console-independent process on Windows so a GUI binary does not
	// flash a shell window for every step of the build.
	build, err := buildCommand(u.repoDir)
	if err != nil {
		u.logger.Error().Err(err).Msg("selfupdate: No shell available to run the build — the running version keeps serving")
		u.notify("The update could not be built — still running the current version")
		return
	}
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
	// The mtime check guards against a build that produced no binary. But the build does not write
	// to the running binary's path — it writes the repo's output (seanime_exe / seanime.exe in the
	// checkout) — so the check is made against the file the build actually produced. When the
	// running binary is that same file (started as ./seanime_exe from the checkout) the paths
	// agree; when it is not, the freshly built binary is carried to the running binary's path
	// before the swap instead of the update being thrown away.
	builtPath := filepath.Join(u.repoDir, builtBinaryName())
	info, err := os.Stat(builtPath)
	if err != nil {
		u.logger.Error().Err(err).Str("built", builtPath).Msg("selfupdate: The build did not produce a binary, not updating")
		return
	}
	if time.Since(info.ModTime()) > 10*time.Minute {
		// The binary on disk is not the one this build produced — a build that did not touch it is
		// not an update.
		u.logger.Warn().Msg("selfupdate: The build did not produce a new binary, not updating")
		return
	}
	if sameFile, err := sameFilePath(exePath, builtPath); err == nil && !sameFile {
		// The server was started from somewhere other than the checkout's output (a copy in
		// /usr/local/bin, say). The checkout's binary is the new version; the running one is the
		// old. Move the new over the old, which is what "swap" has to mean here.
		if err := copyBinary(builtPath, exePath); err != nil {
			u.logger.Error().Err(err).Msg("selfupdate: Could not place the new binary, not updating")
			return
		}
		u.logger.Info().Str("from", builtPath).Str("to", exePath).Msg("selfupdate: New binary moved to the running binary's location")
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
	if err := copyFile(src, dst); err != nil {
		return err
	}
	return os.Chmod(dst, 0o755)
}
