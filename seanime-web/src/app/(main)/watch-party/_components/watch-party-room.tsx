import { WatchParty_Participant, WatchParty_Session } from "@/api/generated/types"
import {
    useWatchPartyLeave,
    useWatchPartyPassRemote,
    useWatchPartyRequestRemote,
    useWatchPartyStop,
} from "@/api/hooks/watchparty.hooks"
import { watchPartyRoomPageOpenAtom, watchPartyUnreadCountAtom } from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { WatchPartyChat } from "@/app/(main)/watch-party/_components/watch-party-chat"
import { WatchPartyPicker } from "@/app/(main)/watch-party/_components/watch-party-picker"
import { RoomPlayRequest, WatchPartyPlayer } from "@/app/(main)/watch-party/_components/watch-party-player"
import { clientIdAtom } from "@/app/websocket-provider"
import { Button, IconButton } from "@/components/ui/button"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/components/ui/core/styling"
import { useRouter } from "@/lib/navigation"
import { __isDesktop__, __isElectronDesktop__ } from "@/types/constants"
import { useAtomValue, useSetAtom } from "jotai"
import React from "react"
import { LuArrowLeft, LuLogOut, LuPower, LuUsers } from "react-icons/lu"
import { MdOutlineSettingsRemote } from "react-icons/md"

export function WatchPartyRoom({ session }: { session: WatchParty_Session }) {
    const router = useRouter()
    const clientId = useAtomValue(clientIdAtom)
    const setRoomPageOpen = useSetAtom(watchPartyRoomPageOpenAtom)
    const setUnread = useSetAtom(watchPartyUnreadCountAtom)

    const me = session.participants?.find(p => p.clientId === clientId)
    const hasRemote = !!me?.isSource
    const holder = session.participants?.find(p => p.isSource)

    React.useEffect(() => {
        setRoomPageOpen(true)
        setUnread(0)
        return () => setRoomPageOpen(false)
    }, [])

    const { mutate: leave, isPending: isLeaving } = useWatchPartyLeave()
    const { mutate: stop, isPending: isStopping } = useWatchPartyStop()
    const { mutate: requestRemote, isPending: isRequesting } = useWatchPartyRequestRemote()

    const [pickerOpen, setPickerOpen] = React.useState(false)
    const [playRequest, setPlayRequest] = React.useState<RoomPlayRequest | null>(null)

    const mi = session.mediaInfo

    return (
        <div
            data-watch-party-room
            className={cn(
                "fixed inset-0 z-[45] bg-[#0b0b0f] text-[--foreground] flex flex-col lg:flex-row",
                __isElectronDesktop__ && "top-10",
                __isDesktop__ && "top-8",
            )}
        >
            {/* Stage */}
            <div className="flex flex-col min-w-0 lg:flex-1 lg:h-full">
                <header className="flex items-center gap-3 px-3 lg:px-4 h-14 shrink-0 border-b border-white/5">
                    <Tooltip trigger={<IconButton
                        intent="gray-basic"
                        size="sm"
                        icon={<LuArrowLeft />}
                        onClick={() => router.push("/")}
                    />}>
                        Back to the app (you stay in the room)
                    </Tooltip>
                    <div className="flex flex-col min-w-0 flex-1">
                        <p className="font-semibold truncate leading-tight">{session.name}</p>
                        <p className="text-xs text-[--muted] truncate">
                            {mi
                                ? <>{mi.mediaTitle}{mi.episodeNumber > 0 && ` · Episode ${mi.episodeNumber}`}</>
                                : "Nothing playing yet"}
                        </p>
                    </div>
                    {hasRemote && (
                        <Button
                            size="sm"
                            intent="primary"
                            leftIcon={<MdOutlineSettingsRemote className="size-4" />}
                            onClick={() => setPickerOpen(true)}
                        >
                            <span className="hidden sm:inline">Pick something</span>
                            <span className="sm:hidden">Pick</span>
                        </Button>
                    )}
                    {hasRemote && (session.participants?.length ?? 0) > 1 && (
                        <Tooltip trigger={<IconButton
                            intent="alert-basic"
                            size="sm"
                            icon={<LuPower />}
                            loading={isStopping}
                            onClick={() => clientId && stop({ clientId })}
                        />}>
                            End the watch party for everyone
                        </Tooltip>
                    )}
                    <Tooltip trigger={<IconButton
                        intent="gray-basic"
                        size="sm"
                        icon={<LuLogOut />}
                        loading={isLeaving}
                        onClick={() => clientId && leave({ clientId })}
                    />}>
                        {hasRemote && (session.participants?.length ?? 0) > 1 ? "Leave (the remote goes to someone else)" : "Leave the room"}
                    </Tooltip>
                </header>

                <div className="relative bg-black aspect-video w-full lg:aspect-auto lg:flex-1 lg:min-h-0">
                    <WatchPartyPlayer
                        session={session}
                        hasRemote={hasRemote}
                        playRequest={playRequest}
                        onOpenPicker={() => setPickerOpen(true)}
                    />
                </div>

                <div className="hidden lg:flex items-center gap-3 px-4 h-12 shrink-0 border-t border-white/5 text-sm">
                    <MdOutlineSettingsRemote className="size-5 text-[--brand]" />
                    {hasRemote
                        ? <span>You have the remote — play, pause and seek here and everyone follows.</span>
                        : <span className="text-[--muted]"><span className="text-[--foreground]">{holder?.username}</span> has the remote. Your player follows theirs.</span>}
                    {!hasRemote && (
                        <Button
                            size="sm"
                            intent="gray-subtle"
                            className="ml-auto"
                            loading={isRequesting}
                            onClick={() => clientId && requestRemote({ clientId })}
                        >
                            Ask for the remote
                        </Button>
                    )}
                </div>
            </div>

            {/* Sidebar: people + chat */}
            <aside className="flex flex-col min-h-0 flex-1 lg:flex-none lg:w-[360px] lg:h-full border-t lg:border-t-0 lg:border-l border-white/5 bg-[#101016]">
                <People session={session} me={me} hasRemote={hasRemote} />
                {!hasRemote && (
                    <div className="lg:hidden px-3 pb-2">
                        <Button
                            size="sm"
                            intent="gray-subtle"
                            className="w-full"
                            loading={isRequesting}
                            onClick={() => clientId && requestRemote({ clientId })}
                        >
                            Ask {holder?.username ?? "them"} for the remote
                        </Button>
                    </div>
                )}
                <WatchPartyChat session={session} me={me} />
            </aside>

            <WatchPartyPicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onPick={(mediaId, path) => {
                    setPickerOpen(false)
                    setPlayRequest({ mediaId, path, nonce: Date.now() })
                }}
            />
        </div>
    )
}

