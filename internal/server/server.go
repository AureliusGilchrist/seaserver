package server

import (
	"embed"
	"fmt"
	golog "log"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"seanime/internal/core"
	"seanime/internal/cron"
	"seanime/internal/handlers"
	"seanime/internal/updater"
	"seanime/internal/util"
	"seanime/internal/util/crashlog"
	"time"

	"github.com/rs/zerolog/log"
)

func startApp(embeddedLogo []byte) (*core.App, core.SeanimeFlags, *updater.SelfUpdater) {
	// Print the header
	core.PrintHeader()

	// Get the flags
	flags := core.GetSeanimeFlags()

	selfupdater := updater.NewSelfUpdater()

	// Create the app instance
	app := core.NewApp(&core.ConfigOptions{
		Flags:        flags,
		EmbeddedLogo: embeddedLogo,
	}, selfupdater)

	// Create log file
	logFilePath := filepath.Join(app.Config.Logs.Dir, fmt.Sprintf("seanime-%s.log", time.Now().Format("2006-01-02_15-04-05")))
	// Open the log file
	logFile, _ := os.OpenFile(
		logFilePath,
		os.O_APPEND|os.O_CREATE|os.O_WRONLY,
		0664,
	)

	log.Logger = *app.Logger
	golog.SetOutput(app.Logger)
	util.SetupLoggerSignalHandling(logFile)
	crashlog.GlobalCrashLogger.SetLogDir(app.Config.Logs.Dir)

	app.OnFlushLogs = func() {
		util.WriteGlobalLogBufferToFile(logFile)
		logFile.Sync()
	}

	if !flags.Update {
		go func() {
			for {
				util.WriteGlobalLogBufferToFile(logFile)
				time.Sleep(5 * time.Second)
			}
		}()
	}

	return app, flags, selfupdater
}

func startAppLoop(webFS *embed.FS, app *core.App, flags core.SeanimeFlags, selfupdater *updater.SelfUpdater) {
	updateMode := flags.Update

appLoop:
	for {
		switch updateMode {
		case true:

			log.Log().Msg("Running in update mode")

			// Print the header
			core.PrintHeader()

			// Run the self-updater
			err := selfupdater.Run()
			if err != nil {
			}

			log.Log().Msg("Shutting down in 10 seconds...")
			time.Sleep(10 * time.Second)

			break appLoop
		case false:

			// Start goroutine monitoring + periodic cleanup
			startGoroutineMonitor()
			startGoroutineCleanup()

			// Create the echo app instance
			echoApp := core.NewEchoApp(app, webFS)

			// Initialize the routes
			handlers.InitRoutes(app, echoApp)

			// Run the server
			core.RunEchoServer(app, echoApp)

			// Run jobs and register cleanup for graceful stop.
			stopJobs := cron.RunJobs(app)
			app.AddCleanupFunctionOnce("cron.stop-jobs", stopJobs)

			select {
			case <-selfupdater.Started():
				app.Cleanup()
				updateMode = true
				break
			}
		}
		continue
	}
}

// startGoroutineMonitor monitors goroutine count and logs warnings if it gets too high
func startGoroutineMonitor() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			count := runtime.NumGoroutine()
			if count > 10000 { // Threshold for warning
				log.Warn().Int("goroutines", count).Msg("High goroutine count detected - potential leak")
			} else if count > 5000 { // Lower threshold for info
				log.Info().Int("goroutines", count).Msg("Elevated goroutine count")
			}
		}
	}()
}

// startGoroutineCleanup runs every 5 minutes to force a GC + release OS memory.
//
// Go does not allow killing goroutines directly — they can only return on their
// own. However, when goroutines do finish, their stacks and any heap objects
// they referenced may sit around until the next GC. Forcing a GC + releasing
// memory back to the OS on a fixed cadence keeps memory usage bounded and
// makes leaked-goroutine spikes visible in the logs.
func startGoroutineCleanup() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			before := runtime.NumGoroutine()
			var mBefore runtime.MemStats
			runtime.ReadMemStats(&mBefore)

			runtime.GC()
			debug.FreeOSMemory()

			after := runtime.NumGoroutine()
			var mAfter runtime.MemStats
			runtime.ReadMemStats(&mAfter)

			log.Debug().
				Int("goroutines_before", before).
				Int("goroutines_after", after).
				Uint64("heap_alloc_before_mb", mBefore.HeapAlloc/(1024*1024)).
				Uint64("heap_alloc_after_mb", mAfter.HeapAlloc/(1024*1024)).
				Uint64("sys_before_mb", mBefore.Sys/(1024*1024)).
				Uint64("sys_after_mb", mAfter.Sys/(1024*1024)).
				Msg("Periodic goroutine cleanup completed")
		}
	}()
}
