package main

import (
	"bufio"
	"embed"
	"fmt"
	"os"
	"runtime/debug"
	"seanime/internal/constants"
	"seanime/internal/server"
	"strconv"
	"strings"
)

// maxBackendMemoryLimit caps the Go runtime's soft memory limit on machines with a lot of RAM.
const maxBackendMemoryLimit = 50 << 30

// minBackendMemoryLimit keeps the limit from being so tight that the GC runs constantly.
const minBackendMemoryLimit = 1 << 30

//go:embed all:web
var WebFS embed.FS

//go:embed internal/icon/logo.png
var embeddedLogo []byte

// versionsManifest is the single source of truth for component version numbers.
// It is embedded from the repo-root versions.json so the Go server reads the same
// values listed in the central manifest rather than carrying its own hard-coded copy.
//
//go:embed versions.json
var versionsManifest []byte

func main() {
	applyMemoryLimit()

	if err := constants.SetVersionsFromJSON(versionsManifest); err != nil {
		// Non-fatal: fall back to the defaults baked into the constants package.
		fmt.Fprintf(os.Stderr, "warning: failed to load versions.json manifest: %v\n", err)
	}
	server.StartServer(WebFS, embeddedLogo)
}

// applyMemoryLimit sets the Go runtime's soft memory limit.
//
// It used to be a fixed 50 GiB, which on the NAS is no limit at all: with the default GOGC the heap
// may grow to twice what is live before a collection, and the runtime hands freed pages back to
// the OS lazily, so the process's resident size climbed for days until the machine ran out. Half
// the physical memory makes the collector work harder before that point instead. An explicit
// GOMEMLIMIT in the environment (already applied by the runtime) wins.
func applyMemoryLimit() {
	if os.Getenv("GOMEMLIMIT") != "" {
		return
	}
	limit := int64(maxBackendMemoryLimit)
	if total := physicalMemoryBytes(); total > 0 {
		limit = total / 2
		if limit > maxBackendMemoryLimit {
			limit = maxBackendMemoryLimit
		}
		if limit < minBackendMemoryLimit {
			limit = minBackendMemoryLimit
		}
	}
	debug.SetMemoryLimit(limit)
}

// physicalMemoryBytes reads MemTotal from /proc/meminfo; 0 where that is unavailable.
func physicalMemoryBytes() int64 {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) >= 2 && fields[0] == "MemTotal:" {
			kb, err := strconv.ParseInt(fields[1], 10, 64)
			if err != nil {
				return 0
			}
			return kb << 10
		}
	}
	return 0
}
