/**
 * Themed cursor CSS generators.
 *
 * Each exported function accepts a hex color string (e.g. "#ff6600") and returns a
 * valid CSS `cursor` property value including `url("data:image/svg+xml,...") x y, fallback`.
 *
 * Usage (inject via a <style> tag scoped to :root[data-anime-theme]):
 *   `* { cursor: ${cursorDefault(color)}; }`
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** URL-encode an SVG string for use inside a CSS url() data URI. */
function enc(svg: string): string {
    return "data:image/svg+xml," + svg
        .replace(/\n\s*/g, " ")
        .replace(/%/g, "%25")
        .replace(/"/g, "%22")
        .replace(/</g, "%3C")
        .replace(/>/g, "%3E")
        .replace(/#/g, "%23")
        .replace(/\s+/g, " ")
        .trim()
}

/** Make cursor CSS value: url(...) hotspotX hotspotY, fallback */
function cur(svg: string, hx: number, hy: number, fallback: string): string {
    return `url("${enc(svg)}") ${hx} ${hy}, ${fallback}`
}

// ─── Cursor shapes ────────────────────────────────────────────────────────────

/**
 * Standard arrow cursor — points up-left.
 * Hotspot: (4, 3)
 */
export function cursorDefault(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22">
          <path d="M4,3 L4,19 L8,15 L11,21 L14,20 L11,14 L17,14 Z"
                fill="${c}" stroke="#0a0a1a" stroke-width="1.5" stroke-linejoin="round"/>
          <path d="M4,3 L4,19 L8,15 L11,21 L14,20 L11,14 L17,14 Z"
                fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="0.7" stroke-linejoin="round"/>
        </svg>`,
        4, 3, "default",
    )
}

/**
 * Pointing-hand cursor (pointer / links / buttons).
 * Hotspot: (9, 1) — fingertip.
 */
export function cursorPointer(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28">
          <!-- index finger -->
          <rect x="8" y="1" width="6" height="15" rx="3" fill="${c}" stroke="#0a0a1a" stroke-width="1"/>
          <!-- middle finger -->
          <rect x="14.5" y="5" width="5" height="13" rx="2.5" fill="${c}" stroke="#0a0a1a" stroke-width="1"/>
          <!-- ring finger -->
          <rect x="14.5" y="10" width="4.5" height="11" rx="2" fill="${c}" stroke="#0a0a1a" stroke-width="0.8"/>
          <!-- palm -->
          <rect x="3" y="14" width="17" height="11" rx="4" fill="${c}" stroke="#0a0a1a" stroke-width="1"/>
          <!-- thumb -->
          <rect x="1" y="14" width="5" height="8" rx="2.5" fill="${c}" stroke="#0a0a1a" stroke-width="0.8"/>
          <!-- knuckle lines -->
          <line x1="9" y1="16" x2="14" y2="16" stroke="#0a0a1a" stroke-width="0.7" opacity="0.6"/>
          <!-- highlight -->
          <rect x="9" y="2" width="2" height="5" rx="1" fill="rgba(255,255,255,0.4)"/>
        </svg>`,
        9, 1, "pointer",
    )
}

/**
 * I-beam text cursor.
 * Hotspot: (10, 12) — center of beam.
 */
export function cursorText(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="24">
          <rect x="6"  y="1.5" width="8" height="3"   rx="1.5" fill="${c}" stroke="#0a0a1a" stroke-width="0.5"/>
          <rect x="9"  y="4.5" width="2" height="15"        fill="${c}"/>
          <rect x="6"  y="19.5" width="8" height="3"  rx="1.5" fill="${c}" stroke="#0a0a1a" stroke-width="0.5"/>
          <rect x="5.5" y="1"   width="9" height="4"  rx="2" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
          <rect x="5.5" y="19"  width="9" height="4"  rx="2" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
        </svg>`,
        10, 12, "text",
    )
}

/**
 * Crosshair cursor.
 * Hotspot: (12, 12) — center.
 */
export function cursorCrosshair(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <circle cx="12" cy="12" r="5.5" fill="none" stroke="${c}" stroke-width="1.8"/>
          <circle cx="12" cy="12" r="1.8" fill="${c}"/>
          <line x1="12" y1="1"  x2="12" y2="6.5"  stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="12" y1="17.5" x2="12" y2="23" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="1"  y1="12" x2="6.5"  y2="12" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="17.5" y1="12" x2="23" y2="12" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`,
        12, 12, "crosshair",
    )
}

