/**
 * seaStorage — local-first, server-synced wrapper around localStorage.
 *
 * Why this exists: Electron / Denshi installers were wiping `%APPDATA%\Seanime Denshi\Local Storage\`
 * on every reinstall, which deleted browser localStorage and reset every UI preference
 * (UI customizer, theme, easter eggs, reward progress, sound pack, etc.). This module mirrors
 * a registered set of localStorage keys to the backend (`/api/v1/client-prefs`, scoped per
 * profile by default) so the values survive across reinstalls and remote setups.
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
    // Per-profile app preferences (playback, display, manga progress)
    "sea-client-settings",
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
    // Landing page wallpaper and banner
    "sea-landing-look",
]

const GLOBAL_SYNCED_KEY_PATTERNS: readonly string[] = [
    // Wallpaper blur is shared across profiles and themes.
    "sea-global-anime-bgblur",
    // Previous global-per-theme keys are still hydrated for migration.
    "sea-global-anime-bgblur-*",
]

function matchesPattern(key: string, patterns: readonly string[]): boolean {
    return patterns.some(pattern => pattern.endsWith("*")
        ? key.startsWith(pattern.slice(0, -1))
        : key === pattern)
}

function isGlobalSyncedKey(key: string): boolean {
    return matchesPattern(key, GLOBAL_SYNCED_KEY_PATTERNS)
}

function isSyncedKey(key: string): boolean {
    return isGlobalSyncedKey(key) || matchesPattern(key, SYNCED_KEY_PATTERNS)
}

// ─── Token helpers (read directly from localStorage so seaStorage works outside React) ──

function readJsonLS(key: string): string | undefined {
    try {
        const raw = localStorage.getItem(key)
        if (raw == null) return undefined
        // jotai atomWithStorage stores JSON-encoded values; the session token uses an expiring
        // wrapper, `{ v, exp }` (see createExpiringStorage in server-status.atoms).
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed === "string") return parsed
        if (parsed && typeof parsed === "object" && typeof (parsed as { v?: unknown }).v === "string") {
            const exp = (parsed as { exp?: unknown }).exp
            if (typeof exp === "number" && Date.now() > exp) return undefined
            return (parsed as { v: string }).v
        }
        return undefined
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

/** The active profile's id, read from the session token's payload (`pid`). */
function getTokenProfileId(token: string | undefined): string | undefined {
    if (!token) return undefined
    try {
        const b64 = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
        const pid = (JSON.parse(atob(padded)) as { pid?: unknown } | null)?.pid
        return pid ? String(pid) : undefined
    } catch {
        return undefined
    }
}

// ─── Live sync across clients ─────────────────────────────────────────────────

/** This tab's id. Writes carry it so the server's broadcast of the change can be ignored here. */
export const SEA_PREF_ORIGIN_ID: string = (() => {
    try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
})()

/** Fired (detail: { key }) after a preference changed on another client was written locally. */
export const SEA_PREF_REMOTE_CHANGE_EVENT = "sea-client-pref-remote-change"

export type ClientPrefUpdatedPayload = {
    key: string
    value: string
    deleted: boolean
    scope: "profile" | "global"
    origin: string
}

/**
 * Applies a preference the same profile changed on another client (web, Denshi, Denshi Mobile),
 * pushed over the websocket. A local edit that has not reached the server yet wins.
 *
 * Consumers that read through jotai's `seaJotaiStorage`, `useClientSettings`, a `storage`
 * listener or SEA_PREF_REMOTE_CHANGE_EVENT update at once; the rest on their next mount.
 */
export function applyRemoteClientPref(payload: ClientPrefUpdatedPayload | null | undefined) {
    if (typeof window === "undefined" || !payload?.key) return
    if (payload.origin && payload.origin === SEA_PREF_ORIGIN_ID) return
    const key = payload.key
    if (!isSyncedKey(key) || pending.has(key)) return
    if ((payload.scope === "global") !== isGlobalSyncedKey(key)) return
    // Before hydration the profile's values are still being fetched, and they include this change.
    if (!_hydrated) return

    let oldValue: string | null = null
    try { oldValue = localStorage.getItem(key) } catch {}
    const newValue = payload.deleted ? null : payload.value
    if (oldValue === newValue) return
    try {
        if (newValue === null) localStorage.removeItem(key)
        else localStorage.setItem(key, newValue)
    } catch {
        return
    }
    try {
        window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue, storageArea: localStorage, url: window.location.href }))
    } catch {}
    window.dispatchEvent(new CustomEvent(SEA_PREF_REMOTE_CHANGE_EVENT, { detail: { key } }))
    if (key === "sea-client-settings") window.dispatchEvent(new Event("sea-client-settings-changed"))
}

// ─── Pending write queue ──────────────────────────────────────────────────────

type PendingOp = { type: "upsert"; value: string } | { type: "delete" }
const pending = new Map<string, PendingOp>()

