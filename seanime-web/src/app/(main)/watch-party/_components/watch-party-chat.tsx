import { WatchParty_ChatMessage, WatchParty_Participant, WatchParty_Session } from "@/api/generated/types"
import { useWatchPartyPassRemote, useWatchPartySendChat } from "@/api/hooks/watchparty.hooks"
import { watchPartyChatMessagesAtom } from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { colorFor, WatchPartyAvatar } from "@/app/(main)/watch-party/_components/watch-party-ui"
import { clientIdAtom } from "@/app/websocket-provider"
import { cn } from "@/components/ui/core/styling"
import { useAtomValue } from "jotai"
import React from "react"
import { LuArrowDown, LuLogIn, LuLogOut, LuMessagesSquare, LuSendHorizontal } from "react-icons/lu"
import { MdOutlineSettingsRemote } from "react-icons/md"

const MAX_LEN = 500
const REACTIONS = ["😂", "😮", "😭", "🔥", "❤️", "👀"]

export function WatchPartyChat(props: { session: WatchParty_Session, me: WatchParty_Participant | undefined }) {
    const { session, me } = props
    const clientId = useAtomValue(clientIdAtom)
    const messages = useAtomValue(watchPartyChatMessagesAtom)
    const [text, setText] = React.useState("")

    const { mutate: send, isPending } = useWatchPartySendChat()
    const { mutate: passRemote } = useWatchPartyPassRemote()

    // Current pictures by profile, so old lines show today's avatar.
    const avatars = React.useMemo(() => {
        const m = new Map<number, string | undefined>()
        for (const p of session.participants ?? []) m.set(p.profileId, p.avatar)
        return m
    }, [session.participants])

    // Stick to the bottom unless the reader scrolled up.
    const listRef = React.useRef<HTMLDivElement>(null)
    const stickRef = React.useRef(true)
    const [showJump, setShowJump] = React.useState(false)
    React.useLayoutEffect(() => {
        const el = listRef.current
        if (!el) return
        if (stickRef.current) el.scrollTop = el.scrollHeight
        else setShowJump(true)
    }, [messages.length])

    const jumpToBottom = () => {
        const el = listRef.current
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
        stickRef.current = true
        setShowJump(false)
    }

    const sendText = (t: string) => {
        t = t.trim()
        if (!t || !clientId || isPending) return
        stickRef.current = true
        send({ clientId, text: t }, {
            onSuccess: () => setText(prev => (prev.trim() === t ? "" : prev)),
        })
    }

    return (
        <div className="relative flex flex-col flex-1 min-h-0 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 px-4 h-11 shrink-0 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gray-400">
                <LuMessagesSquare className="size-3.5" /> Chat
            </div>

            <div
                ref={listRef}
                onScroll={e => {
                    const el = e.currentTarget
                    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
                    stickRef.current = atBottom
                    if (atBottom) setShowJump(false)
                }}
                className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col"
            >
                {messages.length === 0 && (
                    <div className="m-auto flex flex-col items-center gap-2 text-center py-8">
                        <span className="text-4xl">👋</span>
                        <p className="text-sm text-gray-400">Say hi to the room</p>
                    </div>
                )}
                {messages.map((m, i) => {
                    const prev = messages[i - 1]
                    const next = messages[i + 1]
                    const sameAsPrev = !!prev && prev.kind === "user" && m.kind === "user" && prev.profileId === m.profileId && prev.username === m.username
                    const sameAsNext = !!next && next.kind === "user" && m.kind === "user" && next.profileId === m.profileId && next.username === m.username
                    return (
                        <ChatLine
                            key={m.id}
                            message={m}
                            first={!sameAsPrev}
                            last={!sameAsNext}
                            avatar={m.profileId !== undefined ? avatars.get(m.profileId) : undefined}
                            isMine={m.kind === "user" && !!me && m.profileId === me.profileId && m.username === me.username}
                            requester={m.kind === "system" && me?.isSource ? requesterOf(m, session) : undefined}
                            onGiveRemote={(p) => clientId && passRemote({ clientId, toClientId: p.clientId })}
                        />
                    )
                })}
            </div>

            {showJump && (
                <button
                    onClick={jumpToBottom}
                    className="absolute bottom-32 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 shadow-lg shadow-brand-500/40 animate-in fade-in slide-in-from-bottom-2"
                >
                    <LuArrowDown className="size-3.5" /> New messages
                </button>
            )}

            <div className="shrink-0 px-3 pt-2 pb-3 border-t border-white/[0.06] flex flex-col gap-2">
                <div className="flex items-center gap-1">
                    {REACTIONS.map(r => (
                        <button
                            key={r}
                            type="button"
                            disabled={!me || isPending}
                            onClick={() => sendText(r)}
                            className="size-8 rounded-full text-lg leading-none flex items-center justify-center transition-transform hover:scale-125 hover:bg-white/5 active:scale-95 disabled:opacity-40"
                        >
                            {r}
                        </button>
                    ))}
                </div>
                <form
                    className="flex items-end gap-2 rounded-2xl bg-white/[0.05] border border-white/10 focus-within:border-brand-400/60 focus-within:bg-white/[0.07] transition-colors pl-4 pr-1.5 py-1.5"
                    onSubmit={e => {
                        e.preventDefault()
                        sendText(text)
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
                                sendText(text)
                            }
                        }}
                        rows={1}
                        placeholder={me ? "Message the room…" : "Join the room to chat"}
                        disabled={!me}
                        className="flex-1 resize-none !bg-transparent !border-0 !shadow-none !ring-0 p-0 py-1.5 text-sm outline-none placeholder:text-gray-500 max-h-28"
                    />
                    <button
                        type="submit"
                        disabled={!text.trim() || !me || isPending}
                        className={cn(
                            "size-9 shrink-0 rounded-xl flex items-center justify-center transition-all",
                            text.trim()
                                ? "bg-brand-500 text-white shadow-lg shadow-brand-500/40 hover:bg-brand-400"
                                : "bg-white/5 text-gray-500",
                        )}
                    >
                        <LuSendHorizontal className="size-4" />
                    </button>
                </form>
            </div>
        </div>
    )
}