/**
 * Open-hand grab cursor.
 * Hotspot: (11, 8) — center of palm.
 */
export function cursorGrab(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="24">
          <!-- 4 open fingers -->
          <rect x="2"  y="3"  width="4" height="12" rx="2" fill="${c}" stroke="#0a0a1a" stroke-width="1"/>
          <rect x="7"  y="1"  width="4" height="14" rx="2" fill="${c}" stroke="#0a0a1a" stroke-width="1"/>
          <rect x="12" y="1"  width="4" height="14" rx="2" fill="${c}" stroke="#0a0a1a" stroke-width="1"/>
          <rect x="17" y="3"  width="3" height="12" rx="1.5" fill="${c}" stroke="#0a0a1a" stroke-width="0.8"/>
          <!-- palm -->
          <rect x="1"  y="13" width="20" height="9" rx="4" fill="${c}" stroke="#0a0a1a" stroke-width="1"/>
          <!-- knuckles -->
          <line x1="7"  y1="13" x2="7"  y2="22" stroke="#0a0a1a" stroke-width="0.7" opacity="0.5"/>
          <line x1="12" y1="13" x2="12" y2="22" stroke="#0a0a1a" stroke-width="0.7" opacity="0.5"/>
          <line x1="17" y1="13" x2="17" y2="22" stroke="#0a0a1a" stroke-width="0.7" opacity="0.5"/>
        </svg>`,
        11, 8, "grab",
    )
}

/**
 * Closed-fist grabbing cursor.
 * Hotspot: (11, 11) — center.
 */
export function cursorGrabbing(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="20">
          <!-- fist block -->
          <rect x="2" y="5" width="18" height="12" rx="4" fill="${c}" stroke="#0a0a1a" stroke-width="1"/>
          <!-- knuckle lines -->
          <line x1="6.5"  y1="5" x2="6.5"  y2="13" stroke="#0a0a1a" stroke-width="0.8" opacity="0.55"/>
          <line x1="10.5" y1="5" x2="10.5" y2="12" stroke="#0a0a1a" stroke-width="0.8" opacity="0.55"/>
          <line x1="14.5" y1="5" x2="14.5" y2="13" stroke="#0a0a1a" stroke-width="0.8" opacity="0.55"/>
          <!-- thumb -->
          <rect x="2" y="1" width="7" height="6" rx="2.5" fill="${c}" stroke="#0a0a1a" stroke-width="0.8"/>
          <!-- highlight -->
          <rect x="4" y="6" width="14" height="2.5" rx="1" fill="rgba(255,255,255,0.18)"/>
        </svg>`,
        11, 11, "grabbing",
    )
}

/**
 * Static loading / wait cursor (arc spinner shape).
 * Hotspot: (12, 12) — center.
 */
export function cursorWait(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <!-- background ring -->
          <circle cx="12" cy="12" r="9" fill="none" stroke="${c}" stroke-width="3" opacity="0.25"/>
          <!-- arc 3/4 filled -->
          <path d="M12,3 A9,9 0 1,1 3,12" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
          <!-- center dot -->
          <circle cx="12" cy="12" r="2" fill="${c}" opacity="0.7"/>
        </svg>`,
        12, 12, "wait",
    )
}

/**
 * Arrow + spinner (progress) cursor.
 * Hotspot: (4, 3).
 */
export function cursorProgress(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">
          <path d="M4,3 L4,15 L7,12 L10,18 L12,17 L9,11 L13,11 Z"
                fill="${c}" stroke="#0a0a1a" stroke-width="1.2" stroke-linejoin="round"/>
          <circle cx="19" cy="19" r="6" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.3"/>
          <path d="M19,13 A6,6 0 1,1 13,19" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
        4, 3, "progress",
    )
}

/**
 * Not-allowed / disabled cursor.
 * Hotspot: (12, 12) — center.
 */
export function cursorNotAllowed(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <circle cx="12" cy="12" r="9" fill="none" stroke="${c}" stroke-width="2.5"/>
          <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
        12, 12, "not-allowed",
    )
}

/**
 * Move / all-scroll cursor (4-directional arrows).
 * Hotspot: (12, 12) — center.
 */
export function cursorMove(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <path d="M12,2 L15,6 L13,6 L13,11 L18,11 L18,9 L22,12 L18,15 L18,13 L13,13 L13,18 L15,18 L12,22 L9,18 L11,18 L11,13 L6,13 L6,15 L2,12 L6,9 L6,11 L11,11 L11,6 L9,6 Z"
                fill="${c}" stroke="#0a0a1a" stroke-width="0.6" stroke-linejoin="round"/>
        </svg>`,
        12, 12, "move",
    )
}

