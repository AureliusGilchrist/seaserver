import { WatchParty_ChatMessage, WatchParty_Session } from "@/api/generated/types"
import { clientIdAtom } from "@/app/websocket-provider"
import { atom, useAtomValue } from "jotai"

/** Every open room on this server (undefined until the first status arrives). */
export const watchPartySessionsAtom = atom<Array<WatchParty_Session> | undefined>(undefined)

/** The room this device is seated in, or null. */
export const watchPartySessionAtom = atom<WatchParty_Session | null | undefined>(get => {
    const sessions = get(watchPartySessionsAtom)
    const clientId = get(clientIdAtom)
    if (sessions === undefined) return undefined
    if (!clientId || !Array.isArray(sessions)) return null
    return sessions.find(s => s?.participants?.some(p => p.clientId === clientId)) ?? null
})

/** Chat lines of the room this device is seated in. */
export const watchPartyChatMessagesAtom = atom<Array<WatchParty_ChatMessage>>([])

/** Chat lines received while the room page wasn't open. */
export const watchPartyUnreadCountAtom = atom(0)

/** True while the room page is mounted (the player is laid out next to the chat). */
export const watchPartyRoomPageOpenAtom = atom(false)

/** The last room media generation (epoch) this device started, so it's started only once. */
export const watchPartyLastStartedAtom = atom<{ id: string | null, epoch: number }>({ id: null, epoch: 0 })

/**
 * The room list as sent by the server. Anything that isn't a list (an older server sends a
 * single session object or null) is treated as "no rooms" instead of crashing the app.
 */
export function toSessionList(value: unknown): Array<WatchParty_Session> {
    if (!Array.isArray(value)) return []
    return value.filter((s): s is WatchParty_Session => !!s && typeof s === "object" && typeof (s as any).id === "string")
}

/**
 * True when this device is in a watch party room but does not hold the remote — i.e. its
 * playback is driven by the remote holder and it must not act on its own (auto-next,
 * auto-skip, resume from continuity, …).
 */
export function useIsWatchTogetherFollower() {
    const session = useAtomValue(watchPartySessionAtom)
    const clientId = useAtomValue(clientIdAtom)
    if (!session || !clientId) return false
    const me = session.participants?.find(p => p.clientId === clientId)
    return !!me && !me.isSource
}

/** This device's seat and whether it holds the remote. */
export function useWatchPartyMe() {
    const session = useAtomValue(watchPartySessionAtom)
    const clientId = useAtomValue(clientIdAtom)
    const me = session?.participants?.find(p => p.clientId === clientId) ?? null
    return { session: session ?? null, me, hasRemote: !!me?.isSource, clientId }
}
