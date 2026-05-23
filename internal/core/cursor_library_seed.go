package core

import (
	"os"
	"path/filepath"
)

// SeedCursorLibrary creates the cursor-library directory tree under <appDataDir>
// and writes the procedurally-generated static SVG cursors if they don't exist.
// Safe to call on every startup (idempotent).
//
// Layout:
//
//	<appDataDir>/cursor-library/
//	  static/    (seeded SVGs)
//	  regular/   (user-dropped)
//	  games/     (user-dropped)
//	  animated/  (user-dropped)
//	  anime/     (user-dropped)
func SeedCursorLibrary(appDataDir string) error {
	base := filepath.Join(appDataDir, "cursor-library")
	tabs := []string{"static", "regular", "games", "animated", "anime"}
	for _, t := range tabs {
		if err := os.MkdirAll(filepath.Join(base, t), 0o755); err != nil {
			return err
		}
	}
	staticDir := filepath.Join(base, "static")
	for name, svg := range staticCursorSVGs {
		p := filepath.Join(staticDir, name)
		if _, err := os.Stat(p); err == nil {
			continue
		}
		if err := os.WriteFile(p, []byte(svg), 0o644); err != nil {
			return err
		}
	}
	return nil
}

// staticCursorSVGs — 20 procedurally-generated cursor SVGs (24x24 viewBox).
// Each SVG is designed to be visible on light AND dark backgrounds: white fill
// with a black outline (or vice-versa). Filename suffix conventions are honored
// by the manifest scanner.
var staticCursorSVGs = map[string]string{
	"dot-small.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>`,

	"dot-large.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>`,

	"crosshair-thin.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke="#000" stroke-width="1"><line x1="12" y1="2" x2="12" y2="22" stroke="#fff" stroke-width="2"/><line x1="2" y1="12" x2="22" y2="12" stroke="#fff" stroke-width="2"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,

	"crosshair-thick.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g stroke="#000" stroke-width="4" stroke-linecap="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></g><g stroke="#fff" stroke-width="2" stroke-linecap="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></g></svg>`,

	"ring.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#000" stroke-width="3"/><circle cx="12" cy="12" r="8" fill="none" stroke="#fff" stroke-width="1.5"/></svg>`,

	"ring-glow.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/><circle cx="12" cy="12" r="7" fill="none" stroke="#000" stroke-width="2"/><circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="1"/></svg>`,

	"square.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>`,

	"triangle.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><polygon points="12,4 20,20 4,20" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>`,

	"plus.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g stroke-linecap="square"><line x1="12" y1="4" x2="12" y2="20" stroke="#000" stroke-width="4"/><line x1="4" y1="12" x2="20" y2="12" stroke="#000" stroke-width="4"/><line x1="12" y1="4" x2="12" y2="20" stroke="#fff" stroke-width="2"/><line x1="4" y1="12" x2="20" y2="12" stroke="#fff" stroke-width="2"/></g></svg>`,

	"x-mark.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19" stroke="#000" stroke-width="4"/><line x1="19" y1="5" x2="5" y2="19" stroke="#000" stroke-width="4"/><line x1="5" y1="5" x2="19" y2="19" stroke="#fff" stroke-width="2"/><line x1="19" y1="5" x2="5" y2="19" stroke="#fff" stroke-width="2"/></g></svg>`,

	"diamond.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><polygon points="12,3 21,12 12,21 3,12" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>`,

	"double-ring.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="0.5"/><circle cx="12" cy="12" r="5" stroke="#fff" stroke-width="0.5"/></svg>`,

	"target.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#000" stroke-width="1.5"/><circle cx="12" cy="12" r="6" fill="none" stroke="#000" stroke-width="1.5"/><circle cx="12" cy="12" r="2" fill="#000"/><circle cx="12" cy="12" r="10" fill="none" stroke="#fff" stroke-width="0.5"/></svg>`,

	"sniper.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke="#000" stroke-width="1.5"><circle cx="12" cy="12" r="9" fill="none"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/><line x1="2" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="22" y2="12"/><circle cx="12" cy="12" r="1.5" fill="#000"/></svg>`,

	"brackets.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"><path d="M7 4 L4 4 L4 7"/><path d="M17 4 L20 4 L20 7"/><path d="M7 20 L4 20 L4 17"/><path d="M17 20 L20 20 L20 17"/></svg>`,

	"arrow-hollow.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><polygon points="2,2 2,17 6,13 9,20 12,19 9,12 14,12" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>`,

	"arrow-filled.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><polygon points="2,2 2,17 6,13 9,20 12,19 9,12 14,12" fill="#000" stroke="#fff" stroke-width="1" stroke-linejoin="round"/></svg>`,

	"arrow-pixel.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 12 12" shape-rendering="crispEdges"><path d="M1,1 h1 v1 h1 v1 h1 v1 h1 v1 h1 v1 h1 v1 h-2 v1 h1 v1 h-1 v1 h-1 v-1 h-1 v-1 h-1 v-1 h-1 v-7 z" fill="#fff" stroke="#000" stroke-width="0.5"/></svg>`,

	"i-beam.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g stroke="#000" stroke-width="3" stroke-linecap="square" fill="none"><line x1="9" y1="3" x2="15" y2="3"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/></g><g stroke="#fff" stroke-width="1" stroke-linecap="square" fill="none"><line x1="9" y1="3" x2="15" y2="3"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/></g></svg>`,

	"default-restore.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><polygon points="3,2 3,18 8,14 11,21 14,20 11,13 17,13" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
}
