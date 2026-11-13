import { WatchParty_ChatMessage, WatchParty_Participant, WatchParty_Session } from "@/api/generated/types"
import { useWatchPartyPassRemote, useWatchPartySendChat } from "@/api/hooks/watchparty.hooks"
import { watchPartyChatMessagesAtom } from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { colorFor } from "@/app/(main)/watch-party/_components/watch-party-room"
import { clientIdAtom } from "@/app/websocket-provider"
import { IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { useAtomValue } from "jotai"
import React from "react"
import { LuSendHorizontal } from "react-icons/lu"

const MAX_LEN = 500

export function WatchPartyChat(props: { session: WatchParty_Session, me: WatchParty_Participant | undefined }) {
    const { session, me } = props
    const clientId = useAtomValue(clientIdAtom)
    const messages = useAtomValue(watchPartyChatMessagesAtom)
    const [text, setText] = React.useState("")

    const { mutate: send, isPending } = useWatchPartySendChat()
    const { mutate: passRemote } = useWatchPartyPassRemote()

    // Stick to the bottom unless the reader scrolled up.
    const listRef = React.useRef<HTMLDivElement>(null)
    const stickRef = React.useRef(true)
    React.useLayoutEffect(() => {
        const el = listRef.current
        if (el && stickRef.current) el.scrollTop = el.scrollHeight
    }, [messages.length])

    const submit = () => {
        const t = text.trim()
        if (!t || !clientId || isPending) return
        send({ clientId, text: t }, {
            onSuccess: () => setText(""),
        })
        stickRef.current = true
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 border-t border-white/5">
            <div
                ref={listRef}
                onScroll={e => {
                    const el = e.currentTarget
                    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
                }}
                className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-1.5"
            >
                {messages.length === 0 && (
                    <p className="text-sm text-[--muted] text-center mt-6">Say hi 👋</p>
                )}
                {messages.map((m, i) => (
                    <ChatLine
                        key={m.id}
                        message={m}
                        grouped={i > 0 && messages[i - 1].kind === "user" && m.kind === "user" && messages[i - 1].profileId === m.profileId}
                        isMine={m.kind === "user" && m.profileId === me?.profileId}
                        requester={m.kind === "system" && me?.isSource ? requesterOf(m, session) : undefined}
                        onGiveRemote={(p) => clientId && passRemote({ clientId, toClientId: p.clientId })}
                    />
                ))}
            </div>

            <form
                className="shrink-0 p-3 border-t border-white/5 flex items-end gap-2"
                onSubmit={e => {
                    e.preventDefault()
                    submit()
                }}
            >
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value.slice(0, MAX_LEN))}
                    onKeyDown={e => {
                        // Keep the player's shortcuts out of the chat box.
                        e.stopPropagation()
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            submit()
                        }
                    }}
                    rows={1}
                    placeholder={me ? "Send a message" : "Join the room to chat"}
                    disabled={!me}
                    className="flex-1 resize-none rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-[--brand] max-h-28"
                />
                <IconButton
                    type="submit"
                    intent="primary"
                    size="sm"
                    icon={<LuSendHorizontal />}
                    disabled={!text.trim() || !me}
                    loading={isPending}
                />
            </form>
        </div>
    )
}

function ChatLine(props: {
    message: WatchParty_ChatMessage
    grouped: boolean
    isMine: boolean
    requester?: WatchParty_Participant
    onGiveRemote: (p: WatchParty_Participant) => void
}) {
    const { message: m, grouped, isMine, requester, onGiveRemote } = props

    if (m.kind === "system") {
        return (
            <div className="text-xs text-[--muted] text-center py-1 flex items-center justify-center gap-2 flex-wrap">
                <span>{m.text}</span>
                {requester && (
                    <button
                        className="text-[--brand] hover:underline"
                        onClick={() => onGiveRemote(requester)}
                    >
                        Give remote
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col", grouped ? "mt-0" : "mt-1.5")}>
            {!grouped && (
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold" style={{ color: colorFor(m.username) }}>
                        {m.username}{isMine && <span className="text-[--muted] font-normal"> (you)</span>}
                    </span>
                    <span className="text-[0.65rem] text-[--muted]">{formatClock(m.timestamp)}</span>
                </div>
            )}
            <p className="text-sm whitespace-pre-wrap break-words leading-snug">{m.text}</p>
        </div>
    )
}

/** For "X is asking for the remote" lines: the asker, if still in the room and not holding it. */
function requesterOf(m: WatchParty_ChatMessage, session: WatchParty_Session) {
    const suffix = " is asking for the remote"
    if (!m.text.endsWith(suffix)) return undefined
    const name = m.text.slice(0, -suffix.length)
    return session.participants?.find(p => p.username === name && !p.isSource)
}

function formatClock(ts: string | undefined) {
    if (!ts) return ""
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