/**
 * Help cursor (arrow + question mark bubble).
 * Hotspot: (4, 3).
 */
export function cursorHelp(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">
          <path d="M4,3 L4,15 L7,12 L10,18 L12,17 L9,11 L13,11 Z"
                fill="${c}" stroke="#0a0a1a" stroke-width="1.2" stroke-linejoin="round"/>
          <circle cx="19" cy="19" r="6" fill="${c}" stroke="#0a0a1a" stroke-width="0.8"/>
          <text x="19" y="23.5" text-anchor="middle" fill="#0a0a1a" font-size="10" font-weight="bold" font-family="Arial,sans-serif">?</text>
        </svg>`,
        4, 3, "help",
    )
}

/**
 * Copy cursor (arrow + plus badge).
 * Hotspot: (4, 3).
 */
export function cursorCopy(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">
          <path d="M4,3 L4,15 L7,12 L10,18 L12,17 L9,11 L13,11 Z"
                fill="${c}" stroke="#0a0a1a" stroke-width="1.2" stroke-linejoin="round"/>
          <circle cx="19" cy="19" r="6" fill="${c}" stroke="#0a0a1a" stroke-width="0.8"/>
          <line x1="19" y1="15.5" x2="19" y2="22.5" stroke="#0a0a1a" stroke-width="2" stroke-linecap="round"/>
          <line x1="15.5" y1="19" x2="22.5" y2="19" stroke="#0a0a1a" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
        4, 3, "copy",
    )
}

/**
 * Alias / redirect cursor (arrow + curved arrow).
 * Hotspot: (4, 3).
 */
export function cursorAlias(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">
          <path d="M4,3 L4,15 L7,12 L10,18 L12,17 L9,11 L13,11 Z"
                fill="${c}" stroke="#0a0a1a" stroke-width="1.2" stroke-linejoin="round"/>
          <circle cx="19" cy="19" r="6" fill="${c}" stroke="#0a0a1a" stroke-width="0.8"/>
          <text x="19" y="23.5" text-anchor="middle" fill="#0a0a1a" font-size="11" font-weight="bold" font-family="Arial,sans-serif">↗</text>
        </svg>`,
        4, 3, "alias",
    )
}

/**
 * Zoom-in cursor (magnifier with +).
 * Hotspot: (11, 11) — center of lens.
 */
export function cursorZoomIn(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <circle cx="10" cy="10" r="7.5" fill="none" stroke="${c}" stroke-width="2"/>
          <line x1="10" y1="7"  x2="10" y2="13" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="7"  y1="10" x2="13" y2="10" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="16" y1="16" x2="22" y2="22" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
        11, 11, "zoom-in",
    )
}

/**
 * Zoom-out cursor (magnifier with -).
 * Hotspot: (11, 11) — center of lens.
 */
export function cursorZoomOut(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <circle cx="10" cy="10" r="7.5" fill="none" stroke="${c}" stroke-width="2"/>
          <line x1="7"  y1="10" x2="13" y2="10" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="16" y1="16" x2="22" y2="22" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
        11, 11, "zoom-out",
    )
}

/**
 * Horizontal resize (←→) cursor.
 * Hotspot: (12, 8) — center.
 */
export function cursorEwResize(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16">
          <line x1="2" y1="8" x2="22" y2="8" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
          <polyline points="6,4 2,8 6,12" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="18,4 22,8 18,12" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        12, 8, "ew-resize",
    )
}

/**
 * Vertical resize (↕) cursor.
 * Hotspot: (8, 12) — center.
 */
export function cursorNsResize(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="24">
          <line x1="8" y1="2" x2="8" y2="22" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
          <polyline points="4,6 8,2 12,6" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="4,18 8,22 12,18" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        8, 12, "ns-resize",
    )
}

/**
 * NW-SE diagonal resize cursor (↖↘).
 * Hotspot: (12, 12).
 */
