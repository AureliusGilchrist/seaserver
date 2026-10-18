import { WatchParty_Participant, WatchParty_Session } from "@/api/generated/types"
import {
    useWatchPartyCreate,
    useWatchPartyJoin,
    useWatchPartyLeave,
    useWatchPartyStatus,
    useWatchPartyStop,
} from "@/api/hooks/watchparty.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { watchPartyModalOpenAtom, watchPartySessionAtom } from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { useNakamaOnlineStreamWatchParty } from "@/app/(main)/onlinestream/_lib/handle-onlinestream"
import { clientIdAtom } from "@/app/websocket-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { useLatestFunction, logger } from "@/lib/helpers/debug"
import { WSEvents } from "@/lib/server/ws-events"
import { useAtom, useAtomValue } from "jotai"
import React from "react"
import { MdOutlineConnectWithoutContact } from "react-icons/md"
import { toast } from "sonner"
import { useDirectstreamPlayLocalFile } from "@/api/hooks/directstream.hooks"
import { useGetProfilesActivity } from "@/api/hooks/profile-activity.hooks"
import { ProfileActivity_Item } from "@/api/generated/types"

const log = logger("WatchTogether")

type LastStartedRef = {
    id: string | null
    epoch: number
}

export function WatchPartyManager() {
    const [isModalOpen, setIsModalOpen] = useAtom(watchPartyModalOpenAtom)
    const [, setSession] = useAtom(watchPartySessionAtom)
    const clientId = useAtomValue(clientIdAtom)

    const { startOnlineStreamWatchParty } = useNakamaOnlineStreamWatchParty()
    const { mutate: playLocalFile } = useDirectstreamPlayLocalFile()

    // Tracks the last media epoch this device auto-started, per session.
    const lastStartedRef = React.useRef<LastStartedRef>({ id: null, epoch: 0 })

    /**
     * Auto-start the source's current media on this device when the broadcast tells us
     * about media we haven't started yet (joining mid-episode, the source switching
     * episodes, or this page being (re)loaded while a party is active).
     */
    const processSession = useLatestFunction((session: WatchParty_Session | null) => {
        setSession(session)
        if (!session) {
            lastStartedRef.current = { id: null, epoch: 0 }
            return
        }
        if (session.id !== lastStartedRef.current.id) {
            lastStartedRef.current = { id: session.id, epoch: 0 }
        }
        if (!session.mediaInfo) return
        const me = session.participants?.find(p => p.clientId === clientId)
        if (!me || me.isSource) return
        if (lastStartedRef.current.epoch >= session.epoch) return
        lastStartedRef.current.epoch = session.epoch

        const mi = session.mediaInfo
        log.info("Watch together: starting session media", { streamType: mi.streamType, episode: mi.episodeNumber })
        switch (mi.streamType) {
            case "onlinestream":
                if (mi.onlinestreamParams) {
                    startOnlineStreamWatchParty(mi.onlinestreamParams)
                } else {
                    toast.warning("Watch together: the source is playing an online stream, but its parameters are unknown")
                }
                break
            case "localfile":
                if (mi.localFilePath && clientId) {
                    playLocalFile({ path: mi.localFilePath, clientId }, {
                        onError: () => {
                            toast.error("Watch together: failed to start the source's file. It may not be in your accessible library.")
                        },
                    })
                } else {
                    toast.warning("Watch together: the source is playing a local file, but its path is unknown")
                }
                break
            default:
                // torrent / debrid / nakama: no auto-start in v1
                toast.info(`Watch together: the source is playing ${mi.mediaTitle ?? "something"} — Episode ${mi.episodeNumber}`, {
                    description: "Play it yourself to join in.",
                    duration: 6000,
                })
        }
    })

    // Initial discovery of an active session (page load, reconnect).
    const { data: initialStatus } = useWatchPartyStatus(!!clientId)
    React.useEffect(() => {
        if (initialStatus !== undefined) {
            processSession(initialStatus)
        }
    }, [initialStatus, processSession])

    // Live updates.
    useWebsocketMessageListener<{ session: WatchParty_Session | null }>({
        type: WSEvents.WATCH_PARTY_STATE,
        onMessage: (payload) => {
            log.info("Watch together state received", payload?.session ? {
                id: payload.session.id,
                participants: payload.session.participants?.length,
                epoch: payload.session.epoch,
            } : null)
            processSession(payload?.session ?? null)
        },
    })

    return <WatchPartyModal />
}

