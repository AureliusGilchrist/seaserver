package main

import (
	"embed"
	"fmt"
	"os"
	"seanime/internal/constants"
	"seanime/internal/server"
)

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
	if err := constants.SetVersionsFromJSON(versionsManifest); err != nil {
		// Non-fatal: fall back to the defaults baked into the constants package.
		fmt.Fprintf(os.Stderr, "warning: failed to load versions.json manifest: %v\n", err)
	}
	server.StartServer(WebFS, embeddedLogo)
}
