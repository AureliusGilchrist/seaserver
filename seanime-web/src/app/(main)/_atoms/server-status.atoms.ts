import { INTERNAL_ProfileSummary as ProfileSummary, Status } from "@/api/generated/types"
import { atom } from "jotai"
import { atomWithImmer } from "jotai-immer"
import { atomWithStorage, createJSONStorage } from "jotai/utils"

export const serverStatusAtom = atomWithImmer<Status | undefined>(undefined)

export const isLoginModalOpenAtom = atom(false)

export const serverAuthTokenAtom = atomWithStorage<string | undefined>("sea-server-auth-token", undefined, undefined, { getOnInit: true })

/**
 * The signed-in profile's session, held for as long as the app is open and no longer.
 *
 * Kept in sessionStorage, not localStorage. A profile session is a thing the server holds: it can be
 * ended by a restart, an expiry, or a profile being removed, and none of those tell the browser. Kept
 * across launches, the token outlived the session it named and the app started up looking signed in
 * while every request it made came back "profile session required" — signed in to a session that did
 * not exist. Starting each launch with nothing to be wrong about is worth one sign-in.
 *
 * There used to be a first-launch flag here that cleared the token once, ever. That fired on the very
 * first run of the app and never again, so every launch after it inherited the stale token — the bug
 * it was written to prevent.
 *
 * sessionStorage rather than an in-memory atom because the browser login flow navigates this page to
 * AniList and back; an in-memory session would not survive the return trip, and linking an account
 * would sign you out in the middle of doing it. sessionStorage survives that, and a reload, and is
 * gone when the tab or the app closes.
 */
export const profileSessionTokenAtom = atomWithStorage<string | undefined>(
    "sea-profile-token",
    undefined,
    typeof window !== "undefined"
        ? createJSONStorage<string | undefined>(() => window.sessionStorage)
        : undefined,
    { getOnInit: true },
)
export const currentProfileAtom = atomWithImmer<ProfileSummary | undefined>(undefined)

// Desktop "Connect to" atoms
export const serverConnectionModeAtom = atomWithStorage<"local" | "remote">("sea-server-connection-mode", "local", undefined, { getOnInit: true })
export const remoteServerUrlAtom = atomWithStorage<string | undefined>("sea-remote-server-url", undefined, undefined, { getOnInit: true })
