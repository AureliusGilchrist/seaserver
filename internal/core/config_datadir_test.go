package core

import (
	"os"
	"testing"
)

// TestDataDirFlagWinsOverInheritedEnv: a process started with -datadir (the self-updater smoke
// test) inherits its parent SEANIME_DATA_DIR. It must not keep it, or its cache, logs and
// extensions folders expand to the parent ones.
func TestDataDirFlagWinsOverInheritedEnv(t *testing.T) {
	t.Setenv("SEANIME_DATA_DIR", "/parent/data")
	if err := setDataDirEnv("/tmp/smoketest"); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("SEANIME_DATA_DIR"); got != "/tmp/smoketest" {
		t.Fatalf("SEANIME_DATA_DIR = %q", got)
	}
}
