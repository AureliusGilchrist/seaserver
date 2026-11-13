package updater

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rs/zerolog"
)

func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func commitFile(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, "add", name)
	runGit(t, dir, "commit", "-q", "-m", "update "+name)
}

// setupThemesRepos makes a bare origin, an "author" clone that pushes to it, and the "server"
// clone the updater works on.
func setupThemesRepos(t *testing.T) (author, server string) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	root := t.TempDir()
	origin := filepath.Join(root, "origin.git")
	author = filepath.Join(root, "author")
	server = filepath.Join(root, "server")
	runGit(t, root, "init", "-q", "--bare", "-b", "main", origin)
	runGit(t, root, "clone", "-q", origin, author)
	runGit(t, author, "checkout", "-q", "-b", "main")
	commitFile(t, author, "index.json", "v1")
	runGit(t, author, "push", "-q", "-u", "origin", "main")
	runGit(t, root, "clone", "-q", origin, server)
	return author, server
}

func TestThemesUpdateFastForwards(t *testing.T) {
	author, server := setupThemesRepos(t)
	logger := zerolog.Nop()
	r := &themesRepo{logger: &logger, dir: server}

	if pulled, err := r.update(); err != nil || pulled != "" {
		t.Fatalf("up to date: pulled=%q err=%v", pulled, err)
	}

	commitFile(t, author, "index.json", "v2")
	runGit(t, author, "push", "-q")

	pulled, err := r.update()
	if err != nil || pulled == "" {
		t.Fatalf("expected a pull: pulled=%q err=%v", pulled, err)
	}
	if b, _ := os.ReadFile(filepath.Join(server, "index.json")); string(b) != "v2" {
		t.Fatalf("index.json = %q, want v2", b)
	}
}

func TestThemesUpdateKeepsLocalEdits(t *testing.T) {
	author, server := setupThemesRepos(t)
	logger := zerolog.Nop()
	r := &themesRepo{logger: &logger, dir: server}

	commitFile(t, author, "index.json", "v2")
	runGit(t, author, "push", "-q")
	if err := os.WriteFile(filepath.Join(server, "index.json"), []byte("local edit"), 0o644); err != nil {
		t.Fatal(err)
	}

	if pulled, err := r.update(); err != nil || pulled != "" {
		t.Fatalf("dirty tree must be skipped: pulled=%q err=%v", pulled, err)
	}
	if b, _ := os.ReadFile(filepath.Join(server, "index.json")); string(b) != "local edit" {
		t.Fatalf("local edit was overwritten: %q", b)
	}
}

func TestThemesUpdateKeepsLocalCommits(t *testing.T) {
	author, server := setupThemesRepos(t)
	logger := zerolog.Nop()
	r := &themesRepo{logger: &logger, dir: server}

	commitFile(t, author, "index.json", "v2")
	runGit(t, author, "push", "-q")
	commitFile(t, server, "local.txt", "mine")
	head := runGit(t, server, "rev-parse", "HEAD")

	if pulled, err := r.update(); err != nil || pulled != "" {
		t.Fatalf("diverged repo must be skipped: pulled=%q err=%v", pulled, err)
	}
	if now := runGit(t, server, "rev-parse", "HEAD"); now != head {
		t.Fatalf("HEAD moved from %s to %s", head, now)
	}
}
