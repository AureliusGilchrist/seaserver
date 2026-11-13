import { WatchParty_ChatMessage } from "@/api/generated/types"
import { watchPartyChatMessagesAtom } from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { colorFor, isEmojiOnly, splitEmoji } from "@/app/(main)/watch-party/_components/watch-party-ui"
import { useAtomValue } from "jotai"
import React from "react"
import { createPortal } from "react-dom"

/**
 * Niconico-style reactions: every emoji sent to the room flies across the picture from right
 * to left, on everyone's screen. Lives over the stage, and follows the player into fullscreen.
 */

const LANES = 7
const MAX_FLYING = 60

type Flyer = {
    id: string
    text: string
    name?: string
    lane: number
    delay: number
    showName: boolean
    duration: number
    size: number
    wobble: number
}

export function WatchPartyDanmaku({ stageRef }: { stageRef: React.RefObject<HTMLElement | null> }) {
    const messages = useAtomValue(watchPartyChatMessagesAtom)
    const [flyers, setFlyers] = React.useState<Flyer[]>([])

    // Only messages that arrive while the room is open fly; history doesn't replay.
    const seenRef = React.useRef<Set<string> | null>(null)
    const laneFreeAtRef = React.useRef<number[]>(Array(LANES).fill(0))

    React.useEffect(() => {
        if (seenRef.current === null) {
            seenRef.current = new Set(messages.map(m => m.id))
            return
        }
        const fresh: WatchParty_ChatMessage[] = []
        for (const m of messages) {
            if (seenRef.current.has(m.id)) continue
            seenRef.current.add(m.id)
            if (m.kind === "user" && isEmojiOnly(m.text)) fresh.push(m)
        }
        // Chat history lands in one batch once the room opens; live reactions trickle in.
        // Anything from a big batch or more than a minute old is history.
        const recent = fresh.filter(m => {
            const t = Date.parse(m.timestamp ?? "")
            return !Number.isNaN(t) && Math.abs(Date.now() - t) < 60_000
        })
        if (!recent.length || recent.length > 8) return
        fresh.splice(0, fresh.length, ...recent)

        const now = performance.now()
        // A multi-emoji reaction flies as a little volley, one emoji at a time.
        const pieces = fresh.flatMap(m => splitEmoji(m.text).map((text, i) => ({ m, text, i })))
        const add = pieces.map(({ m, text, i }) => {
            // The lane that frees up soonest, so bursts spread out instead of stacking.
            const lanes = laneFreeAtRef.current
            let lane = 0
            for (let j = 1; j < LANES; j++) if (lanes[j] < lanes[lane]) lane = j
            if (lanes[lane] > now + i * 260) lane = Math.floor(Math.random() * LANES)
            const duration = 5200 + Math.random() * 2200
            lanes[lane] = now + i * 260 + duration * 0.28
            return {
                id: `${m.id}:${i}`,
                text,
                delay: i * 260,
                showName: i === 0,
                name: m.username,
                lane,
                duration,
                size: 2.4 + Math.random() * 1.4,
                wobble: (Math.random() - 0.5) * 24,
            }
        })
        setFlyers(prev => [...prev, ...add].slice(-MAX_FLYING))
    }, [messages])

    // Fly inside the fullscreen element when the player is fullscreen.
    const [fsTarget, setFsTarget] = React.useState<Element | null>(null)
    React.useEffect(() => {
        const update = () => {
            const fs = document.fullscreenElement
            setFsTarget(fs && stageRef.current?.contains(fs) ? fs : null)
        }
        document.addEventListener("fullscreenchange", update)
        return () => document.removeEventListener("fullscreenchange", update)
    }, [stageRef])

    const remove = React.useCallback((id: string) => {
        setFlyers(prev => prev.filter(f => f.id !== id))
    }, [])

    if (!flyers.length) return null

    const layer = (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden z-[60]"
            data-watch-party-danmaku
        >
            {flyers.map(f => <FlyingEmoji key={f.id} flyer={f} onDone={remove} />)}
        </div>
    )

    return fsTarget ? createPortal(layer, fsTarget) : layer
}

function FlyingEmoji({ flyer, onDone }: { flyer: Flyer, onDone: (id: string) => void }) {
    const ref = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        const el = ref.current
        const parent = el?.parentElement
        if (!el || !parent) return
        const travel = parent.clientWidth + el.offsetWidth + 40
        const anim = el.animate([
            { transform: `translateX(0) translateY(0) rotate(0deg)`, opacity: 0 },
            { opacity: 1, offset: 0.04 },
            { transform: `translateX(${-travel * 0.5}px) translateY(${flyer.wobble}px) rotate(${flyer.wobble / 3}deg)`, offset: 0.5 },
            { opacity: 1, offset: 0.96 },
            { transform: `translateX(${-travel}px) translateY(0) rotate(0deg)`, opacity: 0 },
        ], { duration: flyer.duration, delay: flyer.delay, easing: "linear", fill: "both" })
        anim.onfinish = () => onDone(flyer.id)
        return () => anim.cancel()
    }, [])

    const top = 6 + (flyer.lane / (LANES - 1)) * 64 // % — keep clear of the control bar

    return (
        <div
            ref={ref}
            className="absolute left-full flex flex-col items-center gap-1 will-change-transform"
            style={{ top: `${top}%` }}
        >
            <span
                className="leading-none select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
                style={{ fontSize: `${flyer.size}rem` }}
            >
                {flyer.text}
            </span>
            {flyer.name && flyer.showName && (
                <span
                    className="rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] font-semibold whitespace-nowrap"
                    style={{ color: colorFor(flyer.name) }}
                >
                    {flyer.name}
                </span>
            )}
        </div>
    )
}
