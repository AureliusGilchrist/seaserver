import { useAtom, useAtomValue, useSetAtom } from "jotai"
import React from "react"
import { toast } from "sonner"
import { LuArrowLeft, LuCheck, LuCheckCheck, LuImage, LuLock, LuPencil, LuReply, LuSmile, LuTrash2, LuX } from "react-icons/lu"

import {
    Chat_Conversation,
    Chat_Message,
} from "@/api/generated/types"
import {
    useChatTyping,
    useDeleteChatMessage,
    useEditChatMessage,
    useGetChatConversations,
    useGetChatMessages,
    useGetChatPeerKey,
    useGetChatState,
    useMarkChatRead,
    useReactChatMessage,
    useSendChatMessage,
    useSetupChatPin,
    useUploadChatImage,
} from "@/api/hooks/chat.hooks"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import {
    chatActivePeerAtom,
    chatModalOpenAtom,
    chatPeerTypingAtom,
    chatPrivateKeyAtom,
} from "@/app/(main)/_features/chat/chat.atoms"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/components/ui/core/styling"
import { useLatestFunction, logger } from "@/lib/helpers/debug"
import {
    clearConversationKeys,
    decryptBytes,
    decryptText,
    encryptBytes,
    encryptText,
    generateChatIdentity,
    getConversationKey,
    unlockChatIdentity,
} from "@/lib/encryption/chat-crypto"

const log = logger("Chat")
/**
 * The chat modal. Three states:
 *  - no PIN set up   → setup screen (create PIN)
 *  - PIN set, locked → unlock screen (enter PIN)
 *  - unlocked        → conversations + threads (E2EE)
 */