function WatchPartyModal() {
    const [isModalOpen, setIsModalOpen] = useAtom(watchPartyModalOpenAtom)
    const session = useAtomValue(watchPartySessionAtom)
    const clientId = useAtomValue(clientIdAtom)

    const me = session?.participants?.find(p => p.clientId === clientId)
    const isParticipant = !!me
    const isSource = !!me?.isSource

    const { mutate: create, isPending: isCreating } = useWatchPartyCreate()
    const { mutate: join, isPending: isJoining } = useWatchPartyJoin()
    const { mutate: leave, isPending: isLeaving } = useWatchPartyLeave()
    const { mutate: stop, isPending: isStopping } = useWatchPartyStop()

    const participants = session?.participants ?? []

    return (
        <Modal
            open={isModalOpen}
            onOpenChange={setIsModalOpen}
            title={<div className="flex items-center gap-2 w-full justify-center">
                <MdOutlineConnectWithoutContact className="size-8" />
                Watch together
            </div>}
            contentClass="max-w-lg bg-gray-950 bg-opacity-90 firefox:bg-opacity-100 firefox:backdrop-blur-none sm:rounded-3xl"
            overlayClass="bg-black/80"
        >
            <div className="flex flex-col gap-4 p-2">
                <ActivitySection enabled={isModalOpen} />

                {!session && (
                    <>
                        <p className="text-[--muted] text-sm">
                            There is no watch party on this server right now. Start one with this device as the
                            source — other profiles connected to this server can then follow your playback.
                        </p>
                        <Button
                            intent="white"
                            loading={isCreating}
                            disabled={!clientId}
                            onClick={() => create({ clientId: clientId ?? "" })}
                        >
                            Start a watch party
                        </Button>
                    </>
                )}

                {session && (
                    <>
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-[--muted]">
                                {session.mediaInfo
                                    ? <span>
                                        Now playing: <span className="text-[--foreground]">{session.mediaInfo.mediaTitle}</span>
                                        {session.mediaInfo.episodeNumber > 0 && ` — Episode ${session.mediaInfo.episodeNumber}`}
                                    </span>
                                    : <span>The source isn't playing anything yet.</span>}
                            </p>
                            <Badge intent="info">{participants.length}</Badge>
                        </div>

                        <div className="flex flex-col gap-1 rounded-md border border-[--border] p-2">
                            {participants.map(p => <ParticipantRow key={p.clientId} participant={p} />)}
                        </div>

                        <p className="text-xs text-[--muted]">
                            {isSource
                                ? "You are the source. Your playback drives everyone else; only your player's controls matter."
                                : isParticipant
                                    ? "You're following the source. Your controls are disabled while the party is active."
                                    : "Join to follow the source's playback on this device."}
                        </p>

                        <div className="flex gap-2">
                            {isParticipant
                                ? <>
                                    {isSource
                                        ? <Button
                                            intent="alert"
                                            loading={isStopping}
                                            disabled={!clientId}
                                            onClick={() => stop({ clientId: clientId ?? "" })}
                                        >
                                            Stop for everyone
                                        </Button>
                                        : null}
                                    <Button
                                        intent="gray-outline"
                                        loading={isLeaving}
                                        disabled={!clientId}
                                        onClick={() => leave({ clientId: clientId ?? "" })}
                                    >
                                        {isSource ? "Leave (hands off source)" : "Leave"}
                                    </Button>
                                </>
                                : <Button
                                    intent="white"
                                    loading={isJoining}
                                    disabled={!clientId}
                                    onClick={() => join({ clientId: clientId ?? "" })}
                                >
                                    Join
                                </Button>}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    )
}

function ActivitySection({ enabled }: { enabled: boolean }) {
    const { data } = useGetProfilesActivity(enabled)
    const items = data?.items ?? []
    const others = items.filter(i => i.isOnline || i.kind === "watching" || i.kind === "reading")

    if (others.length === 0) return null

    return (
        <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wider text-[--muted]">On this server</p>
            <div className="flex flex-col gap-1 rounded-md border border-[--border] p-2">
                {others.map(item => <ActivityRow key={item.profileId} item={item} />)}
            </div>
        </div>
    )
}

function ActivityRow({ item }: { item: ProfileActivity_Item }) {
    const dot = item.isOnline ? "bg-green-500" : "bg-gray-500"
    const doing = item.kind === "watching"
        ? `Watching ${item.mediaTitle}${item.episodeNumber ? ` — Ep ${item.episodeNumber}` : ""}`
        : item.kind === "reading"
            ? `Reading ${item.mediaTitle}${item.chapterNumber ? ` — Ch ${item.chapterNumber}` : ""}`
            : "Idle"
    return (
        <div className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-[--secondary]">
            <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${dot}`} />
                <span className="text-sm">{item.username}</span>
            </div>
            <span className="text-xs text-[--muted]">{doing}</span>
        </div>
    )
}

function ParticipantRow({ participant }: { participant: WatchParty_Participant }) {
    const status = participant.playbackStatus
    return (
        <div className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-[--secondary]">
            <div className="flex items-center gap-2">
                <span className="text-sm">{participant.username || "Unknown profile"}</span>
                {participant.isSource && <Badge intent="primary-solid" size="sm">source</Badge>}
            </div>
            <span className="text-xs text-[--muted]">
                {status
                    ? `${status.paused ? "Paused" : "Playing"} · ${formatTime(status.currentTime)} / ${formatTime(status.duration)}`
                    : "idle"}
            </span>
        </div>
    )
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00"
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
}
