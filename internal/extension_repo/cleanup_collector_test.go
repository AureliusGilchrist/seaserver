package extension_repo

import (
	"testing"

	"seanime/internal/goja/goja_runtime"
	"seanime/internal/util"

	"github.com/dop251/goja"
)

// Cleanups registered by runtimes built during the pool's own pre-warm (before the pool value
// exists) must still run when the pool is deleted; they used to be dropped for ChromeDP, leaking a
// goroutine and its whole VM per pre-warmed runtime on every extension unload.
func TestCleanupCollectorKeepsPrewarmCleanups(t *testing.T) {
	logger := util.NewLogger()
	manager := goja_runtime.NewManager(logger)

	ran := 0
	cleanups := &cleanupCollector{}
	pool, err := manager.GetOrCreatePrivatePool("collector-test", func() *goja.Runtime {
		cleanups.add(func() { ran++ })
		return goja.New()
	})
	cleanups.attach(pool)
	if err != nil {
		t.Fatal(err)
	}
	prewarmed := ran
	if prewarmed != 0 {
		t.Fatalf("cleanups ran before the pool was deleted: %d", prewarmed)
	}
	cleanups.add(func() { ran++ }) // after attach: goes straight to the pool

	manager.DeletePluginPool("collector-test")
	stats := pool.Stats()
	want := int(stats["prewarmed"]) + 1
	if ran != want {
		t.Fatalf("ran %d cleanups on pool delete, want %d (prewarmed + 1); stats=%v", ran, want, stats)
	}
}

// A failed pool creation runs the queued cleanups immediately instead of losing them.
func TestCleanupCollectorAttachNilRunsPending(t *testing.T) {
	ran := 0
	c := &cleanupCollector{}
	c.add(func() { ran++ })
	c.add(func() { panic("must not escape") })
	c.attach(nil)
	if ran != 1 {
		t.Fatalf("pending cleanup ran %d times", ran)
	}
}
