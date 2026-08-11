import { INTERNAL_ProfileSummary as ProfileSummary, Status } from "@/api/generated/types"
import { atom } from "jotai"
import { atomWithImmer } from "jotai-immer"
import { atomWithStorage } from "jotai/utils"

export const serverStatusAtom = atomWithImmer<Status | undefined>(undefined)

export const isLoginModalOpenAtom = atom(false)

export const serverAuthTokenAtom = atomWithStorage<string | undefined>("sea-server-auth-token", undefined, undefined, { getOnInit: true })

const PROFILE_TOKEN_KEY = "sea-profile-token"
const LAUNCH_ID_KEY = "sea-launch-id"

/** How long a stored session stands without the app being opened. Matches the server's own day. */
const PROFILE_SESSION_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Discards any stored profile session that belongs to an earlier run of the desktop app.
 *
 * Signing in is required on every launch of the desktop client, however the last one ended — closed,
 * crashed, killed, the machine powered off — and on every close to the tray, which is closing the
 * client as far as anyone using it is concerned. The difficulty is that the page cannot tell a
 * launch from a reload on its own, and the session deliberately survives a reload: linking an
 * AniList account navigates this page away and back, and a session that did not survive that would
 * sign you out in the middle of doing it.
 *
 * So the desktop app supplies the missing fact. It generates an id for each run — and a fresh one
 * whenever the window is hidden to the tray — in memory and never written to disk, and hands it to
 * the page. A stored session recorded under a different id belongs to a run that is over, and goes.
 * A reload, or the return trip from AniList, carries the same id and keeps its session.
 *
 * The id itself is kept in sessionStorage while the token is not, and that pairing is the whole
 * mechanism: sessionStorage is empty in a newly created window, so a relaunch reads no id, finds a
 * mismatch, and clears the token that localStorage carried over.
 *
 * Run at module load, before the atom below reads storage, so the value it discards is never seen.
 * In a plain browser there is no launch id and nothing to do; the session simply stands until it
 * expires, which is the point of keeping it where a closed tab cannot take it.
 */
function discardSessionFromPreviousLaunch() {
    if (typeof window === "undefined") return

    const launchId = (window as any)?.electron?.session?.launchId
    if (!launchId || typeof launchId !== "string") return

    try {
        if (window.sessionStorage.getItem(LAUNCH_ID_KEY) === launchId) return
        window.localStorage.removeItem(PROFILE_TOKEN_KEY)
        window.sessionStorage.setItem(LAUNCH_ID_KEY, launchId)
    }
    catch {
        // Storage unavailable (private mode, locked down webview). Nothing is stored, so nothing
        // can be carried over, which is the outcome this function exists to produce.
    }
}

discardSessionFromPreviousLaunch()

/**
 * localStorage with a use-by date, for the session token.
 *
 * The token is stored as `{ v, exp }` and read back as nothing at all once `exp` has passed, so a
 * session cannot sit in storage indefinitely waiting to be presented to a server that will refuse
 * it. The day it lasts is the same day the server gives it, and the server rolls its own copy over
 * on use — a written token is always the freshest one the server has handed back, so an app in use
 * never reaches the limit and an app left alone for a day asks for a PIN.
 *
 * Anything unreadable — the old bare-string format, a half-written value, a locked-down storage —
 * reads as no session rather than throwing, because a storage backend that throws on read takes the
 * whole app down with it.
 */
function createExpiringStorage(ttlMs: number) {
    return {
        getItem: (key: string, initialValue: string | undefined) => {
            try {
                const raw = window.localStorage.getItem(key)
                if (!raw) return initialValue
                const parsed = JSON.parse(raw) as { v?: unknown, exp?: unknown }
                if (typeof parsed?.v !== "string" || typeof parsed?.exp !== "number") return initialValue
                if (Date.now() > parsed.exp) {
                    window.localStorage.removeItem(key)
                    return initialValue
                }
                return parsed.v
            }
            catch {
                return initialValue
            }
        },
        setItem: (key: string, value: string | undefined) => {
            try {
                if (!value) {
                    window.localStorage.removeItem(key)
                    return
                }
                window.localStorage.setItem(key, JSON.stringify({ v: value, exp: Date.now() + ttlMs }))
            }
            catch {
            }
        },
        removeItem: (key: string) => {
            try {
                window.localStorage.removeItem(key)
            }
            catch {
            }
        },
    }
}

/**
 * The signed-in profile's session.
 *
 * Kept for a day, renewed whenever the app is used, and ended by closing the desktop client or
 * hiding it to the tray — the launch id above is what draws that last distinction.
 *
 * It used to live in sessionStorage and be thrown away by any restart of the server, on the
 * reasoning that a session the server no longer held would leave the app looking signed in while
 * every request came back "profile session required". That is not what a restart does: everything a
 * session names is looked up by profile ID from disk on demand, and the server now reissues a
 * session from an earlier run rather than refusing it. What the old rule did in practice was ask for
 * a PIN every time the server came back up, which on a server that restarts a few times an hour is
 * a PIN prompt a few times an hour.
 *
 * Storage rather than an in-memory atom because the browser login flow navigates this page to
 * AniList and back; an in-memory session would not survive the return trip, and linking an account
 * would sign you out in the middle of doing it.
 */
export const profileSessionTokenAtom = atomWithStorage<string | undefined>(
    PROFILE_TOKEN_KEY,
    undefined,
    typeof window !== "undefined"
        ? createExpiringStorage(PROFILE_SESSION_TTL_MS)
        : undefined,
    { getOnInit: true },
)
export const currentProfileAtom = atomWithImmer<ProfileSummary | undefined>(undefined)

/**
 * Set when the server refuses the session, to send the app back to profile selection at once.
 *
 * Clearing the token alone is not enough to *show* the login screen: which screen is drawn comes
 * from the server status, and that is only re-read on its own schedule. Until it was, the app went
 * on rendering the signed-in UI over a session the server had already rejected — every request
 * answering "profile session required" while nothing offered a way to sign in again.
 */
export const profileSessionEndedAtom = atom(false)

// Desktop "Connect to" atoms
export const serverConnectionModeAtom = atomWithStorage<"local" | "remote">("sea-server-connection-mode", "local", undefined, { getOnInit: true })
export const remoteServerUrlAtom = atomWithStorage<string | undefined>("sea-remote-server-url", undefined, undefined, { getOnInit: true })
