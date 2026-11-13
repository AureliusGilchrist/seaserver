import { WatchParty_Session } from "@/api/generated/types"
import { useWatchPartyCreate, useWatchPartyJoin } from "@/api/hooks/watchparty.hooks"
import { watchPartySessionsAtom } from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { clientIdAtom } from "@/app/websocket-provider"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { useAtomValue } from "jotai"
import React from "react"
import { LuPlay, LuTv, LuUsers } from "react-icons/lu"
import { MdOutlineSettingsRemote } from "react-icons/md"

export function WatchPartyLobby() {
    const clientId = useAtomValue(clientIdAtom)
    const sessions = useAtomValue(watchPartySessionsAtom) ?? []
    const [name, setName] = React.useState("")

    const { mutate: create, isPending: isCreating } = useWatchPartyCreate()
    const { mutate: join, isPending: isJoining, variables: joiningVars } = useWatchPartyJoin()

    return (
        <div className="px-4 lg:px-8 py-6 lg:py-10 max-w-5xl mx-auto w-full flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <LuTv className="size-8 text-[--brand]" />
                    Watch together
                </h1>
                <p className="text-[--muted]">
                    Open a room and everyone who joins watches the same thing, in sync, with a chat on the side.
                    Whoever has the remote picks what plays and controls it for the whole room.
                </p>
            </div>

            <form
                className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl border border-[--border] bg-gray-950/60"
                onSubmit={e => {
                    e.preventDefault()
                    if (!clientId) return
                    create({ clientId, name: name.trim() })
                }}
            >
                <TextInput
                    value={name}
                    onValueChange={setName}
                    placeholder="Room name (optional)"
                    maxLength={60}
                    fieldClass="flex-1"
                />
                <Button
                    type="submit"
                    intent="primary"
                    loading={isCreating}
                    disabled={!clientId}
                    leftIcon={<LuPlay />}
                >
                    Create watch party
                </Button>
            </form>

            <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    Open rooms
                    <span className="text-sm font-normal text-[--muted]">({sessions.length})</span>
                </h2>

                {sessions.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[--border] p-8 text-center text-[--muted]">
                        Nobody is watching together right now. Create a room and the others on this server can join it.
                    </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
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
            </div>
        </div>
    )
}

function RoomCard(props: { session: WatchParty_Session, joining: boolean, disabled: boolean, onJoin: () => void }) {
    const { session, joining, disabled, onJoin } = props
    const holder = session.participants?.find(p => p.isSource)
    const people = session.participants ?? []
    const mi = session.mediaInfo

    return (
        <div className="relative overflow-hidden rounded-xl border border-[--border] bg-gray-950/70 flex">
            {mi?.mediaImage && (
                <img
                    src={mi.mediaImage}
                    alt=""
                    className="w-20 object-cover shrink-0"
                />
            )}
            <div className="flex flex-col gap-2 p-4 flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold truncate">{session.name}</p>
                    <span className="flex items-center gap-1 text-xs text-[--muted] shrink-0">
                        <LuUsers className="size-3.5" /> {people.length}
                    </span>
                </div>
                <p className="text-sm text-[--muted] truncate">
                    {mi
                        ? <>Watching <span className="text-[--foreground]">{mi.mediaTitle}</span>{mi.episodeNumber > 0 && ` · Ep ${mi.episodeNumber}`}</>
                        : "Picking something to watch…"}
                </p>
                <div className="flex items-center justify-between gap-2 mt-auto">
                    <span className="text-xs text-[--muted] flex items-center gap-1 truncate">
                        <MdOutlineSettingsRemote className="size-4 text-[--brand]" />
                        {holder?.username ?? "—"}
                        {people.length > 1 && <span className="truncate">· with {people.filter(p => !p.isSource).map(p => p.username).join(", ")}</span>}
                    </span>
                    <Button size="sm" intent="white" loading={joining} disabled={disabled} onClick={onJoin}>
                        Join
                    </Button>
                </div>
            </div>
        </div>
    )
}
