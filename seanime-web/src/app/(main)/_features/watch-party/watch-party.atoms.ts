import { WatchParty_Session } from "@/api/generated/types"
import { clientIdAtom } from "@/app/websocket-provider"
import { atom, useAtomValue } from "jotai"

export const watchPartySessionAtom = atom<WatchParty_Session | null | undefined>(undefined)

export const watchPartyModalOpenAtom = atom(false)

/**
 * True when this device is in the active watch party but is not the source — i.e. its
 * playback is driven by the source and it must not act on its own (auto-next, resume
 * from continuity, …).
 */
export function useIsWatchTogetherFollower() {
    const session = useAtomValue(watchPartySessionAtom)
    const clientId = useAtomValue(clientIdAtom)
    if (!session || !session.mediaInfo || !clientId) return false
    const me = session.participants?.find(p => p.clientId === clientId)
    return !!me && !me.isSource
}