/**
 * Keys written locally that have not reached the server yet, kept in localStorage (not synced) so
 * an edit made offline or just before a reload survives it: hydration uploads them instead of
 * replacing or dropping them.
 */
const UNSYNCED_KEY_PREFIX = "sea-prefs-unsynced-"

/** Unsynced edits are kept per profile (and "global"), each with the value written, so a profile
 * switch before the upload never hands one profile's edit to another. null = a removal. */
type UnsyncedEdits = Record<string, string | null>

function unsyncedStoreKey(key: string, profileId?: string): string {
    if (isGlobalSyncedKey(key)) return `${UNSYNCED_KEY_PREFIX}global`
    return `${UNSYNCED_KEY_PREFIX}${profileId ?? getTokenProfileId(getTokens().profileToken) ?? "default"}`
}

function readUnsynced(storeKey: string): UnsyncedEdits {
    try {
        const raw = localStorage.getItem(storeKey)
        const obj: unknown = raw ? JSON.parse(raw) : {}
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {}
        const out: UnsyncedEdits = {}
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (typeof v === "string" || v === null) out[k] = v
        }
        return out
    } catch {
        return {}
    }
}

function writeUnsynced(storeKey: string, edits: UnsyncedEdits) {
    try {
        if (Object.keys(edits).length === 0) localStorage.removeItem(storeKey)
        else localStorage.setItem(storeKey, JSON.stringify(edits))
    } catch {}
}

function markUnsynced(key: string, value: string | null) {
    const storeKey = unsyncedStoreKey(key)
    const edits = readUnsynced(storeKey)
    if (key in edits && edits[key] === value) return
    edits[key] = value
    writeUnsynced(storeKey, edits)
}

function markSynced(key: string, value: string | null, profileId: string | undefined) {
    const storeKey = unsyncedStoreKey(key, profileId)
    const edits = readUnsynced(storeKey)
    // Only when what reached the server is still the latest local edit.
    if (!(key in edits) || edits[key] !== value) return
    delete edits[key]
    writeUnsynced(storeKey, edits)
}

/**
 * Per device and profile: whether this profile already reconciled its keys on this device. The
 * first profile hydrated on a device after the upgrade uploads every synced key that exists only
 * locally (set before syncing existed, or never written since); every profile's own suffixed keys
 * (`…-<id>`) go to that profile on its first hydration. After that the server is the whole truth:
 * local keys the profile does not have are dropped, so one profile's leftovers never show for
 * another on a shared device.
 */
const DEVICE_MIGRATED_KEY_PREFIX = "sea-prefs-device-migrated-"
/** Set once any profile carried this device's legacy (pre-sync) local values. */
const DEVICE_MIGRATED_KEY = "sea-prefs-device-migrated"
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_DEBOUNCE_MS = 400

