package updater

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"seanime/internal/util"

	"github.com/rs/zerolog"
)

// The anime themes auto-puller.
//
// The theme marketplace is its own git checkout (the seanime-themes repo) that the server serves
// straight off disk. Nothing ever pulled it, so a theme pushed to the repo only reached the server
// when someone logged in and ran `git pull` by hand. This keeps it current on its own.
//
// Themes are plain files, so unlike the server's own updater there is nothing to build and no
// restart: a fast-forward is the whole update. Files git rewrites get a fresh mtime, which is what
// sharedthemes.Refresh looks at, so installed copies of a changed theme follow on their next request.
//
// The same rules as the server updater:
//   - Only `origin` is ever named.
//   - Local work is never destroyed: a tree with uncommitted changes to tracked files, or local
//     commits the remote doesn't have, is skipped and logged. An update is a fast-forward, nothing else.
//
// SEANIME_THEMES_AUTO_UPDATE=0 turns it off.

const (
	themesUpdateInterval   = 5 * time.Minute
	themesUpdateFirstDelay = 30 * time.Second
)

type themesRepo struct {
	logger *zerolog.Logger
	dir    string
	// lastSkip is the reason the previous check skipped, so a repo that stays dirty logs once, not
	// every five minutes.
	lastSkip string
}

// StartThemesAutoUpdate pulls every theme checkout among dirs (the configured marketplace dir and
// the seanime-themes folder inside the server's own checkout) every few minutes. Dirs that are not
// git checkouts are ignored.
func StartThemesAutoUpdate(logger *zerolog.Logger, dirs ...string) {
	if v := os.Getenv("SEANIME_THEMES_AUTO_UPDATE"); v == "0" || strings.EqualFold(v, "false") {
		logger.Info().Msg("themes-update: Disabled (SEANIME_THEMES_AUTO_UPDATE=0)")
		return
	}

	var repos []*themesRepo
	seen := map[string]bool{}
	for _, d := range dirs {
		if d == "" {
			continue
		}
		abs, err := filepath.Abs(d)
		if err != nil {
			continue
		}
		if real, err := filepath.EvalSymlinks(abs); err == nil {
			abs = real
		}
		key := strings.ToLower(abs)
		if seen[key] {
			continue
		}
		seen[key] = true
		if _, err := os.Stat(filepath.Join(abs, ".git")); err != nil {
			continue
		}
		repos = append(repos, &themesRepo{logger: logger, dir: abs})
	}
	if len(repos) == 0 {
		logger.Info().Msg("themes-update: No theme git checkout found, auto-update is off")
		return
	}

	for _, r := range repos {
		logger.Info().Str("dir", r.dir).Dur("interval", themesUpdateInterval).Msg("themes-update: Watching theme repo for updates")
		go r.loop()
	}
}

func (r *themesRepo) loop() {
	defer util.HandlePanicInModuleThen("updater/themesAutoUpdate/loop", func() {})
	time.Sleep(themesUpdateFirstDelay)
	for {
		if pulled, err := r.update(); err != nil {
			r.logger.Warn().Err(err).Str("dir", r.dir).Msg("themes-update: Check failed")
		} else if pulled != "" {
			r.logger.Info().Str("dir", r.dir).Str("range", pulled).Msg("themes-update: Pulled new themes")
		}
		time.Sleep(themesUpdateInterval)
	}
}

// update fetches origin and fast-forwards to it when that is safe. It returns the pulled range
// ("abc123..def456") when it moved, or "" when there was nothing to do or it skipped.
func (r *themesRepo) update() (string, error) {
	clearStaleThemesIndexLock(r.dir)

	remoteRef, err := r.remoteRef()
	if err != nil {
		return "", err
	}
	if _, err := r.git("fetch", "--quiet", gitUpdateRemote); err != nil {
		return "", err
	}

	head, err := r.rev("HEAD")
	if err != nil {
		return "", err
	}
	remote, err := r.rev(remoteRef)
	if err != nil {
		return "", err
	}
	if head == remote {
		r.lastSkip = ""
		return "", nil
	}

	// Local commits the remote doesn't have: a fast-forward is impossible, and resolving it is a
	// person's job.
	if _, err := r.git("merge-base", "--is-ancestor", "HEAD", remoteRef); err != nil {
		r.skip("the theme repo has local commits that aren't on " + remoteRef)
		return "", nil
	}
	// Uncommitted edits to tracked files: never overwritten.
	if out, err := r.git("status", "--porcelain", "--untracked-files=no"); err != nil {
		return "", err
	} else if strings.TrimSpace(out) != "" {
		r.skip("the theme repo has uncommitted changes")
		return "", nil
	}

	if _, err := r.gitTimeout(5*time.Minute, "merge", "--ff-only", "--quiet", remoteRef); err != nil {
		return "", err
	}
	r.lastSkip = ""
	return shortRev(head) + ".." + shortRev(remote), nil
}

func (r *themesRepo) skip(reason string) {
	if reason == r.lastSkip {
		return
	}
	r.lastSkip = reason
	r.logger.Warn().Str("dir", r.dir).Msgf("themes-update: Not updating: %s", reason)
}

// remoteRef is origin's copy of the current branch's upstream, or origin/<current branch>.
func (r *themesRepo) remoteRef() (string, error) {
	if out, err := r.git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"); err == nil {
		ref := strings.TrimSpace(out)
		if strings.HasPrefix(ref, gitUpdateRemote+"/") {
			return ref, nil
		}
	}
	out, err := r.git("rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	branch := strings.TrimSpace(out)
	if branch == "" || branch == "HEAD" {
		return "", fmt.Errorf("the theme repo is not on a branch (detached HEAD)")
	}
	return gitUpdateRemote + "/" + branch, nil
}

func (r *themesRepo) rev(ref string) (string, error) {
	out, err := r.git("rev-parse", "--verify", ref+"^{commit}")
	return strings.TrimSpace(out), err
}

func (r *themesRepo) git(args ...string) (string, error) {
	return r.gitTimeout(2*time.Minute, args...)
}

func (r *themesRepo) gitTimeout(limit time.Duration, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), limit)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", gitArgs(r.dir, args...)...)
	cmd.Dir = r.dir
	// Never wait on a credential prompt nobody will answer.
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", explainGitError(fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out))), r.dir)
	}
	return string(out), nil
}

func shortRev(rev string) string {
	if len(rev) > 7 {
		return rev[:7]
	}
	return rev
}

// clearStaleThemesIndexLock removes an index.lock left by a git process that was killed (the
// 2-minute timeout, a crash). Only an old lock is removed, so a git run by hand isn't disturbed.
func clearStaleThemesIndexLock(dir string) {
	lock := filepath.Join(dir, ".git", "index.lock")
	if info, err := os.Stat(lock); err == nil && time.Since(info.ModTime()) > 10*time.Minute {
		_ = os.Remove(lock)
	}
}