function ChatLine(props: {
    message: WatchParty_ChatMessage
    first: boolean
    last: boolean
    avatar?: string
    isMine: boolean
    requester?: WatchParty_Participant
    onGiveRemote: (p: WatchParty_Participant) => void
}) {
    const { message: m, first, last, avatar, isMine, requester, onGiveRemote } = props

    if (m.kind === "system") {
        return (
            <div className="flex justify-center my-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] border border-white/[0.06] px-3 py-1 text-[0.72rem] text-gray-400 max-w-full">
                    <SystemIcon text={m.text} />
                    <span className="truncate">{m.text}</span>
                    {requester && (
                        <button
                            className="ml-1 rounded-full bg-brand-500 text-white font-semibold px-2 py-0.5 text-[0.68rem] hover:bg-brand-400 shrink-0"
                            onClick={() => onGiveRemote(requester)}
                        >
                            Give remote
                        </button>
                    )}
                </div>
            </div>
        )
    }

    const isEmojiOnly = /^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*$/u.test(m.text.trim())
        || /^(\p{Extended_Pictographic}️?){1,3}$/u.test(m.text.trim())

    return (
        <div className={cn("flex gap-2 items-end", isMine && "flex-row-reverse", first ? "mt-3" : "mt-0.5")}>
            <div className="w-8 shrink-0">
                {last && !isMine && <WatchPartyAvatar name={m.username} avatar={avatar} size="sm" />}
            </div>
            <div className={cn("flex flex-col min-w-0 max-w-[78%]", isMine && "items-end")}>
                {first && !isMine && (
                    <span className="text-xs font-semibold mb-1 ml-1" style={{ color: colorFor(m.username) }}>
                        {m.username}
                    </span>
                )}
                {isEmojiOnly
                    ? <span className="text-4xl leading-none py-0.5 animate-in zoom-in-50 duration-300">{m.text}</span>
                    : <div
                        title={formatClock(m.timestamp)}
                        className={cn(
                            "px-3.5 py-2 text-sm leading-snug whitespace-pre-wrap break-words",
                            isMine
                                ? "bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-md shadow-brand-500/20"
                                : "bg-white/[0.07] text-gray-100",
                            // Bubble corners: the tail sits on the last line of a run.
                            "rounded-2xl",
                            isMine ? (!first && "rounded-tr-md") : (!first && "rounded-tl-md"),
                            isMine ? (!last && "rounded-br-md") : (!last && "rounded-bl-md"),
                            last && (isMine ? "rounded-br-sm" : "rounded-bl-sm"),
                        )}
                    >
                        {m.text}
                    </div>}
                {last && (
                    <span className={cn("text-[0.62rem] text-gray-500 mt-1", isMine ? "mr-1" : "ml-1")}>
                        {formatClock(m.timestamp)}
                    </span>
                )}
            </div>
        </div>
    )
}

function SystemIcon({ text }: { text: string }) {
    const cls = "size-3.5 shrink-0"
    if (text.includes("remote")) return <MdOutlineSettingsRemote className={cn(cls, "text-brand-300")} />
    if (text.endsWith(" left")) return <LuLogOut className={cls} />
    if (text.endsWith(" joined")) return <LuLogIn className={cn(cls, "text-emerald-400")} />
    return null
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
