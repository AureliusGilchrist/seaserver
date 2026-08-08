package enqueuefuture

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

func testRepository(t *testing.T) *Repository {
	t.Helper()
	logger := zerolog.Nop()
	return &Repository{logger: &logger, dataDir: t.TempDir()}
}

func TestProgressRoundTrip(t *testing.T) {
	r := testRepository(t)

	original := &RunProgress{
		RootMediaID: 1234,
		RootTitle:   "Some Show",
		ProfileID:   2,
		Seen:        []int{1234, 5, 6},
		Depths:      map[int]int{1234: 0, 5: 1, 6: 1},
		RootWalked:  true,
		Discovered:  12,
		Prepared:    7,
		Failed:      1,
		Skipped:     3,
		StartedAt:   time.Now().Truncate(time.Second),
	}

	r.saveProgress(original)

	restored := r.loadProgress()
	if restored == nil {
		t.Fatal("nothing was restored")
	}
	if restored.RootMediaID != 1234 || restored.RootTitle != "Some Show" || restored.ProfileID != 2 {
		t.Errorf("run identity lost: %+v", restored)
	}
	if !restored.RootWalked {
		t.Error("RootWalked lost — a resumed run would walk the root a second time")
	}
	if len(restored.Seen) != 3 {
		t.Errorf("got %d seen ids, want 3", len(restored.Seen))
	}
	if restored.Depths[5] != 1 || restored.Depths[1234] != 0 {
		t.Errorf("depths lost: %+v", restored.Depths)
	}
	if restored.Prepared != 7 || restored.Discovered != 12 || restored.Failed != 1 || restored.Skipped != 3 {
		t.Errorf("counters lost: %+v", restored)
	}
}

func TestLoadProgressWithNothingSaved(t *testing.T) {
	r := testRepository(t)
	if got := r.loadProgress(); got != nil {
		t.Errorf("expected nothing to resume, got %+v", got)
	}
	if r.CanResume() {
		t.Error("CanResume said yes with no progress file")
	}
}

func TestClearProgress(t *testing.T) {
	r := testRepository(t)
	r.saveProgress(&RunProgress{RootMediaID: 1, Depths: map[int]int{}})

	if !r.CanResume() {
		t.Fatal("a saved run should be resumable")
	}

	r.clearProgress()

	if r.CanResume() {
		t.Error("the run is still resumable after being cleared")
	}
	if _, err := os.Stat(filepath.Join(r.dataDir, ProgressFileName)); !os.IsNotExist(err) {
		t.Error("the progress file is still on disk")
	}
}

func TestLoadProgressDiscardsGarbage(t *testing.T) {
	r := testRepository(t)
	path := filepath.Join(r.dataDir, ProgressFileName)
	if err := os.WriteFile(path, []byte("{not json"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	if got := r.loadProgress(); got != nil {
		t.Errorf("a corrupt file should resume nothing, got %+v", got)
	}
	// Left in place it would fail to parse on every boot from here on.
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("the corrupt progress file was not removed")
	}
}

func TestSaveProgressLeavesNoTempFile(t *testing.T) {
	r := testRepository(t)
	r.saveProgress(&RunProgress{RootMediaID: 1, Depths: map[int]int{}})

	entries, err := os.ReadDir(r.dataDir)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) == ".tmp" {
			t.Errorf("a temp file was left behind: %s", entry.Name())
		}
	}
}

func TestProgressWithNoDataDirIsInert(t *testing.T) {
	// The repository has to survive being built without a data directory rather than panicking
	// somewhere deep in a background run.
	logger := zerolog.Nop()
	r := &Repository{logger: &logger}

	r.saveProgress(&RunProgress{RootMediaID: 1})
	if got := r.loadProgress(); got != nil {
		t.Errorf("expected nothing, got %+v", got)
	}
	r.clearProgress()
}
