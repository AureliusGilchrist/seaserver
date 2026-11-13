import { WatchParty_ChatMessage, WatchParty_Session } from "@/api/generated/types"
import { useWatchPartyChatHistory, useWatchPartyStatus } from "@/api/hooks/watchparty.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import {
    watchPartyChatMessagesAtom,
    watchPartyLastStartedAtom,
    watchPartyRoomPageOpenAtom,
    watchPartySessionAtom,
    watchPartySessionsAtom,
    watchPartyUnreadCountAtom,
} from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { useNakamaOnlineStreamWatchParty } from "@/app/(main)/onlinestream/_lib/handle-onlinestream"
import { clientIdAtom } from "@/app/websocket-provider"
import { logger, useLatestFunction } from "@/lib/helpers/debug"
import { useRouter } from "@/lib/navigation"
import { WSEvents } from "@/lib/server/ws-events"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import React from "react"
import { toast } from "sonner"

const log = logger("WatchTogether")

/**
 * Keeps the room list, this device's chat and the "follow the remote" behaviour running
 * app-wide. The room itself (player + chat) is the /watch-party page.
 */
export function WatchPartyManager() {
    const router = useRouter()
    const clientId = useAtomValue(clientIdAtom)
    const setSessions = useSetAtom(watchPartySessionsAtom)
    const mySession = useAtomValue(watchPartySessionAtom)
    const [, setMessages] = useAtom(watchPartyChatMessagesAtom)
    const setUnread = useSetAtom(watchPartyUnreadCountAtom)
    const roomPageOpen = useAtomValue(watchPartyRoomPageOpenAtom)
    const [lastStarted, setLastStarted] = useAtom(watchPartyLastStartedAtom)

    const { startOnlineStreamWatchParty } = useNakamaOnlineStreamWatchParty()

    // Initial discovery of the open rooms (page load, reconnect).
    const { data: initialStatus } = useWatchPartyStatus(!!clientId)
    React.useEffect(() => {
        if (initialStatus !== undefined) {
            setSessions(initialStatus ?? [])
        }
    }, [initialStatus])

    // Live room updates.
    useWebsocketMessageListener<{ sessions: WatchParty_Session[] | null }>({
        type: WSEvents.WATCH_PARTY_STATE,
        onMessage: (payload) => {
            log.info("Watch party rooms", payload?.sessions?.map(s => ({ id: s.id, participants: s.participants?.length, epoch: s.epoch })))
            setSessions(payload?.sessions ?? [])
        },
    })

    // Chat history whenever this device lands in a (different) room.
    const { mutate: fetchHistory } = useWatchPartyChatHistory()
    const mySessionId = mySession?.id ?? null
    React.useEffect(() => {
        setMessages([])
        setUnread(0)
        if (!mySessionId || !clientId) return
        fetchHistory({ clientId }, {
            onSuccess: (history) => {
                setMessages(prev => mergeMessages(history ?? [], prev))
            },
        })
    }, [mySessionId, clientId])

    // Reset the auto-start bookkeeping when the room changes.
    React.useEffect(() => {
        if (lastStarted.id !== mySessionId) {
            setLastStarted({ id: mySessionId, epoch: 0 })
        }
    }, [mySessionId])

    // Live chat.
    const onChat = useLatestFunction((msg: WatchParty_ChatMessage) => {
        if (!mySession || msg.sessionId !== mySession.id) return
        setMessages(prev => mergeMessages(prev, [msg]))
        if (roomPageOpen) return
        const me = mySession.participants?.find(p => p.clientId === clientId)
        if (msg.kind === "user" && msg.profileId === me?.profileId) return
        setUnread(n => n + 1)
        toast(msg.kind === "system" ? msg.text : `${msg.username}: ${msg.text}`, {
            id: `wp-chat-${msg.sessionId}`,
            description: "Watch party",
            action: { label: "Open", onClick: () => router.push("/watch-party") },
        })
    })
    useWebsocketMessageListener<{ message: WatchParty_ChatMessage }>({
        type: WSEvents.WATCH_PARTY_CHAT,
        onMessage: (payload) => {
            if (payload?.message) onChat(payload.message)
        },
    })

    /**
     * Follow the remote. Local files play in the room's own player, so a follower who is
     * elsewhere in the app is brought to the room. Online streams can't play there yet:
     * they're started on the online stream page instead.
     */
    React.useEffect(() => {
        if (!mySession?.mediaInfo || !clientId) return
        const me = mySession.participants?.find(p => p.clientId === clientId)
        if (!me || me.isSource) return
        if (lastStarted.id !== mySession.id || lastStarted.epoch >= mySession.epoch) return

        const mi = mySession.mediaInfo
        switch (mi.streamType) {
            case "localfile":
                if (!roomPageOpen) {
                    log.info("Watch party: the remote started a local file, opening the room")
                    router.push("/watch-party")
                }
                // The room page starts it.
                break
            case "onlinestream":
                setLastStarted({ id: mySession.id, epoch: mySession.epoch })
                if (mi.onlinestreamParams) {
                    startOnlineStreamWatchParty(mi.onlinestreamParams)
                } else {
                    toast.warning("Watch party: the remote is on an online stream, but its parameters are unknown")
                }
                break
            default:
                setLastStarted({ id: mySession.id, epoch: mySession.epoch })
                toast.info(`Watch party: the remote is playing ${mi.mediaTitle ?? "something"} — Episode ${mi.episodeNumber}`, {
                    description: "This kind of stream can't be mirrored automatically. Play it yourself to follow along.",
                    duration: 6000,
                })
        }
    }, [mySession?.id, mySession?.epoch, mySession?.mediaInfo, clientId, roomPageOpen, lastStarted])

    return null
}

function mergeMessages(a: WatchParty_ChatMessage[], b: WatchParty_ChatMessage[]) {
    const seen = new Set<string>()
    const out: WatchParty_ChatMessage[] = []
    for (const m of [...a, ...b]) {
        if (seen.has(m.id)) continue
        seen.add(m.id)
        out.push(m)
    }
    out.sort((x, y) => (Date.parse(x.timestamp ?? "") || 0) - (Date.parse(y.timestamp ?? "") || 0))
    return out.slice(-200)
}
