import { INTERNAL_ProfileSummary as ProfileSummary, Status } from "@/api/generated/types"
import { atom } from "jotai"
import { atomWithImmer } from "jotai-immer"
import { atomWithStorage, createJSONStorage } from "jotai/utils"

export const serverStatusAtom = atomWithImmer<Status | undefined>(undefined)

export const isLoginModalOpenAtom = atom(false)

export const serverAuthTokenAtom = atomWithStorage<string | undefined>("sea-server-auth-token", undefined, undefined, { getOnInit: true })

const PROFILE_TOKEN_KEY = "sea-profile-token"
const LAUNCH_ID_KEY = "sea-launch-id"

/**
 * Discards any stored profile session that belongs to an earlier run of the desktop app.
 *
 * Signing in is required on every launch, however the last one ended — closed, crashed, killed, the
 * machine powered off. The difficulty is that the page cannot tell a launch from a reload on its
 * own: the session lives in sessionStorage, which survives a reload deliberately, because linking an
 * AniList account navigates this page away and back and a session that did not survive that would
 * sign you out in the middle of doing it.
 *
 * So the desktop app supplies the missing fact. It generates an id for each run, in memory and never
 * written to disk, and hands it to the page. A stored session recorded under a different id belongs
 * to a run that is over, and goes. A reload — or the return trip from AniList — carries the same id
 * and keeps its session, which is the distinction sessionStorage alone could not draw.
 *
 * Run at module load, before the atom below reads storage, so the value it discards is never seen.
 * In a plain browser there is no launch id and nothing to do: closing the tab already ends the
 * session, which is the same guarantee by a different route.
 */
function discardSessionFromPreviousLaunch() {
    if (typeof window === "undefined") return

    const launchId = (window as any)?.electron?.session?.launchId
    if (!launchId || typeof launchId !== "string") return

    try {
        if (window.sessionStorage.getItem(LAUNCH_ID_KEY) === launchId) return
        window.sessionStorage.removeItem(PROFILE_TOKEN_KEY)
        window.sessionStorage.setItem(LAUNCH_ID_KEY, launchId)
    }
    catch {
        // Storage unavailable (private mode, locked down webview). Nothing is stored, so nothing
        // can be carried over, which is the outcome this function exists to produce.
    }
}

discardSessionFromPreviousLaunch()

/**
 * The signed-in profile's session, held for as long as the app is open and no longer.
 *
 * Kept in sessionStorage, not localStorage. A profile session is a thing the server holds: it can be
 * ended by a restart, an expiry, or a profile being removed, and none of those tell the browser. Kept
 * across launches, the token outlived the session it named and the app started up looking signed in
 * while every request it made came back "profile session required" — signed in to a session that did
 * not exist.
 *
 * There used to be a first-launch flag here that cleared the token once, ever. That fired on the very
 * first run of the app and never again, so every launch after it inherited the stale token — the bug
 * it was written to prevent. What replaces it is the launch id above, which is different on every
 * run and so cannot go stale.
 *
 * sessionStorage rather than an in-memory atom because the browser login flow navigates this page to
 * AniList and back; an in-memory session would not survive the return trip, and linking an account
 * would sign you out in the middle of doing it. sessionStorage survives that, and a reload, and is
 * gone when the tab or the app closes.
 */
export const profileSessionTokenAtom = atomWithStorage<string | undefined>(
    PROFILE_TOKEN_KEY,
    undefined,
    typeof window !== "undefined"
        ? createJSONStorage<string | undefined>(() => window.sessionStorage)
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
