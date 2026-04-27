import { INTERNAL_ProfileSummary as ProfileSummary, Status } from "@/api/generated/types"
import { atom } from "jotai"
import { atomWithImmer } from "jotai-immer"
import { atomWithStorage } from "jotai/utils"

export const serverStatusAtom = atomWithImmer<Status | undefined>(undefined)

export const isLoginModalOpenAtom = atom(false)

export const serverAuthTokenAtom = atomWithStorage<string | undefined>("sea-server-auth-token", undefined, undefined, { getOnInit: true })

// Profile system atoms
export const profileSessionTokenAtom = atomWithStorage<string | undefined>("sea-profile-token", undefined)
export const currentProfileAtom = atomWithImmer<ProfileSummary | undefined>(undefined)

// Desktop "Connect to" atoms
export const serverConnectionModeAtom = atomWithStorage<"local" | "remote">("sea-server-connection-mode", "local", undefined, { getOnInit: true })
export const remoteServerUrlAtom = atomWithStorage<string | undefined>("sea-remote-server-url", undefined, undefined, { getOnInit: true })
