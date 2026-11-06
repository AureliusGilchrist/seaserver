// Fork (Electron): only one window plays at a time, and the popout player always wins.
//
// The popout window reports whether it is playing over a BroadcastChannel (on every change, plus
// a heartbeat so a main window that reloads, or a popout that crashed, is still right), and — on
// the same heartbeat — that it exists at all, which is what keeps the main window's player
// blurred with a "Return pip" box for as long as the pip is open, paused or not. While the
// popout plays, the main window pauses everything it is playing and refuses to start anything
// else. The main window lets go of that rule only when it takes playback back from the popout
// (the user asked for that, and the popout is closing).

import { isPopoutHandoffGiving } from "./video-core-popout-resume"

const CHANNEL_NAME = "vc-single-playback"
const HEARTBEAT_MS = 1000
// A popout that stopped reporting (crashed, closed without "pagehide") stops counting after this.
const STALE_MS = 3500
// After a return the popout keeps playing for a moment until the main window has the stream; its
// reports are ignored that long.
const RETURN_GRACE_MS = 10_000

type Message =
    | { type: "popout-state", playing: boolean }
    | { type: "popout-open", path?: string }
    | { type: "popout-closed" }
    | { type: "query" }

function openChannel(): BroadcastChannel | null {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null
    try {
        return new BroadcastChannel(CHANNEL_NAME)
    }
    catch {
        return null
    }
}

export function isPopoutPlayerWindow() {
    return typeof window !== "undefined" && window.location.pathname.startsWith("/popout-player")
}

function mediaElements(): HTMLMediaElement[] {
    return Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio"))
}

function anyMediaPlaying() {
    return mediaElements().some(m => !m.paused && !m.ended)
}

// ---------------------------------------------------------------------------------------------
// Popout window

// Set while the popout is handing playback back: it paused itself for that, and must not tell
// the main window it is playing.
let popoutHandingBack = false

export function setPopoutHandingBack(value: boolean) {
    popoutHandingBack = value
}

// The file the popout is on, sent with its presence so the main window's player follows episode
// changes (the position is not synced: the main window gets that only when playback returns).
let popoutCurrentPath: string | undefined
let announcePopoutPresence: (() => void) | null = null

/** Popout window: the file now playing here; announced to the main window right away. */
export function setPopoutCurrentPath(path: string | null | undefined) {
    const next = path || undefined
    if (next === popoutCurrentPath) return
    popoutCurrentPath = next
    announcePopoutPresence?.()
}

/** Popout window: report this window's playing state to the main window. Returns a stop function. */
export function startPopoutPlaybackBeacon(): () => void {
    const channel = openChannel()
    if (!channel) return () => {}

    const playing = () => !popoutHandingBack && anyMediaPlaying()
    let last: boolean | null = null
    const report = (force = false) => {
        const now = playing()
        if (!force && now === last) return
        last = now
        try {
            channel.postMessage({ type: "popout-state", playing: now } satisfies Message)
        }
        catch {
        }
    }
    const onChange = () => report()

    // Presence: the main window blurs its player for as long as this window exists — paused
    // or playing — so the heartbeat reports "open" every tick, not just the playing state.
    const post = (message: Message) => {
        try {
            channel.postMessage(message)
        }
        catch {
        }
    }
    const announceOpen = () => post({ type: "popout-open", path: popoutCurrentPath })
    announcePopoutPresence = announceOpen
    const events = ["play", "playing", "pause", "ended", "emptied"] as const
    events.forEach(e => document.addEventListener(e, onChange, true))
    channel.onmessage = (event: MessageEvent<Message>) => {
        if (event.data?.type === "query") {
            report(true)
            announceOpen()
        }
    }
    const heartbeat = window.setInterval(() => {
        announceOpen()
        if (playing()) report(true)
        else report()
    }, HEARTBEAT_MS)
    const onHide = () => {
        last = false
        post({ type: "popout-state", playing: false })
        post({ type: "popout-closed" })
    }
    window.addEventListener("pagehide", onHide)
    announceOpen()
    report(true)

    return () => {
        if (announcePopoutPresence === announceOpen) announcePopoutPresence = null
        events.forEach(e => document.removeEventListener(e, onChange, true))
        window.clearInterval(heartbeat)
        window.removeEventListener("pagehide", onHide)
        onHide()
        channel.close()
    }
}

// ---------------------------------------------------------------------------------------------
// Main window

let popoutPlayingUntil = 0
let ignorePopoutUntil = 0
// Whether the popout counts as playing right now, and who wants to know when that changes
// (the main window's "Return pip" overlay renders off this).
let popoutPlayingNow = false
const popoutPlayingListeners = new Set<(playing: boolean) => void>()

// Whether the popout window exists at all — playing or paused. Its player here stays
// blurred with a "Return pip" box for as long as it does.
let popoutOpenUntil = 0
let popoutPresentNow = false
const popoutPresentListeners = new Set<(present: boolean) => void>()

// The file the popout is on, as last reported; listeners hear about each change.
let popoutPathNow: string | undefined
const popoutPathListeners = new Set<(path: string) => void>()

