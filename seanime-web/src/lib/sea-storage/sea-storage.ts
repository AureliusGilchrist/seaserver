/**
 * seaStorage — local-first, server-synced wrapper around localStorage.
 *
 * Why this exists: Electron / Denshi installers were wiping `%APPDATA%\Seanime Denshi\Local Storage\`
 * on every reinstall, which deleted browser localStorage and reset every UI preference
 * (UI customizer, theme, easter eggs, reward progress, sound pack, etc.). This module mirrors
 * a registered set of localStorage keys to the backend (`/api/v1/client-prefs`, scoped per
 * profile) so the values survive across reinstalls and remote setups.
 *
 * Behaviour:
 *  - Reads always come from localStorage (fast, synchronous).
 *  - Writes go to localStorage immediately AND are queued for upload to the server when the key
 *    matches one of the registered patterns.
 *  - On profile login, `hydrateClientPrefs()` is called to copy server values into localStorage,
 *    overwriting local copies (server is the source of truth on a fresh install).
 *  - Server uploads are debounced per key.
 */

import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { buildSeaQuery } from "@/api/client/requests"

// ─── Registered keys / prefixes ───────────────────────────────────────────────
// Anything matching is mirrored to the server. Order does not matter.
// Patterns may end with `*` to match any suffix.
const SYNCED_KEY_PATTERNS: readonly string[] = [
    // UI customizer presets
    "sea-ui-customize-*",
    // Easter-egg / discovered secrets
    "sea-easter-eggs-*",
    // Reward progress
    "sea-rewards-*",
    "sea-egg-rewards-*",
    // Cursor pack (key is sea-cursor-${profileKey})
    "sea-cursor-*",
    // Anime-themes (covers theme/music/vol/particles/ptypes/bgdim/bgblur/bgexposure/bgsat/bgcontrast/color/bgurl/vignette/etc.)
    "sea-anime-*",
    "sea-activated-themes",
    "sea-custom-theme-*",
    // Sound prefs
    "sea-sound-pack-id",
    "sea-sound-volume",
    "sea-user-sound-level",
    // Player layout
    "sea-media-theater-mode",
    // Custom CSS
    "sea-custom-css",
]

function isSyncedKey(key: string): boolean {
    for (const pat of SYNCED_KEY_PATTERNS) {
        if (pat.endsWith("*")) {
            if (key.startsWith(pat.slice(0, -1))) return true
        } else if (key === pat) {
            return true
        }
    }
    return false
}

// ─── Token helpers (read directly from localStorage so seaStorage works outside React) ──

function readJsonLS(key: string): string | undefined {
    try {
        const raw = localStorage.getItem(key)
        if (raw == null) return undefined
        // jotai atomWithStorage stores JSON-encoded values
        return JSON.parse(raw) as string
    } catch {
        return undefined
    }
}

function getTokens(): { password?: string; profileToken?: string } {
    return {
        password: readJsonLS("sea-server-auth-token"),
        profileToken: readJsonLS("sea-profile-token"),
    }
}

// ─── Pending write queue ──────────────────────────────────────────────────────

type PendingOp = { type: "upsert"; value: string } | { type: "delete" }
const pending = new Map<string, PendingOp>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_DEBOUNCE_MS = 400

let _hydrated = false
let _hydrating: Promise<void> | null = null

function scheduleFlush() {
    if (flushTimer != null) return
    flushTimer = setTimeout(() => {
        flushTimer = null
        void flushNow()
    }, FLUSH_DEBOUNCE_MS)
}

