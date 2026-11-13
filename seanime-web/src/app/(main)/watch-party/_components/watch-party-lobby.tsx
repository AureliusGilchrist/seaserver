import { WatchParty_Session } from "@/api/generated/types"
import { useWatchPartyCreate, useWatchPartyJoin } from "@/api/hooks/watchparty.hooks"
import { watchPartySessionsAtom } from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { AmbientBackdrop, LiveBadge, WatchPartyAvatarStack } from "@/app/(main)/watch-party/_components/watch-party-ui"
import { clientIdAtom } from "@/app/websocket-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { useAtomValue } from "jotai"
import React from "react"
import { LuArrowRight, LuMessagesSquare, LuPopcorn, LuRefreshCcw, LuSparkles } from "react-icons/lu"
import { MdOutlineSettingsRemote } from "react-icons/md"

export function WatchPartyLobby() {
    const clientId = useAtomValue(clientIdAtom)
    const sessions = useAtomValue(watchPartySessionsAtom) ?? []
    const [name, setName] = React.useState("")

    const { mutate: create, isPending: isCreating } = useWatchPartyCreate()
    const { mutate: join, isPending: isJoining, variables: joiningVars } = useWatchPartyJoin()

    // The most recent cover on the server tints the whole lobby.
    const ambient = sessions.find(s => s.mediaInfo?.mediaImage)?.mediaInfo?.mediaImage

    return (
        <div className="relative min-h-[calc(100dvh-2rem)] w-full overflow-hidden">
            <AmbientBackdrop image={ambient} />

            <div className="relative px-4 lg:px-10 py-8 lg:py-14 max-w-6xl mx-auto w-full flex flex-col gap-10">
                {/* Hero */}
                <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-10 shadow-2xl">
                    <div className="absolute -right-24 -top-24 size-80 rounded-full bg-brand-500/25 blur-3xl" aria-hidden />
                    <div className="absolute right-10 bottom-0 hidden md:block opacity-[0.045]" aria-hidden>
                        <LuPopcorn className="size-64" />
                    </div>

                    <div className="relative flex flex-col gap-6 max-w-2xl">
                        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-200">
                            <LuSparkles className="size-3.5" /> Watch together
                        </span>
                        <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">
                            Same episode.
                            <br />
                            <span className="bg-gradient-to-r from-brand-200 via-brand-400 to-fuchsia-400 bg-clip-text text-transparent">
                                Same second.
                            </span>
                        </h1>
                        <p className="text-gray-300/90 text-base sm:text-lg leading-relaxed">
                            Open a room, bring your people. Whoever holds the remote picks what plays,
                            and everyone's screen follows, with a live chat on the side.
                        </p>

                        <form
                            className="flex flex-col sm:flex-row gap-3 p-1.5 rounded-2xl bg-black/40 border border-white/10 focus-within:border-brand-400/60 transition-colors"
                            onSubmit={e => {
                                e.preventDefault()
                                if (!clientId) return
                                create({ clientId, name: name.trim() })
                            }}
                        >
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Name your room (optional)"
                                maxLength={60}
                                className="flex-1 !bg-transparent !border-0 !shadow-none !ring-0 px-4 py-3 text-base outline-none placeholder:text-gray-500"
                            />
                            <Button
                                type="submit"
                                intent="primary"
                                size="lg"
                                loading={isCreating}
                                disabled={!clientId}
                                className="rounded-xl px-6 font-semibold shadow-lg shadow-brand-500/30"
                                rightIcon={<LuArrowRight />}
                            >
                                Create watch party
                            </Button>
                        </form>

                        <div className="flex flex-wrap gap-2 text-xs text-gray-300">
                            <Feature icon={<LuRefreshCcw className="size-3.5" />} label="Synced playback" />
                            <Feature icon={<MdOutlineSettingsRemote className="size-3.5" />} label="One remote, pass it around" />
                            <Feature icon={<LuMessagesSquare className="size-3.5" />} label="Live chat" />
                        </div>
                    </div>
                </section>

                {/* Rooms */}
                <section className="flex flex-col gap-4">
                    <div className="flex items-end justify-between">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Open rooms</h2>
                            <p className="text-sm text-gray-400">
                                {sessions.length === 0 ? "Nobody's watching yet" : `${sessions.length} room${sessions.length === 1 ? "" : "s"} on this server`}
                            </p>
                        </div>
                    </div>

                    {sessions.length === 0 && (
                        <div className="relative overflow-hidden rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 flex flex-col items-center gap-4 text-center">
                            <div className="relative">
                                <div className="absolute inset-0 rounded-full bg-brand-500/30 blur-2xl" />
                                <div className="relative size-16 rounded-2xl bg-gradient-to-br from-brand-400/30 to-fuchsia-500/20 border border-white/10 flex items-center justify-center">
                                    <LuPopcorn className="size-8 text-brand-200" />
                                </div>
                            </div>
                            <p className="text-lg font-semibold">The couch is empty</p>
                            <p className="text-sm text-gray-400 max-w-sm">
                                Create a room above. It shows up here for everyone on this server, ready to join.
                            </p>
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                        {sessions.map(s => (
                            <RoomCard
                                key={s.id}
                                session={s}
                                joining={isJoining && joiningVars?.sessionId === s.id}
                                disabled={!clientId || isJoining}
                                onJoin={() => clientId && join({ clientId, sessionId: s.id })}
                            />
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}

function Feature({ icon, label }: { icon: React.ReactNode, label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1.5">
            <span className="text-brand-300">{icon}</span>
            {label}
        </span>
    )
}

function RoomCard(props: { session: WatchParty_Session, joining: boolean, disabled: boolean, onJoin: () => void }) {
    const { session, joining, disabled, onJoin } = props
    const holder = session.participants?.find(p => p.isSource)
    const people = session.participants ?? []
    const mi = session.mediaInfo

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onJoin}
            className={cn(
                "group relative overflow-hidden rounded-3xl border border-white/10 bg-[#111119] text-left",
                "transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/50 hover:shadow-2xl hover:shadow-brand-500/20",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                "disabled:opacity-70 disabled:hover:translate-y-0",
            )}
        >
            {/* Backdrop */}
            {mi?.mediaImage
                ? <img
                    src={mi.mediaImage}
                    alt=""
                    className="absolute inset-0 size-full object-cover opacity-40 blur-md scale-110 transition-transform duration-700 group-hover:scale-125"
                />
                : <div className="absolute inset-0 bg-gradient-to-br from-brand-500/20 via-transparent to-fuchsia-500/10" />}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b12] via-[#0b0b12]/85 to-[#0b0b12]/40" />

            <div className="relative flex gap-4 p-4 sm:p-5">
                <div className="relative w-20 sm:w-24 shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-xl">
                    {mi?.mediaImage
                        ? <img src={mi.mediaImage} alt="" className="size-full object-cover" />
                        : <div className="size-full flex items-center justify-center">
                            <LuPopcorn className="size-8 text-white/30" />
                        </div>}
                </div>

                <div className="flex flex-col gap-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {mi ? <LiveBadge /> : <span className="text-[0.65rem] font-bold tracking-widest uppercase text-gray-400">Lobby</span>}
                    </div>
                    <p className="text-lg font-bold leading-tight truncate">{session.name}</p>
                    <p className="text-sm text-gray-300 line-clamp-2">
                        {mi
                            ? <>{mi.mediaTitle}{mi.episodeNumber > 0 && <span className="text-gray-400"> · Episode {mi.episodeNumber}</span>}</>
                            : <span className="text-gray-400">Picking something to watch…</span>}
                    </p>

                    <div className="mt-auto pt-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <WatchPartyAvatarStack participants={people} max={4} size="xs" />
                            {holder && (
                                <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-300 truncate">
                                    <MdOutlineSettingsRemote className="size-3.5 text-brand-300 shrink-0" />
                                    <span className="truncate">{holder.username}</span>
                                </span>
                            )}
                        </div>
                        <span className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold shrink-0",
                            "bg-white text-black transition-all group-hover:bg-brand-300 group-hover:shadow-lg group-hover:shadow-brand-500/40",
                        )}>
                            {joining ? "Joining…" : "Join"}
                            <LuArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                    </div>
                </div>
            </div>
        </button>
    )
}