export function cursorNwseResize(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <line x1="3" y1="3" x2="21" y2="21" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
          <polyline points="3,9 3,3 9,3" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="21,15 21,21 15,21" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        12, 12, "nwse-resize",
    )
}

/**
 * NE-SW diagonal resize cursor (↗↙).
 * Hotspot: (12, 12).
 */
export function cursorNeswResize(c: string): string {
    return cur(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <line x1="21" y1="3" x2="3" y2="21" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
          <polyline points="15,3 21,3 21,9" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="9,21 3,21 3,15" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        12, 12, "nesw-resize",
    )
}

// ─── Full CSS block ────────────────────────────────────────────────────────────

/**
 * Returns the full CSS string to inject for all themed cursor states.
 * Scoped to `:root[data-anime-theme]` so it only applies when a theme is active.
 */
export function buildThemeCursorCSS(color: string): string {
    return `
:root[data-anime-theme] *,
:root[data-anime-theme] *::before,
:root[data-anime-theme] *::after {
  cursor: ${cursorDefault(color)} !important;
}
:root[data-anime-theme] a,
:root[data-anime-theme] button,
:root[data-anime-theme] [role="button"],
:root[data-anime-theme] label[for],
:root[data-anime-theme] select,
:root[data-anime-theme] summary,
:root[data-anime-theme] [tabindex]:not([tabindex="-1"]),
:root[data-anime-theme] input[type="checkbox"],
:root[data-anime-theme] input[type="radio"],
:root[data-anime-theme] input[type="submit"],
:root[data-anime-theme] input[type="button"],
:root[data-anime-theme] input[type="reset"],
:root[data-anime-theme] input[type="file"] {
  cursor: ${cursorPointer(color)} !important;
}
:root[data-anime-theme] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]),
:root[data-anime-theme] textarea,
:root[data-anime-theme] [contenteditable="true"],
:root[data-anime-theme] [contenteditable=""] {
  cursor: ${cursorText(color)} !important;
}
:root[data-anime-theme] [draggable="true"] {
  cursor: ${cursorGrab(color)} !important;
}
:root[data-anime-theme] [draggable="true"]:active {
  cursor: ${cursorGrabbing(color)} !important;
}
:root[data-anime-theme] [aria-disabled="true"],
:root[data-anime-theme] [disabled],
:root[data-anime-theme] button:disabled,
:root[data-anime-theme] input:disabled,
:root[data-anime-theme] select:disabled {
  cursor: ${cursorNotAllowed(color)} !important;
}
:root[data-anime-theme] [data-cursor="crosshair"] { cursor: ${cursorCrosshair(color)} !important; }
:root[data-anime-theme] [data-cursor="move"]      { cursor: ${cursorMove(color)} !important; }
:root[data-anime-theme] [data-cursor="grab"]      { cursor: ${cursorGrab(color)} !important; }
:root[data-anime-theme] [data-cursor="grabbing"]  { cursor: ${cursorGrabbing(color)} !important; }
:root[data-anime-theme] [data-cursor="wait"]      { cursor: ${cursorWait(color)} !important; }
:root[data-anime-theme] [data-cursor="progress"]  { cursor: ${cursorProgress(color)} !important; }
:root[data-anime-theme] [data-cursor="zoom-in"]   { cursor: ${cursorZoomIn(color)} !important; }
:root[data-anime-theme] [data-cursor="zoom-out"]  { cursor: ${cursorZoomOut(color)} !important; }
:root[data-anime-theme] [data-cursor="help"]      { cursor: ${cursorHelp(color)} !important; }
:root[data-anime-theme] [data-cursor="copy"]      { cursor: ${cursorCopy(color)} !important; }
:root[data-anime-theme] [data-cursor="alias"]     { cursor: ${cursorAlias(color)} !important; }
:root[data-anime-theme] [data-cursor="ew-resize"]   { cursor: ${cursorEwResize(color)} !important; }
:root[data-anime-theme] [data-cursor="ns-resize"]   { cursor: ${cursorNsResize(color)} !important; }
:root[data-anime-theme] [data-cursor="nwse-resize"] { cursor: ${cursorNwseResize(color)} !important; }
:root[data-anime-theme] [data-cursor="nesw-resize"] { cursor: ${cursorNeswResize(color)} !important; }
`
}
