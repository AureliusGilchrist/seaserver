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
import { AmbientBackdrop, LiveBadge, WatchPartyAvatar, WatchPartyAvatarStack } from "@/app/(main)/watch-party/_components/watch-party-ui"
import { clientIdAtom } from "@/app/websocket-provider"
import { Button, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Tooltip } from "@/components/ui/tooltip"
import { useRouter } from "@/lib/navigation"
import { __isDesktop__, __isElectronDesktop__ } from "@/types/constants"
import { useAtomValue, useSetAtom } from "jotai"
import React from "react"
import { LuArrowLeft, LuHand, LuLogOut, LuPower, LuUsers } from "react-icons/lu"
import { MdOutlineSettingsRemote } from "react-icons/md"

export { colorFor } from "@/app/(main)/watch-party/_components/watch-party-ui"

export function WatchPartyRoom({ session }: { session: WatchParty_Session }) {
    const router = useRouter()
    const clientId = useAtomValue(clientIdAtom)
    const setRoomPageOpen = useSetAtom(watchPartyRoomPageOpenAtom)
    const setUnread = useSetAtom(watchPartyUnreadCountAtom)

    const people = session.participants ?? []
    const me = people.find(p => p.clientId === clientId)
    const hasRemote = !!me?.isSource
    const holder = people.find(p => p.isSource)

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

    const askForRemote = () => clientId && requestRemote({ clientId })

    return (
        <div
            data-watch-party-room
            className={cn(
                "fixed inset-0 z-[45] bg-[#0b0b12] text-white flex flex-col lg:flex-row overflow-hidden",
                __isElectronDesktop__ && "top-10",
                __isDesktop__ && "top-8",
            )}
        >
            <AmbientBackdrop image={mi?.mediaImage} />

            {/* Stage column */}
            <div className="relative flex flex-col min-w-0 lg:flex-1 lg:h-full">
                <header className="flex items-center gap-3 px-3 lg:px-5 h-16 shrink-0">
                    <Tooltip trigger={<IconButton
                        intent="gray-basic"
                        size="sm"
                        className="rounded-full bg-white/5 hover:bg-white/10"
                        icon={<LuArrowLeft />}
                        onClick={() => router.push("/")}
                    />}>
                        Back to the app (you stay in the room)
                    </Tooltip>

                    {mi?.mediaImage && (
                        <img
                            src={mi.mediaImage}
                            alt=""
                            className="hidden sm:block h-10 w-7 rounded-md object-cover border border-white/10 shadow-lg"
                        />
                    )}

                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <p className="font-bold text-base lg:text-lg truncate leading-tight">{session.name}</p>
                            {mi && <LiveBadge className="hidden sm:inline-flex" />}
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                            {mi
                                ? <>{mi.mediaTitle}{mi.episodeNumber > 0 && ` · Episode ${mi.episodeNumber}`}</>
                                : "Nothing playing yet"}
                        </p>
                    </div>

                    <div className="hidden md:flex items-center mr-1">
                        <WatchPartyAvatarStack participants={people} max={5} />
                    </div>

                    {hasRemote && (
                        <Button
                            size="sm"
                            intent="primary"
                            className="rounded-full px-4 font-semibold shadow-lg shadow-brand-500/30"
                            leftIcon={<MdOutlineSettingsRemote className="size-4" />}
                            onClick={() => setPickerOpen(true)}
                        >
                            <span className="hidden sm:inline">Pick something</span>
                            <span className="sm:hidden">Pick</span>
                        </Button>
                    )}
                    {hasRemote && people.length > 1 && (
                        <Tooltip trigger={<IconButton
                            intent="alert-basic"
                            size="sm"
                            className="rounded-full"
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
                        className="rounded-full bg-white/5 hover:bg-white/10"
                        icon={<LuLogOut />}
                        loading={isLeaving}
                        onClick={() => clientId && leave({ clientId })}
                    />}>
                        {hasRemote && people.length > 1 ? "Leave (the remote goes to someone else)" : "Leave the room"}
                    </Tooltip>
                </header>

                <div className="relative px-0 sm:px-3 lg:px-5 lg:flex-1 lg:min-h-0">
                    <div className="relative bg-black aspect-video w-full lg:aspect-auto lg:h-full sm:rounded-2xl overflow-hidden sm:border sm:border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
                        <WatchPartyPlayer
                            session={session}
                            hasRemote={hasRemote}
                            playRequest={playRequest}
                            onOpenPicker={() => setPickerOpen(true)}
                        />
                    </div>
                </div>

                {/* Remote status bar */}
                <div className="hidden lg:flex items-center px-5 h-16 shrink-0">
                    <div className={cn(
                        "flex items-center gap-3 rounded-full pl-1.5 pr-1.5 py-1.5 border text-sm w-full",
                        hasRemote
                            ? "bg-brand-500/10 border-brand-400/30"
                            : "bg-white/[0.04] border-white/10",
                    )}>
                        {holder && <WatchPartyAvatar name={holder.username} avatar={holder.avatar} size="sm" hasRemote />}
                        {hasRemote
                            ? <span className="text-brand-100"><span className="font-semibold">You have the remote.</span> Play, pause and seek, and everyone follows.</span>
                            : <span className="text-gray-300"><span className="font-semibold text-white">{holder?.username}</span> has the remote. Your player follows theirs.</span>}
                        {!hasRemote && (
                            <Button
                                size="sm"
                                intent="white"
                                className="ml-auto rounded-full px-4"
                                leftIcon={<LuHand className="size-4" />}
                                loading={isRequesting}
                                onClick={askForRemote}
                            >
                                Ask for the remote
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Sidebar: people + chat */}
            <aside className={cn(
                "relative flex flex-col min-h-0 flex-1 lg:flex-none lg:w-[380px] lg:h-full",
                // No backdrop-filter: the pulsing status dots would make it re-blur every frame.
                "bg-[#0e0e16]/[0.92] border-t lg:border-t-0 lg:border-l border-white/[0.06]",
            )}>
                <People session={session} me={me} hasRemote={hasRemote} />
                {!hasRemote && (
                    <div className="lg:hidden px-4 pb-3">
                        <Button
                            size="sm"
                            intent="white"
                            className="w-full rounded-full"
                            leftIcon={<LuHand className="size-4" />}
                            loading={isRequesting}
                            onClick={askForRemote}
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
        <div className="shrink-0 px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gray-400 flex items-center gap-2">
                    <LuUsers className="size-3.5" /> In the room
                </p>
                <span className="text-[0.7rem] font-semibold rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-gray-300">
                    {people.length}
                </span>
            </div>
            <div className="flex flex-col gap-1 max-h-[13.5rem] overflow-y-auto -mx-1 px-1">
                {people.map(p => {
                    const isMe = p.clientId === me?.clientId
                    return (
                        <div
                            key={p.clientId}
                            className={cn(
                                "group flex items-center gap-3 px-2 py-1.5 rounded-xl transition-colors",
                                p.isSource ? "bg-brand-500/10" : "hover:bg-white/[0.04]",
                            )}
                        >
                            <WatchPartyAvatar name={p.username} avatar={p.avatar} size="sm" hasRemote={p.isSource} />
                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-sm font-medium truncate leading-tight">
                                    {p.username}
                                    {isMe && <span className="text-gray-500 font-normal"> · you</span>}
                                </span>
                                <span className="text-[0.7rem] text-gray-400 leading-tight">
                                    {p.isSource ? "Has the remote" : statusLabel(p)}
                                </span>
                            </div>
                            {!p.isSource && <StatusDot participant={p} />}
                            {hasRemote && !p.isSource && (
                                <Button
                                    size="sm"
                                    intent="gray-subtle"
                                    className="h-7 px-2.5 text-xs rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                                    leftIcon={<MdOutlineSettingsRemote className="size-3.5" />}
                                    loading={isPending && variables?.toClientId === p.clientId}
                                    onClick={() => clientId && passRemote({ clientId, toClientId: p.clientId })}
                                >
                                    Give
                                </Button>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function statusLabel(p: WatchParty_Participant) {
    const st = p.playbackStatus
    if (!st) return "Waiting"
    return st.paused ? "Paused" : "Watching"
}

function StatusDot({ participant }: { participant: WatchParty_Participant }) {
    const st = participant.playbackStatus
    return (
        <span className="relative flex size-2 shrink-0">
            {st && !st.paused && <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
            <span className={cn(
                "relative inline-flex size-2 rounded-full",
                !st ? "bg-gray-600" : st.paused ? "bg-amber-400" : "bg-emerald-400",
            )} />
        </span>
    )
}