/** Main window: subscribe to the popout changing episode. Returns an unsubscribe function. */
export function onPopoutPathChange(listener: (path: string) => void): () => void {
    popoutPathListeners.add(listener)
    return () => popoutPathListeners.delete(listener)
}

function setPopoutPath(path: string | undefined) {
    if (!path || path === popoutPathNow) return
    const first = popoutPathNow === undefined
    popoutPathNow = path
    // The first path is the episode this pip opened on, which this window is already on (it is
    // what was popped out). Only later changes are the pip moving to another episode.
    if (first) return
    popoutPathListeners.forEach(l => {
        try {
            l(path)
        }
        catch {
        }
    })
}

export function isPopoutPlaying() {
    return Date.now() < popoutPlayingUntil && Date.now() >= ignorePopoutUntil
}

/** Main window: subscribe to the popout's playing state. Returns an unsubscribe function. */
export function onPopoutPlayingChange(listener: (playing: boolean) => void): () => void {
    popoutPlayingListeners.add(listener)
    listener(popoutPlayingNow)
    return () => popoutPlayingListeners.delete(listener)
}

/** Main window: subscribe to whether the popout window exists (even paused). */
export function onPopoutPresentChange(listener: (present: boolean) => void): () => void {
    popoutPresentListeners.add(listener)
    listener(popoutPresentNow)
    return () => popoutPresentListeners.delete(listener)
}

function setPopoutPlayingNow(playing: boolean) {
    if (playing === popoutPlayingNow) return
    popoutPlayingNow = playing
    popoutPlayingListeners.forEach(l => {
        try {
            l(playing)
        }
        catch {
        }
    })
}

function setPopoutPresent(present: boolean) {
    if (present === popoutPresentNow) return
    popoutPresentNow = present
    popoutPresentListeners.forEach(l => {
        try {
            l(present)
        }
        catch {
        }
    })
}

/** Main window: playback is coming back from the popout, so this window may play again. */
export function releasePopoutPriority() {
    popoutPlayingUntil = 0
    ignorePopoutUntil = Date.now() + RETURN_GRACE_MS
    setPopoutPlayingNow(false)
}

function pauseAll(except?: EventTarget | null) {
    for (const m of mediaElements()) {
        if (m === except) continue
        if (!m.paused) m.pause()
    }
}

/**
 * Main window: pause everything while the popout plays, and stop anything that starts meanwhile.
 * onBlocked runs when a play here was stopped. Returns a stop function.
 */
export function startMainWindowPlaybackGuard(onBlocked?: () => void): () => void {
    const channel = openChannel()
    if (!channel) return () => {}

    channel.onmessage = (event: MessageEvent<Message>) => {
        const msg = event.data
        if (msg?.type === "popout-open") {
            popoutOpenUntil = Date.now() + STALE_MS
            setPopoutPresent(true)
            setPopoutPath(msg.path)
            return
        }
        if (msg?.type === "popout-closed") {
            popoutOpenUntil = 0
            setPopoutPresent(false)
            popoutPathNow = undefined
            return
        }
        if (msg?.type !== "popout-state") return
        if (Date.now() < ignorePopoutUntil) return
        if (msg.playing) {
            const wasPlaying = isPopoutPlaying()
            popoutPlayingUntil = Date.now() + STALE_MS
            setPopoutPlayingNow(true)
            if (!wasPlaying) pauseAll()
        } else {
            popoutPlayingUntil = 0
            setPopoutPlayingNow(false)
        }
    }

    // A popout that went away without a final word (crashed, closed without "pagehide") stops
    // counting — as playing and as open — once its last report goes stale, so the "Return pip"
    // overlay comes down with it instead of hanging over the player forever.
    const staleTimer = window.setInterval(() => {
        if (popoutPlayingNow && !isPopoutPlaying()) setPopoutPlayingNow(false)
        if (popoutPresentNow && Date.now() >= popoutOpenUntil) {
            setPopoutPresent(false)
            popoutPathNow = undefined
        }
    }, HEARTBEAT_MS)

    const onPlay = (event: Event) => {
        // Blocked while the popout plays, and while it is merely open: the main player follows
        // the popout's episode under the blur and must not start playing by itself.
        const holding = !isPopoutHandoffGiving() && (isPopoutPlaying() || (popoutPresentNow && Date.now() >= ignorePopoutUntil))
        if (!holding) return
        const media = event.target
        if (!(media instanceof HTMLMediaElement)) return
        media.pause()
        onBlocked?.()
    }
    document.addEventListener("play", onPlay, true)
    document.addEventListener("playing", onPlay, true)

    // A popout already open when this window (re)loads.
    try {
        channel.postMessage({ type: "query" } satisfies Message)
    }
    catch {
    }

    return () => {
        document.removeEventListener("play", onPlay, true)
        document.removeEventListener("playing", onPlay, true)
        window.clearInterval(staleTimer)
        setPopoutPlayingNow(false)
        setPopoutPresent(false)
        popoutPathNow = undefined
        channel.close()
    }
}
