import { ProfileSummary, Status } from "@/api/generated/types"
import { atom } from "jotai"
import { atomWithImmer } from "jotai-immer"
import { atomWithStorage } from "jotai/utils"

export const serverStatusAtom = atomWithImmer<Status | undefined>(undefined)

export const isLoginModalOpenAtom = atom(false)

export const serverAuthTokenAtom = atomWithStorage<string | undefined>("sea-server-auth-token", undefined, undefined, { getOnInit: true })

// Profile system atoms
export const profileSessionTokenAtom = atomWithStorage<string | undefined>("sea-profile-token", undefined, undefined, { getOnInit: true })
export const currentProfileAtom = atomWithImmer<ProfileSummary | undefined>(undefined)
