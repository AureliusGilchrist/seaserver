import { getServerBaseUrl } from "@/api/client/server-url"
import { WatchParty_Participant } from "@/api/generated/types"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { MdOutlineSettingsRemote } from "react-icons/md"

/** Shared look for the watch party: avatars, live badge, ambient backdrop. */

const GRADIENTS = [
    ["#f43f5e", "#a855f7"],
    ["#ec4899", "#f97316"],
    ["#8b5cf6", "#3b82f6"],
    ["#6366f1", "#06b6d4"],
    ["#0ea5e9", "#10b981"],
    ["#14b8a6", "#84cc16"],
    ["#22c55e", "#eab308"],
    ["#f59e0b", "#ef4444"],
]

function hash(s: string) {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return Math.abs(h)
}

/** A stable accent color per name (chat usernames, avatar fallbacks). */
export function colorFor(name: string | undefined) {
    return GRADIENTS[hash(name || "?") % GRADIENTS.length][0]
}

function gradientFor(name: string | undefined) {
    const [a, b] = GRADIENTS[hash(name || "?") % GRADIENTS.length]
    return `linear-gradient(135deg, ${a}, ${b})`
}

export const MAX_REACTION_EMOJI = 10

/** True for a message that is only emoji (a reaction): one up to MAX_REACTION_EMOJI. */
export function isEmojiOnly(text: string) {
    const t = text.trim()
    if (!t || t.length > 120) return false
    return /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,10}$/u.test(t)
}

/** The separate emoji of a reaction, keeping skin tones and joined sequences whole. */
export function splitEmoji(text: string): string[] {
    const t = text.replace(/\s+/g, "")
    const Seg = (Intl as any).Segmenter
    if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(t), (x: any) => x.segment as string)
    return Array.from(t)
}

/** Profile pictures uploaded to the server come as server paths. */
export function resolveAvatarUrl(avatar: string | undefined) {
    if (!avatar) return undefined
    if (avatar.startsWith("/")) return `${getServerBaseUrl()}${avatar}`
    return avatar
}

export function WatchPartyAvatar(props: {
    name: string | undefined
    avatar?: string
    size?: "xs" | "sm" | "md" | "lg"
    hasRemote?: boolean
    className?: string
}) {
    const { name, avatar, size = "md", hasRemote, className } = props
    const [broken, setBroken] = React.useState(false)
    const src = !broken ? resolveAvatarUrl(avatar) : undefined
    const dim = { xs: "size-6 text-[0.6rem]", sm: "size-8 text-xs", md: "size-9 text-sm", lg: "size-12 text-base" }[size]

    return (
        <span className={cn("relative inline-flex shrink-0", className)}>
            <span
                className={cn(
                    "rounded-full overflow-hidden flex items-center justify-center font-bold text-white select-none",
                    "ring-2 ring-[#0d0d14]",
                    hasRemote && "ring-brand-400 shadow-[0_0_14px_-2px] shadow-brand-500/70",
                    dim,
                )}
                style={src ? undefined : { background: gradientFor(name) }}
            >
                {src
                    ? <img src={src} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
                    : (name || "?").slice(0, 1).toUpperCase()}
            </span>
            {hasRemote && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-brand-500 text-white p-[2px] ring-2 ring-[#0d0d14]">
                    <MdOutlineSettingsRemote className="size-2.5" />
                </span>
            )}
        </span>
    )
}

export function WatchPartyAvatarStack(props: { participants: WatchParty_Participant[], max?: number, size?: "xs" | "sm" }) {
    const { participants, max = 4, size = "sm" } = props
    const shown = participants.slice(0, max)
    const extra = participants.length - shown.length
    return (
        <span className="flex items-center -space-x-2">
            {shown.map(p => (
                <WatchPartyAvatar key={p.clientId} name={p.username} avatar={p.avatar} size={size} />
            ))}
            {extra > 0 && (
                <span
                    className={cn(
                        "relative rounded-full bg-white/10 backdrop-blur ring-2 ring-[#0d0d14] flex items-center justify-center font-semibold text-gray-200",
                        size === "xs" ? "size-6 text-[0.6rem]" : "size-8 text-xs",
                    )}
                >
                    +{extra}
                </span>
            )}
        </span>
    )
}

export function LiveBadge({ className }: { className?: string }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5",
            "text-[0.65rem] font-bold tracking-widest text-red-300 uppercase",
            className,
        )}>
            <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full rounded-full bg-red-400 opacity-75 animate-ping" />
                <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
            </span>
            Live
        </span>
    )
}

/** Blurred cover art and brand-tinted glows behind a whole surface. */
export function AmbientBackdrop({ image, className }: { image?: string, className?: string }) {
    return (
        <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
            {image && (
                <img
                    src={image}
                    alt=""
                    className="absolute inset-0 size-full object-cover scale-125 blur-3xl opacity-30 saturate-150 transition-opacity duration-1000"
                />
            )}
            <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-brand-500/20 blur-[120px]" />
            <div className="absolute -bottom-48 right-0 size-[30rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-[#0b0b12]/70 to-[#0b0b12]" />
        </div>
    )
}