export function ChatModal() {
    const [isOpen, setIsOpen] = useAtom(chatModalOpenAtom)
    const [privateKey, setPrivateKey] = useAtom(chatPrivateKeyAtom)
    const myProfile = useAtomValue(currentProfileAtom)
    const myId = myProfile?.id

    const { data: state, isLoading: stateLoading, refetch: refetchState } = useGetChatState(!!myId && isOpen)

    React.useEffect(() => {
        if (!isOpen) return
        void refetchState()
    }, [isOpen, refetchState])

    return (
        <Modal
            open={isOpen}
            onOpenChange={setIsOpen}
            title={<div className="flex items-center gap-2 w-full justify-center">
                <LuLock className="size-7" />
                Encrypted chat
            </div>}
            contentClass="max-w-2xl bg-gray-950 bg-opacity-95 firefox:bg-opacity-100 h-[80vh]"
            overlayClass="bg-black/80"
        >
            <div className="h-full flex flex-col overflow-hidden">
                {stateLoading ? (
                    <div className="flex-1 flex items-center justify-center text-[--muted] text-sm">Loading…</div>
                ) : !state?.hasPin ? (
                    <ChatSetup onDone={() => void refetchState()} />
                ) : !privateKey ? (
                    <ChatUnlock
                        state={{
                            salt: state.salt ?? "",
                            verifier: state.verifier ?? "",
                            encryptedPrivateKey: state.encryptedPrivateKey ?? "",
                        }}
                        onUnlocked={(key) => setPrivateKey(key)}
                    />
                ) : (
                    <ChatUnlocked myId={myId ?? 0} privateKey={privateKey} />
                )}
            </div>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup

function ChatSetup({ onDone }: { onDone: () => void }) {
    const { mutate: setup, isPending } = useSetupChatPin()
    const setPrivateKey = useSetAtom(chatPrivateKeyAtom)
    const [pin, setPin] = React.useState("")
    const [pin2, setPin2] = React.useState("")

    const submit = async () => {
        if (pin.length < 4) {
            toast.error("PIN must be at least 4 characters")
            return
        }
        if (pin !== pin2) {
            toast.error("PINs don't match")
            return
        }
        try {
            const { identity, privateKey } = await generateChatIdentity(pin)
            setup(identity, {
                onSuccess: () => {
                    setPrivateKey(privateKey)
                    toast.success("Chat locked with your PIN")
                    onDone()
                },
            })
        } catch (e) {
            log.error("Chat setup failed", e)
            toast.error("Could not create the chat identity")
        }
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <LuLock className="size-10 text-[--brand]" />
            <div>
                <p className="font-semibold text-lg">Set a chat PIN</p>
                <p className="text-[--muted] text-sm max-w-md mt-1">
                    Your messages are end-to-end encrypted between profiles. The PIN unlocks them on this
                    device — it never leaves your browser. If you forget it, the chat can be reset but old
                    messages can't be recovered.
                </p>
            </div>
            <div className="w-full max-w-xs flex flex-col gap-2">
                <TextInput
                    type="password"
                    value={pin}
                    onValueChange={setPin}
                    placeholder="New PIN (min 4 characters)"
                    onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
                <TextInput
                    type="password"
                    value={pin2}
                    onValueChange={setPin2}
                    placeholder="Confirm PIN"
                    onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
                <Button intent="white" loading={isPending} onClick={() => void submit()}>
                    Create PIN
                </Button>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Unlock

function ChatUnlock({ state, onUnlocked }: { state: { salt: string, verifier: string, encryptedPrivateKey: string }, onUnlocked: (key: CryptoKey) => void }) {
    const [pin, setPin] = React.useState("")
    const [error, setError] = React.useState<string | null>(null)
    const [busy, setBusy] = React.useState(false)

    const submit = async () => {
        setBusy(true)
        setError(null)
        try {
            const key = await unlockChatIdentity(state, pin)
            onUnlocked(key)
        } catch {
            setError("Wrong PIN")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <LuLock className="size-10 text-[--brand]" />
            <p className="font-semibold text-lg">Enter your chat PIN</p>
            <div className="w-full max-w-xs flex flex-col gap-2">
                <TextInput
                    type="password"
                    autoFocus
                    value={pin}
                    onValueChange={setPin}
                    placeholder="PIN"
                    onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <Button intent="white" loading={busy} onClick={() => void submit()}>
                    Unlock
                </Button>
            </div>
            <p className="text-xs text-[--muted] max-w-xs">
                The key stays in memory for this session only. Messages stay encrypted on the server.
            </p>
        </div>
    )
}

// (ChatStateLike kept minimal — the unlock screen only needs the sealed fields.)

// ─────────────────────────────────────────────────────────────────────────────
// Unlocked: conversations + thread

function ChatUnlocked({ myId, privateKey }: { myId: number, privateKey: CryptoKey }) {
    const [activePeer, setActivePeer] = useAtom(chatActivePeerAtom)
    const setPrivateKey = useSetAtom(chatPrivateKeyAtom)

    const lock = () => {
        clearConversationKeys()
        setPrivateKey(null)
        setActivePeer(undefined)
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[--border]">
                <p className="text-xs uppercase tracking-wider text-[--muted]">Encrypted chat</p>
                <Button intent="gray-basic" size="sm" onClick={lock}>
                    <LuLock className="size-3.5 mr-1" /> Lock
                </Button>
            </div>
            <div className="flex-1 min-h-0 flex">
                {/* Conversation list */}
                <div className={cn(
                    "w-full md:w-64 md:flex-none border-r border-[--border] flex flex-col min-h-0",
                    activePeer && "hidden md:flex",
                )}>
                    <ConversationList myId={myId} privateKey={privateKey} onSelect={setActivePeer} activePeer={activePeer} />
                </div>
                {/* Thread */}
                <div className={cn("flex-1 min-w-0 flex flex-col min-h-0", !activePeer && "hidden md:flex")}>
                    {activePeer
                        ? <ChatThread key={activePeer} myId={myId} privateKey={privateKey} peerId={activePeer} onBack={() => setActivePeer(undefined)} />
                        : <div className="flex-1 flex items-center justify-center text-[--muted] text-sm">Select a conversation</div>}
                </div>
            </div>
        </div>
    )
}

function ConversationList({ myId, privateKey, onSelect, activePeer }: {
    myId: number
    privateKey: CryptoKey
    onSelect: (peer: number) => void
    activePeer: number | undefined
}) {
    const { data, isLoading } = useGetChatConversations(true)
    const conversations = data?.conversations ?? []

    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            <p className="text-xs uppercase tracking-wider text-[--muted] px-2 py-1">Conversations</p>
            {isLoading && <div className="px-2 py-4 text-sm text-[--muted]">Loading…</div>}
            {!isLoading && conversations.length === 0 && (
                <div className="px-2 py-4 text-sm text-[--muted]">
                    No conversations yet. Pick a profile from the server list to start one.
                </div>
            )}
            {conversations.map(conv => (
                <ConversationRow
                    key={conv.peerId}
                    conv={conv}
                    myId={myId}
                    privateKey={privateKey}
                    active={conv.peerId === activePeer}
                    onSelect={() => onSelect(conv.peerId)}
                />
            ))}
        </div>
    )
}

function ConversationRow({ conv, myId, privateKey, active, onSelect }: {
    conv: Chat_Conversation
    myId: number
    privateKey: CryptoKey
    active: boolean
    onSelect: () => void
}) {
    const [preview, setPreview] = React.useState<string>("…")
    const { data: peerKeyRow } = useGetChatPeerKey(conv.peerId, true)
    const last = conv.lastMessage

    React.useEffect(() => {
        let cancelled = false
        const peerPub = peerKeyRow?.publicKey
        const run = async () => {
            if (!last) { setPreview("No messages yet"); return }
            if (last.deletedAt) { setPreview("Message deleted"); return }
            if (!peerKeyRow?.hasPin || !peerPub) { setPreview("[encrypted]"); return }
            try {
                const key = await getConversationKey(privateKey, myId, conv.peerId, peerPub)
                if (cancelled) return
                if (last.ciphertext) {
                    const text = await decryptText(key, last.iv, last.ciphertext)
                    if (!cancelled) setPreview(`${last.from === myId ? "You: " : ""}${text}`)
                } else if (last.imageId) {
                    if (!cancelled) setPreview(`${last.from === myId ? "You: " : ""}📷 Image`)
                } else {
                    if (!cancelled) setPreview("…")
                }
            } catch {
                if (!cancelled) setPreview("[encrypted]")
            }
        }
        void run()
        return () => { cancelled = true }
    }, [last, conv.peerId, myId, privateKey, peerKeyRow])

    return (
        <button
            onClick={onSelect}
            className={cn(
                "w-full text-left px-3 py-2 rounded-lg hover:bg-[--secondary] transition-colors flex flex-col gap-0.5",
                active && "bg-[--secondary]",
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{conv.peerName || `Profile ${conv.peerId}`}</span>
                {!!conv.unreadCount && <Badge intent="primary-solid" size="sm">{conv.unreadCount}</Badge>}
            </div>
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[--muted] truncate">{preview}</span>
                {conv.isPeerTyping && <span className="text-xs text-green-400 shrink-0">typing…</span>}
            </div>
        </button>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Thread

type DecryptedMessage = {
    message: Chat_Message
    text: string | null   // null when undecryptable
    isImage: boolean
    imageUrl: string | null
    replyText: string | null
    reactionText: string | null
}

function ChatThread({ myId, privateKey, peerId, onBack }: {
    myId: number
    privateKey: CryptoKey
    peerId: number
    onBack: () => void
}) {
    const { data: peerKey } = useGetChatPeerKey(peerId, true)
    const { data: messagesData, isLoading } = useGetChatMessages(peerId, true)
    const { mutate: send } = useSendChatMessage()
    const { mutate: edit } = useEditChatMessage()
    const { mutate: del } = useDeleteChatMessage()
    const { mutate: react } = useReactChatMessage()
    const { mutate: markRead } = useMarkChatRead()
    const { mutate: sendTyping } = useChatTyping()
    const setPeerTyping = useSetAtom(chatPeerTypingAtom)

    const [draft, setDraft] = React.useState("")
    const [replyTo, setReplyTo] = React.useState<Chat_Message | null>(null)
    const [editing, setEditing] = React.useState<Chat_Message | null>(null)
    const [decrypted, setDecrypted] = React.useState<Record<string, DecryptedMessage>>({})
    const [conversationKey, setConversationKey] = React.useState<CryptoKey | null>(null)

    const scrollRef = React.useRef<HTMLDivElement>(null)

    // Derive the conversation key once the peer's public key arrives.
    React.useEffect(() => {
        let cancelled = false
        const peerPub = peerKey?.publicKey
        if (!peerKey?.hasPin || !peerPub) return
        void (async () => {
            try {
                const key = await getConversationKey(privateKey, myId, peerId, peerPub)
                if (!cancelled) setConversationKey(key)
            } catch (e) {
                log.error("Failed to derive conversation key", e)
            }
        })()
        return () => { cancelled = true }
    }, [peerKey, privateKey, myId, peerId])

    // Decrypt messages as they arrive / the key becomes available.
    const rawMessages = React.useMemo(() => messagesData?.messages ?? [], [messagesData])
    const rawMessagesKey = rawMessages.map(m => `${m.id}:${m.editedAt ?? ""}:${m.deletedAt ?? ""}:${m.readAt ?? ""}:${JSON.stringify(m.reactions ?? {})}`).join("|")

    React.useEffect(() => {
        if (!conversationKey) return
        let cancelled = false
        void (async () => {
            const out: Record<string, DecryptedMessage> = {}
            const replyCache = new Map<string, string | null>()
            for (const m of rawMessages) {
                const dm: DecryptedMessage = { message: m, text: null, isImage: !!m.imageId, imageUrl: null, replyText: null, reactionText: null }
                if (m.deletedAt) {
                    dm.text = null
                } else {
                    if (m.ciphertext) {
                        try { dm.text = await decryptText(conversationKey, m.iv, m.ciphertext) } catch { dm.text = null }
                    }
                    if (m.imageId) {
                        // Serve through the endpoint; bytes decrypt client-side.
                        dm.imageUrl = `/api/v1/chat/image/${m.imageId}`
                        try {
                            dm.imageUrl = await buildChatImageUrl(conversationKey, m.imageId, m.imageIv ?? "")
                        } catch { /* leave plain URL; render fails gracefully */ }
                    }
                    if (m.replyToId) {
                        if (!replyCache.has(m.replyToId)) {
                            const parent = rawMessages.find(x => x.id === m.replyToId)
                            if (parent?.ciphertext) {
                                try { replyCache.set(m.replyToId, await decryptText(conversationKey, parent.iv, parent.ciphertext)) } catch { replyCache.set(m.replyToId, null) }
                            } else {
                                replyCache.set(m.replyToId, null)
                            }
                        }
                        dm.replyText = replyCache.get(m.replyToId) ?? null
                    }
                    const mine = m.reactions?.[myId]
                    const theirs = m.reactions && Object.entries(m.reactions).filter(([pid]) => Number(pid) !== myId)
                    const parts: string[] = []
                    if (mine?.ciphertext) {
                        try { parts.push(await decryptText(conversationKey, mine.iv, mine.ciphertext)) } catch { /* ignore */ }
                    }
                    if (theirs) {
                        for (const [, r] of theirs) {
                            try { parts.push(await decryptText(conversationKey, r.iv, r.ciphertext)) } catch { /* ignore */ }
                        }
                    }
                    if (parts.length) dm.reactionText = parts.join(" ")
                }
                out[m.id] = dm
            }
            if (!cancelled) setDecrypted(out)
        })()
        return () => { cancelled = true }
    }, [conversationKey, rawMessagesKey, myId]) // eslint-disable-line react-hooks/exhaustive-deps

    // Mark read on open and when new messages appear.
    React.useEffect(() => {
        markRead({ withProfileId: peerId })
    }, [peerId, rawMessages.length, markRead])

    // Auto-scroll to bottom.
    React.useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [decrypted, rawMessages.length])

    // Typing: send throttled pings while the user types.
    const lastTypingSentRef = React.useRef(0)
    const onDraftChange = useLatestFunction((v: string) => {
        setDraft(v)
        const now = Date.now()
        if (v && now - lastTypingSentRef.current > 2500) {
            lastTypingSentRef.current = now
            sendTyping({ toProfileId: peerId, isTyping: true })
        }
    })

    const submit = async () => {
        const text = draft.trim()
        if (!text || !conversationKey) return
        setDraft("")
        setPeerTyping(prev => ({ ...prev, [peerId]: { isTyping: false, at: Date.now() } }))
        if (editing) {
            const sealed = await encryptText(conversationKey, text)
            edit({ messageId: editing.id, iv: sealed.iv, ciphertext: sealed.ciphertext })
            setEditing(null)
            return
        }
        const sealed = await encryptText(conversationKey, text)
        send({
            toProfileId: peerId,
            iv: sealed.iv,
            ciphertext: sealed.ciphertext,
            replyToId: replyTo?.id || undefined,
        }, {
            onError: () => {
                toast.error("Failed to send")
                setDraft(text)
            },
        })
        setReplyTo(null)
        sendTyping({ toProfileId: peerId, isTyping: false })
    }

    const addReaction = async (m: Chat_Message) => {
        if (!conversationKey) return
        const existing = m.reactions?.[myId]
        if (existing) {
            // Toggle off.
            react({ messageId: m.id, iv: "", ciphertext: "" })
            return
        }
        const sealed = await encryptText(conversationKey, "❤️")
        react({ messageId: m.id, iv: sealed.iv, ciphertext: sealed.ciphertext })
    }

    const deleteMessage = (m: Chat_Message) => {
        del({ messageId: m.id })
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 p-3 border-b border-[--border]">
                <Button intent="gray-basic" size="sm" onClick={onBack} className="md:hidden">
                    <LuArrowLeft className="size-4" />
                </Button>
                <p className="font-semibold flex-1 truncate">{`Conversation`}</p>
                <span className="text-xs text-[--muted] flex items-center gap-1">
                    <LuLock className="size-3" /> end-to-end encrypted
                </span>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
                {isLoading && <div className="text-sm text-[--muted] text-center py-4">Loading…</div>}
                {!isLoading && rawMessages.length === 0 && (
                    <div className="text-sm text-[--muted] text-center py-8">
                        No messages yet. Say hi — it's encrypted end-to-end.
                    </div>
                )}
                {rawMessages.map(m => {
                    const dm = decrypted[m.id]
                    const mine = m.from === myId
                    return (
                        <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                            <div className={cn(
                                "group max-w-[80%] rounded-xl px-3 py-2 text-sm relative",
                                mine ? "bg-[--brand] bg-opacity-20" : "bg-[--secondary]",
                                m.deletedAt && "opacity-50 italic",
                            )}>
                                {dm?.replyText && (
                                    <div className="border-l-2 border-[--border] pl-2 mb-1 text-xs text-[--muted] truncate">
                                        {dm.replyText || "[encrypted]"}
                                    </div>
                                )}
                                {m.deletedAt
                                    ? <span className="text-[--muted]">Message deleted</span>
                                    : dm?.isImage && dm.imageUrl
                                        ? <ChatImage url={dm.imageUrl} />
                                        : <span className="whitespace-pre-wrap break-words">{dm?.text ?? "[encrypted]"}</span>}
                                {m.editedAt && !m.deletedAt && <span className="text-[10px] text-[--muted] ml-2">(edited)</span>}
                                {dm?.reactionText && <div className="text-xs mt-1">{dm.reactionText}</div>}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[--muted]">
                                <span>{new Date(m.createdAt).toLocaleString()}</span>
                                {mine && (m.readAt ? <LuCheckCheck className="size-3" /> : <LuCheck className="size-3" />)}
                                {!m.deletedAt && (
                                    <span className="hidden group-hover:flex items-center gap-0.5 ml-1">
                                        <button className="p-0.5 hover:text-white" title="React" onClick={() => void addReaction(m)}>
                                            <LuSmile className="size-3" />
                                        </button>
                                        <button className="p-0.5 hover:text-white" title="Reply" onClick={() => setReplyTo(m)}>
                                            <LuReply className="size-3" />
                                        </button>
                                        {mine && m.ciphertext && (
                                            <button className="p-0.5 hover:text-white" title="Edit" onClick={() => { setEditing(m); setDraft("") }}>
                                                <LuPencil className="size-3" />
                                            </button>
                                        )}
                                        <button className="p-0.5 hover:text-red-400" title="Delete" onClick={() => deleteMessage(m)}>
                                            <LuTrash2 className="size-3" />
                                        </button>
                                    </span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Reply banner */}
            {replyTo && (
                <div className="px-3 py-1 text-xs text-[--muted] flex items-center justify-between border-t border-[--border]">
                    <span className="truncate">Replying to: {decrypted[replyTo.id]?.text ?? "[encrypted]"}</span>
                    <button onClick={() => setReplyTo(null)}><LuX className="size-3" /></button>
                </div>
            )}
            {editing && (
                <div className="px-3 py-1 text-xs text-[--muted] flex items-center justify-between border-t border-[--border]">
                    <span className="truncate">Editing message</span>
                    <button onClick={() => { setEditing(null); setDraft("") }}><LuX className="size-3" /></button>
                </div>
            )}

            {/* Composer */}
            <div className="p-3 border-t border-[--border] flex items-center gap-2">
                <ChatImagePicker
                    conversationKey={conversationKey}
                    peerId={peerId}
                    onSent={() => { /* caches invalidate via WS */ }}
                />
                <TextInput
                    value={draft}
                    onValueChange={onDraftChange}
                    placeholder={conversationKey ? "Write a message…" : "Deriving keys…"}
                    disabled={!conversationKey}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            void submit()
                        }
                    }}
                    className="flex-1"
                />
                <Button intent="white" size="sm" disabled={!conversationKey || !draft.trim()} onClick={() => void submit()}>
                    Send
                </Button>
            </div>
        </div>
    )
}

/**
 * Builds a blob URL for an encrypted chat image: fetches the encrypted blob,
 * decrypts it in the browser, and revokes cleanly on unmount.
 */
function buildChatImageUrl(conversationKey: CryptoKey, imageId: string, imageIv: string): Promise<string> {
    return (async () => {
        const res = await fetch(`/api/v1/chat/image/${imageId}`, { credentials: "include" })
        if (!res.ok) throw new Error("image fetch failed")
        const buf = new Uint8Array(await res.arrayBuffer())
        const { decryptBytes } = await import("@/lib/encryption/chat-crypto")
        const bytes = await decryptBytes(conversationKey, imageIv, arrayBufferToBase64(buf))
        const blob = new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" })
        return URL.createObjectURL(blob)
    })()
}

function arrayBufferToBase64(buf: Uint8Array): string {
    let s = ""
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
    return btoa(s)
}

function ChatImage({ url }: { url: string }) {
    React.useEffect(() => {
        return () => {
            if (url.startsWith("blob:")) URL.revokeObjectURL(url)
        }
    }, [url])
    return <img src={url} alt="Encrypted image" className="max-w-xs rounded-lg" />
}

function ChatImagePicker({ conversationKey, peerId, onSent }: {
    conversationKey: CryptoKey | null
    peerId: number
    onSent: () => void
}) {
    const { mutate: upload } = useUploadChatImage()
    const { mutate: send } = useSendChatMessage()
    const fileRef = React.useRef<HTMLInputElement>(null)

    const pick = () => fileRef.current?.click()

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file || !conversationKey) return
        if (file.size > 8 * 1024 * 1024) {
            toast.error("Image too large (max 8MB)")
            return
        }
        const bytes = new Uint8Array(await file.arrayBuffer())
        const sealed = await encryptBytes(conversationKey, bytes)
        upload({
            toProfileId: peerId,
            iv: sealed.iv,
            ciphertext: sealed.ciphertext,
        }, {
            onSuccess: (resp) => {
                if (!resp?.imageId) return
                // Image-only message: empty ciphertext, imageId set.
                send({ toProfileId: peerId, iv: "", ciphertext: "", imageId: resp.imageId, imageIv: sealed.iv })
                onSent()
            },
        })
    }

    return (
        <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e)} />
            <Button intent="gray-basic" size="sm" disabled={!conversationKey} onClick={pick} title="Send image">
                <LuImage className="size-4" />
            </Button>
        </>
    )
}
