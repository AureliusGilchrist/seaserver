package handlers

import (
	"mime"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

// ─── Cursor Library ────────────────────────────────────────────────────────
//
// User-driven cursor library, organized into 5 tabs:
//   static    — procedurally generated SVGs (seeded by EnsureCursorLibraryStaticAssets)
//   regular   — user-dropped non-animated cursors  (.cur .png .svg .ico .webp)
//   games     — user-dropped game cursors          (any of the above + .gif .apng .ani)
//   animated  — user-dropped animated cursors      (.gif .ani .apng animated-webp)
//   anime     — user-dropped anime-themed cursors  (any extension)
//
// Files in regular/games/animated are name-prefixed with a 3-digit level number,
// e.g. `045-flame__pointer.png`. Anime files use the AniList series slug as the
// prefix instead, e.g. `naruto-rasengan__pointer.png`.
//
// Optional filename suffixes (separated by `__`):
//   __<states>     comma-separated state slots this cursor is valid for. If absent,
//                  the cursor is valid for every slot. Valid slot keys:
//                  default, pointer, text, waiting, precision, grab, disabled
//   __h<x>x<y>     hotspot in pixels, e.g. `__h0x0` (top-left) or `__h16x16` (center)
//
// Examples:
//   001-arrow.svg                         — slot=any, no states, hotspot 0,0
//   045-flame__pointer.png                — only available for the Pointer slot
//   072-spinner__waiting,progress.gif     — only available for the Waiting slot
//   140-portal-companion__pointer__h16x8.png
//   naruto-rasengan__pointer.png

type CursorEntry struct {
	ID         string   `json:"id"`         // "regular/045-flame__pointer.png"
	Tab        string   `json:"tab"`        // static|regular|games|animated|anime
	File       string   `json:"file"`       // basename
	URL        string   `json:"url"`        // public URL (e.g. /cursor-library/regular/045-...)
	Slug       string   `json:"slug"`       // derived display key (e.g. "flame")
	Name       string   `json:"name"`       // display name (titleized slug)
	Level      int      `json:"level"`      // unlock level (0 = always unlocked, anime tab uses 0)
	IsFinal    bool     `json:"isFinal"`    // true if this is the highest-level item in its tab
	IsAnimated bool     `json:"isAnimated"` // true for .gif/.ani/.apng/animated-webp
	States     []string `json:"states"`     // empty = "any"
	HotspotX   int      `json:"hotspotX"`
	HotspotY   int      `json:"hotspotY"`
	MimeType   string   `json:"mimeType"`
	SeriesSlug string   `json:"seriesSlug,omitempty"` // anime tab only
	Lore       string   `json:"lore,omitempty"`       // user-supplied lore string (optional)
}

type CursorLibraryManifest struct {
	Entries []CursorEntry `json:"entries"`
	Slots   []string      `json:"slots"`
}

var cursorTabs = []string{"static", "regular", "games", "animated", "anime"}

var cursorSlots = []string{"default", "pointer", "text", "waiting", "precision", "grab", "disabled"}

var cursorAllowedExt = map[string]bool{
	".cur": true, ".ani": true, ".png": true, ".svg": true, ".gif": true,
	".apng": true, ".webp": true, ".ico": true, ".jpg": true, ".jpeg": true,
}

var animatedExt = map[string]bool{
	".gif": true, ".ani": true, ".apng": true,
}

// HandleGetCursorLibraryManifest scans the cursor-library directory and returns a manifest.
// The directory tree (and static SVG seed files) is created at app startup by
// core.SeedCursorLibrary, so this handler is read-only — missing tab dirs are treated
// as empty.
func (h *Handler) HandleGetCursorLibraryManifest(c echo.Context) error {
	baseDir := filepath.Join(h.App.Config.Data.AppDataDir, "cursor-library")

	all := make([]CursorEntry, 0, 256)
	for _, tab := range cursorTabs {
		tabDir := filepath.Join(baseDir, tab)
		entries, err := os.ReadDir(tabDir)
		if err != nil {
			continue
		}
		for _, de := range entries {
			if de.IsDir() {
				continue
			}
			name := de.Name()
			if strings.HasPrefix(name, ".") {
				continue
			}
			ext := strings.ToLower(filepath.Ext(name))
			if !cursorAllowedExt[ext] {
				continue
			}
			entry := parseCursorFilename(tab, name)
			entry.URL = "/cursor-library/" + tab + "/" + name
			entry.MimeType = mime.TypeByExtension(ext)
			if entry.MimeType == "" {
				entry.MimeType = "application/octet-stream"
			}
			entry.IsAnimated = animatedExt[ext]
			all = append(all, entry)
		}
	}

	// Sort each tab by level ASC, then name; mark the highest-level item as final.
	byTab := map[string][]int{}
	for i := range all {
		byTab[all[i].Tab] = append(byTab[all[i].Tab], i)
	}
	for tab, idxs := range byTab {
		sort.SliceStable(idxs, func(a, b int) bool {
			if all[idxs[a]].Level != all[idxs[b]].Level {
				return all[idxs[a]].Level < all[idxs[b]].Level
			}
			return all[idxs[a]].Name < all[idxs[b]].Name
		})
		byTab[tab] = idxs
		// Final flag → only for regular/games/animated (level-based tabs)
		if tab == "regular" || tab == "games" || tab == "animated" {
			if len(idxs) > 0 {
				all[idxs[len(idxs)-1]].IsFinal = true
			}
		}
	}

	// Rebuild in original order but sorted-within-tab
	out := make([]CursorEntry, 0, len(all))
	for _, tab := range cursorTabs {
		for _, i := range byTab[tab] {
			out = append(out, all[i])
		}
	}

	return h.RespondWithData(c, CursorLibraryManifest{Entries: out, Slots: cursorSlots})
}

// parseCursorFilename parses `<prefix>[__states][__h<x>x<y>].<ext>` for a tab.
func parseCursorFilename(tab, file string) CursorEntry {
	ext := strings.ToLower(filepath.Ext(file))
	base := strings.TrimSuffix(file, filepath.Ext(file))
	parts := strings.Split(base, "__")

	e := CursorEntry{
		Tab:    tab,
		File:   file,
		ID:     tab + "/" + file,
		States: []string{},
	}

	head := parts[0]
	for _, mod := range parts[1:] {
		mod = strings.TrimSpace(mod)
		if mod == "" {
			continue
		}
		if strings.HasPrefix(mod, "h") {
			// hotspot: h<x>x<y>
			coords := strings.TrimPrefix(mod, "h")
			xy := strings.SplitN(coords, "x", 2)
			if len(xy) == 2 {
				if x, err := strconv.Atoi(xy[0]); err == nil {
					e.HotspotX = x
				}
				if y, err := strconv.Atoi(xy[1]); err == nil {
					e.HotspotY = y
				}
			}
			continue
		}
		// states list
		for _, s := range strings.Split(mod, ",") {
			s = strings.ToLower(strings.TrimSpace(s))
			if s != "" {
				e.States = append(e.States, s)
			}
		}
	}

	// Determine level + slug from head
	if tab == "anime" {
		// head IS the series slug (may itself contain dashes); no level
		e.SeriesSlug = head
		e.Slug = head
		e.Name = titleize(head)
		e.Level = 0
	} else if tab == "static" {
		// static cursors don't have a level prefix
		e.Slug = head
		e.Name = titleize(head)
		e.Level = 1
	} else {
		// regular/games/animated → first segment is 1-4 digit level
		segs := strings.SplitN(head, "-", 2)
		if len(segs) == 2 {
			if lv, err := strconv.Atoi(segs[0]); err == nil {
				e.Level = lv
				e.Slug = segs[1]
				e.Name = titleize(segs[1])
			} else {
				e.Slug = head
				e.Name = titleize(head)
			}
		} else {
			e.Slug = head
			e.Name = titleize(head)
		}
		// File extension marks animation regardless of tab
	}

	if ext == ".png" || ext == ".jpg" || ext == ".jpeg" {
		// caller fills mime type
	}
	return e
}

func titleize(slug string) string {
	if slug == "" {
		return ""
	}
	words := strings.Split(slug, "-")
	for i, w := range words {
		if w == "" {
			continue
		}
		words[i] = strings.ToUpper(w[:1]) + w[1:]
	}
	return strings.Join(words, " ")
}