async function flushNow(): Promise<void> {
    // Wait for hydration to finish before flushing — otherwise we'd overwrite server-side
    // values with stale local ones during the initial bootstrap of a fresh install.
    if (_hydrating) {
        try { await _hydrating } catch {}
    }
    if (!_hydrated) return
    if (pending.size === 0) return

    const tokens = getTokens()
    if (!tokens.profileToken) return // not logged in yet — keep queued

    const ops = Array.from(pending.entries())
    pending.clear()

    for (const [key, op] of ops) {
        try {
            if (op.type === "upsert") {
                await buildSeaQuery({
                    endpoint: API_ENDPOINTS.CLIENT_PREFS.UpsertClientPref.endpoint,
                    method: "PUT",
                    data: { key, value: op.value },
                    ...tokens,
                })
            } else {
                await buildSeaQuery({
                    endpoint: API_ENDPOINTS.CLIENT_PREFS.DeleteClientPref.endpoint.replace(":key", encodeURIComponent(key)),
                    method: "DELETE",
                    ...tokens,
                })
            }
        } catch (err) {
            // Re-queue the latest pending op for this key (don't clobber a newer write).
            if (!pending.has(key)) {
                pending.set(key, op)
            }
            // Stop trying for now — try again next flush cycle.
            scheduleFlush()
            return
        }
    }
}

// ─── Public storage API ───────────────────────────────────────────────────────

export const seaStorage = {
    getItem(key: string): string | null {
        if (typeof window === "undefined") return null
        try {
            return localStorage.getItem(key)
        } catch {
            return null
        }
    },

    setItem(key: string, value: string): void {
        if (typeof window === "undefined") return
        try {
            localStorage.setItem(key, value)
        } catch {}
        if (isSyncedKey(key)) {
            pending.set(key, { type: "upsert", value })
            scheduleFlush()
        }
    },

    removeItem(key: string): void {
        if (typeof window === "undefined") return
        try {
            localStorage.removeItem(key)
        } catch {}
        if (isSyncedKey(key)) {
            pending.set(key, { type: "delete" })
            scheduleFlush()
        }
    },
}

// jotai-compatible storage adapter (see jotai/utils atomWithStorage signature).
// Typed as SyncStorage<unknown> so atomWithStorage picks the synchronous overload.
import type { SyncStorage } from "jotai/vanilla/utils/atomWithStorage"

export const seaJotaiStorage: SyncStorage<any> = {
    getItem(key, initialValue) {
        if (typeof window === "undefined") return initialValue
        try {
            const raw = localStorage.getItem(key)
            if (raw == null) return initialValue
            return JSON.parse(raw)
        } catch {
            return initialValue
        }
    },
    setItem(key, value) {
        seaStorage.setItem(key, JSON.stringify(value))
    },
    removeItem(key) {
        seaStorage.removeItem(key)
    },
    subscribe(key, callback, initialValue) {
        if (typeof window === "undefined") return () => {}
        const handler = (e: StorageEvent) => {
            if (e.storageArea === localStorage && e.key === key) {
                try {
                    callback(e.newValue ? JSON.parse(e.newValue) : initialValue)
                } catch {
                    callback(initialValue)
                }
            }
        }
        window.addEventListener("storage", handler)
        return () => window.removeEventListener("storage", handler)
    },
}

// ─── Hydration ────────────────────────────────────────────────────────────────

/**
 * Pulls all client preferences for the current profile from the server and writes them
 * to localStorage, clobbering any local values. After this completes, queued local writes
 * begin flushing to the server.
 */
export async function hydrateClientPrefs(): Promise<void> {
    if (typeof window === "undefined") return
    if (_hydrating) return _hydrating

    const run = (async () => {
        const tokens = getTokens()
        if (!tokens.profileToken) {
            // No active profile — nothing to hydrate. Mark hydrated so future writes flush.
            _hydrated = true
            return
        }

        try {
            const data = await buildSeaQuery<Record<string, string>>({
                endpoint: API_ENDPOINTS.CLIENT_PREFS.GetClientPrefs.endpoint,
                method: "GET",
                ...tokens,
            })
            if (data && typeof data === "object") {
                for (const [k, v] of Object.entries(data)) {
                    try {
                        localStorage.setItem(k, v)
                    } catch {}
                }
            }
        } catch {
            // Silently tolerate hydration failure — local values remain in effect.
        } finally {
            _hydrated = true
            // Kick off a flush in case anything was queued before hydration finished.
            if (pending.size > 0) scheduleFlush()
        }
    })()

    _hydrating = run
    try { await run } finally { _hydrating = null }
}

/** Force-reset hydration state. Used when switching profiles. */
export function resetClientPrefsHydration() {
    _hydrated = false
    _hydrating = null
    pending.clear()
}