let _hydrated = false
let _hydrating: Promise<void> | null = null
let _hydrationGeneration = 0

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

    for (let i = 0; i < ops.length; i++) {
        const [key, op] = ops[i]
        try {
            const scope = `?${isGlobalSyncedKey(key) ? "scope=global&" : ""}origin=${encodeURIComponent(SEA_PREF_ORIGIN_ID)}`
            if (op.type === "upsert") {
                await buildSeaQuery({
                    endpoint: `${API_ENDPOINTS.CLIENT_PREFS.UpsertClientPref.endpoint}${scope}`,
                    method: "PUT",
                    data: { key, value: op.value },
                    ...tokens,
                })
            } else {
                await buildSeaQuery({
                    endpoint: `${API_ENDPOINTS.CLIENT_PREFS.DeleteClientPref.endpoint.replace(":key", encodeURIComponent(key))}${scope}`,
                    method: "DELETE",
                    ...tokens,
                })
            }
            markSynced(key, op.type === "upsert" ? op.value : null, getTokenProfileId(tokens.profileToken))
        } catch (err) {
            // Re-queue this op and the ones not tried yet (don't clobber a newer write).
            for (const [k, o] of ops.slice(i)) {
                if (!pending.has(k)) pending.set(k, o)
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
            markUnsynced(key, value)
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
            markUnsynced(key, null)
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
 * Pulls profile and global client preferences into localStorage. Unsynced local edits take
 * precedence, and global keys are never hydrated from profile-scoped data.
 */
export async function hydrateClientPrefs(): Promise<void> {
    if (typeof window === "undefined") return
    if (_hydrating) return _hydrating

    const generation = ++_hydrationGeneration
    const run = (async () => {
        const tokens = getTokens()
        if (!tokens.profileToken) {
            // No active profile — nothing to hydrate. Mark hydrated so future writes flush.
            if (generation === _hydrationGeneration) _hydrated = true
            return
        }

        try {
            const data = await buildSeaQuery<Record<string, string>>({
                endpoint: API_ENDPOINTS.CLIENT_PREFS.GetClientPrefs.endpoint,
                method: "GET",
                ...tokens,
            })
            if (generation !== _hydrationGeneration) return
            if (data && typeof data === "object") {
                const profileId = getTokenProfileId(tokens.profileToken)
                const unsynced = readUnsynced(`${UNSYNCED_KEY_PREFIX}${profileId ?? "default"}`)
                for (const [k, v] of Object.entries(data)) {
                    if (isGlobalSyncedKey(k) || pending.has(k) || k in unsynced) continue
                    try {
                        localStorage.setItem(k, v)
                    } catch {}
                }
                reconcileLocalProfileKeys(data, unsynced, profileId)
            }
            const globalData = await buildSeaQuery<Record<string, string>>({
                endpoint: `${API_ENDPOINTS.CLIENT_PREFS.GetClientPrefs.endpoint}?scope=global`,
                method: "GET",
                ...tokens,
            })
            if (generation !== _hydrationGeneration) return
            if (globalData && typeof globalData === "object") {
                const unsynced = readUnsynced(`${UNSYNCED_KEY_PREFIX}global`)
                for (const [k, v] of Object.entries(unsynced)) {
                    if (isGlobalSyncedKey(k) && !pending.has(k)) pending.set(k, v === null ? { type: "delete" } : { type: "upsert", value: v })
                }
                for (const [k, v] of Object.entries(globalData)) {
                    if (!isGlobalSyncedKey(k) || pending.has(k) || k in unsynced) continue
                    try {
                        localStorage.setItem(k, v)
                    } catch {}
                }
            }
        } catch (error) {
            // Keep local values in effect when the server cannot be reached.
            if (generation === _hydrationGeneration) {
                console.warn("[seaStorage] Client preference hydration failed", error)
            }
        } finally {
            if (generation === _hydrationGeneration) {
                _hydrated = true
                window.dispatchEvent(new Event("sea-client-prefs-hydrated"))
                // Kick off a flush in case anything was queued before hydration finished.
                if (pending.size > 0) scheduleFlush()
            }
        }
    })()

    _hydrating = run
    try { await run } finally {
        if (_hydrating === run) _hydrating = null
    }
}

/**
 * After the profile's server values are in localStorage:
 *  - the profile's unsynced edits (made offline or just before a reload) are put back and queued;
 *  - on the profile's first hydration on this device, every synced key that exists only locally
 *    is queued for upload, so the setup this device had is carried into the profile;
 *  - on later hydrations, local keys the profile does not have are dropped, so another profile's
 *    leftovers on a shared device never show.
 */
function reconcileLocalProfileKeys(serverData: Record<string, string>, unsynced: UnsyncedEdits, profileId: string | undefined) {
    const migratedKey = `${DEVICE_MIGRATED_KEY_PREFIX}${profileId ?? "default"}`
    let migrated = false
    try { migrated = localStorage.getItem(migratedKey) === "1" } catch {}

    for (const [k, v] of Object.entries(unsynced)) {
        if (isGlobalSyncedKey(k) || pending.has(k)) continue
        try {
            if (v === null) localStorage.removeItem(k)
            else localStorage.setItem(k, v)
        } catch {}
        pending.set(k, v === null ? { type: "delete" } : { type: "upsert", value: v })
    }

    const localKeys: string[] = []
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k && isSyncedKey(k) && !isGlobalSyncedKey(k)) localKeys.push(k)
        }
    } catch {
        return
    }

    let deviceMigrated = false
    try { deviceMigrated = localStorage.getItem(DEVICE_MIGRATED_KEY) === "1" } catch {}
    const self = profileId ?? "default"

    for (const k of localKeys) {
        if (k in serverData || pending.has(k) || k in unsynced) continue
        const owner = keyOwnerProfileId(k)
        // Another profile's own key (e.g. sea-ui-customize-3): never read under this profile, and
        // left for that profile's own first hydration to carry over.
        if (owner !== undefined && owner !== self) continue

        // Legacy local values go to the first profile hydrated on this device after the upgrade
        // (and a profile's own suffixed keys to that profile); anything else local-only is a
        // copy another profile left behind.
        const carry = !migrated && (!deviceMigrated || owner === self)
        if (carry) {
            let v: string | null = null
            try { v = localStorage.getItem(k) } catch {}
            if (v !== null) {
                pending.set(k, { type: "upsert", value: v })
                markUnsynced(k, v)
            }
        } else {
            try { localStorage.removeItem(k) } catch {}
        }
    }

    try {
        if (!migrated) localStorage.setItem(migratedKey, "1")
        if (!deviceMigrated) localStorage.setItem(DEVICE_MIGRATED_KEY, "1")
    } catch {}
}

/** The profile id a key is scoped to by name (`sea-ui-customize-3`, `sea-anime-color-3-<theme>`). */
function keyOwnerProfileId(key: string): string | undefined {
    return key.match(/-(\d+)(?:-|$)/)?.[1]
}

/** Reset profile hydration while preserving unsynced global preferences. */
export function resetClientPrefsHydration() {
    _hydrationGeneration++
    _hydrated = false
    _hydrating = null
    for (const key of pending.keys()) {
        if (!isGlobalSyncedKey(key)) pending.delete(key)
    }
}
