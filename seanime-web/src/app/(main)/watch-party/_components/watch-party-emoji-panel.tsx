import { MAX_REACTION_EMOJI } from "@/app/(main)/watch-party/_components/watch-party-ui"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuX } from "react-icons/lu"

/**
 * The "more" reactions: a categorised grid where you tap as many emoji as you like (up to
 * MAX_REACTION_EMOJI), then send them together. Each one flies across the screen.
 */

const CATEGORIES: Array<{ id: string, label: string, icon: string, emoji: string[] }> = [
    {
        id: "faces", label: "Faces", icon: "😀",
        emoji: ["😂", "🤣", "😭", "😆", "😊", "🥹", "😍", "🥰", "😘", "😎", "🤩", "🥳", "😏", "😳", "😱", "😨", "😮", "🫢", "🤯", "😤",
            "😡", "🤬", "😢", "🥲", "😴", "🤤", "🤔", "🫣", "🙄", "😬", "😵‍💫", "🤡", "💀", "👻", "🤖", "👽"],
    },
    {
        id: "hype", label: "Hype", icon: "🔥",
        emoji: ["🔥", "💯", "✨", "⚡", "💥", "🎉", "🎊", "🏆", "👑", "🚀", "💪", "🗿", "⭐", "🌟", "💫", "🎯", "📈", "🆙", "‼️", "⁉️"],
    },
    {
        id: "love", label: "Love", icon: "❤️",
        emoji: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💗", "💓", "💞", "💕", "💘", "💝", "❤️‍🔥", "💔", "😻", "🫶", "💋"],
    },
    {
        id: "hands", label: "Hands", icon: "👏",
        emoji: ["👏", "🙌", "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤘", "👊", "✊", "🙏", "🫡", "👋", "🤝", "👀", "🫵", "☝️", "🖐️"],
    },
    {
        id: "anime", label: "Anime", icon: "🍙",
        emoji: ["🍙", "🍜", "🍣", "🍡", "🍵", "🍥", "🎌", "⛩️", "🗾", "🌸", "🎏", "🏯", "🐉", "🦊", "🐱", "🐼", "⚔️", "🗡️", "🪄", "🔮",
            "👹", "👺", "🥷", "🧙", "🧚", "🌙", "☄️", "🍿", "🎬", "📺"],
    },
    {
        id: "misc", label: "Misc", icon: "🎲",
        emoji: ["🍿", "🥤", "🍕", "🍩", "🧋", "☕", "🎮", "🎧", "📸", "💤", "💢", "💦", "💨", "🕳️", "🌈", "☀️", "❄️", "🌊", "🎵", "❓"],
    },
]

export function WatchPartyEmojiPanel(props: {
    open: boolean
    onClose: () => void
    onSend: (emoji: string[]) => void
    disabled?: boolean
}) {
    const { open, onClose, onSend, disabled } = props
    const [tab, setTab] = React.useState(CATEGORIES[0].id)
    const [picked, setPicked] = React.useState<string[]>([])

    React.useEffect(() => {
        if (!open) setPicked([])
    }, [open])

    if (!open) return null

    const full = picked.length >= MAX_REACTION_EMOJI
    const category = CATEGORIES.find(c => c.id === tab) ?? CATEGORIES[0]

    const add = (e: string) => {
        if (full) return
        setPicked(p => [...p, e])
    }

    const send = () => {
        if (!picked.length) return
        onSend(picked)
        setPicked([])
    }

    return (
        <div
            className={cn(
                "rounded-2xl border border-white/10 bg-[#14141e] shadow-2xl shadow-black/60 overflow-hidden",
                "animate-in fade-in slide-in-from-bottom-2 duration-200",
            )}
            onKeyDown={e => {
                e.stopPropagation()
                if (e.key === "Escape") onClose()
            }}
        >
            {/* Tabs */}
            <div className="flex items-center gap-0.5 px-1.5 pt-1.5 border-b border-white/[0.06]">
                {CATEGORIES.map(c => (
                    <button
                        key={c.id}
                        type="button"
                        title={c.label}
                        onClick={() => setTab(c.id)}
                        className={cn(
                            "relative flex-1 h-9 rounded-t-lg text-lg flex items-center justify-center transition-colors",
                            tab === c.id ? "bg-white/[0.06]" : "opacity-60 hover:opacity-100 hover:bg-white/[0.03]",
                        )}
                    >
                        {c.icon}
                        {tab === c.id && <span className="absolute bottom-0 inset-x-3 h-0.5 rounded-full bg-brand-400" />}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={onClose}
                    className="size-8 ml-1 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5"
                    title="Close"
                >
                    <LuX className="size-4" />
                </button>
            </div>

            {/* Grid */}
            <div className="px-2 pt-2 pb-1">
                <p className="px-1 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-gray-500">{category.label}</p>
                <div className="grid grid-cols-8 gap-0.5 max-h-40 overflow-y-auto">
                    {category.emoji.map(e => {
                        const count = picked.filter(p => p === e).length
                        return (
                            <button
                                key={e}
                                type="button"
                                disabled={full || disabled}
                                onClick={() => add(e)}
                                className={cn(
                                    "relative aspect-square rounded-lg text-[1.35rem] leading-none flex items-center justify-center",
                                    "transition-transform hover:scale-125 hover:bg-white/5 active:scale-95 disabled:opacity-30 disabled:hover:scale-100",
                                    count > 0 && "bg-brand-500/15 ring-1 ring-brand-400/40",
                                )}
                            >
                                {e}
                                {count > 0 && (
                                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-brand-500 text-white text-[0.6rem] font-bold flex items-center justify-center">
                                        {count}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Tray */}
            <div className="flex items-center gap-2 px-2.5 py-2 border-t border-white/[0.06] bg-black/20">
                <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto h-8">
                    {picked.length === 0
                        ? <span className="text-xs text-gray-500 px-1">Tap emoji to pick up to {MAX_REACTION_EMOJI}</span>
                        : picked.map((e, i) => (
                            <button
                                key={i}
                                type="button"
                                title="Remove"
                                onClick={() => setPicked(p => p.filter((_, j) => j !== i))}
                                className="shrink-0 size-7 rounded-md text-lg leading-none flex items-center justify-center hover:bg-red-500/20 animate-in zoom-in-50 duration-150"
                            >
                                {e}
                            </button>
                        ))}
                </div>
                <span className={cn("text-[0.65rem] tabular-nums shrink-0", full ? "text-amber-300" : "text-gray-500")}>
                    {picked.length}/{MAX_REACTION_EMOJI}
                </span>
                {picked.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setPicked([])}
                        className="text-xs text-gray-400 hover:text-white px-1.5 shrink-0"
                    >
                        Clear
                    </button>
                )}
                <button
                    type="button"
                    disabled={!picked.length || disabled}
                    onClick={send}
                    className={cn(
                        "shrink-0 rounded-full px-3.5 h-8 text-xs font-semibold transition-all",
                        picked.length
                            ? "bg-brand-500 text-white shadow-lg shadow-brand-500/40 hover:bg-brand-400"
                            : "bg-white/5 text-gray-500",
                    )}
                >
                    Send{picked.length > 1 ? ` ${picked.length}` : ""}
                </button>
            </div>
        </div>
    )
}