function People(props: { session: WatchParty_Session, me: WatchParty_Participant | undefined, hasRemote: boolean }) {
    const { session, me, hasRemote } = props
    const clientId = useAtomValue(clientIdAtom)
    const { mutate: passRemote, isPending, variables } = useWatchPartyPassRemote()
    const people = session.participants ?? []

    return (
        <div className="shrink-0 px-3 pt-3 pb-2">
            <p className="text-xs uppercase tracking-wider text-[--muted] flex items-center gap-1.5 mb-2">
                <LuUsers className="size-3.5" /> In the room · {people.length}
            </p>
            <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                {people.map(p => (
                    <div
                        key={p.clientId}
                        className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5"
                    >
                        <span
                            className="size-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: colorFor(p.username) }}
                        >
                            {(p.username || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <span className="text-sm truncate">
                            {p.username}
                            {p.clientId === me?.clientId && <span className="text-[--muted]"> (you)</span>}
                        </span>
                        {p.isSource && (
                            <Tooltip trigger={<span className="ml-auto text-[--brand]"><MdOutlineSettingsRemote className="size-5" /></span>}>
                                Has the remote
                            </Tooltip>
                        )}
                        {!p.isSource && <PlaybackDot participant={p} />}
                        {hasRemote && !p.isSource && (
                            <Button
                                size="sm"
                                intent="gray-subtle"
                                className="ml-1 h-7 px-2 text-xs opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                                loading={isPending && variables?.toClientId === p.clientId}
                                onClick={() => clientId && passRemote({ clientId, toClientId: p.clientId })}
                            >
                                Give remote
                            </Button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function PlaybackDot({ participant }: { participant: WatchParty_Participant }) {
    const st = participant.playbackStatus
    const label = !st ? "Not playing" : st.paused ? "Paused" : "Playing"
    return (
        <Tooltip trigger={<span
            className={cn(
                "ml-auto size-2 rounded-full shrink-0",
                !st ? "bg-gray-600" : st.paused ? "bg-amber-400" : "bg-green-500",
            )}
        />}>
            {label}
        </Tooltip>
    )
}

const PALETTE = ["#e11d48", "#db2777", "#9333ea", "#4f46e5", "#0284c7", "#0d9488", "#16a34a", "#ca8a04", "#ea580c"]

export function colorFor(name: string | undefined) {
    const s = name || "?"
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return PALETTE[Math.abs(h) % PALETTE.length]
}
