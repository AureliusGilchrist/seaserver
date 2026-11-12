// Fork (Electron): only one window plays at a time, and the popout player always wins.
//
// The popout window reports whether it is playing over a BroadcastChannel (on every change, plus
// a heartbeat so a main window that reloads, or a popout that crashed, is still right), and — on
// the same heartbeat — that it exists at all, which is what keeps the main window's player
// blurred with a "Return pip" box for as long as the pip is open, paused or not. While the
// popout plays, the main window pauses everything it is playing and refuses to start anything
// else. The main window lets go of that rule only when it takes playback back from the popout
// (the user asked for that, and the popout is closing).
//
// The two windows also keep one episode between them, both ways: the popout reports the file it is
// on ("popout-open", "popout-closed") and the main window's player follows it; the main window
// reports the file it moves to ("main-path") and the popout follows that. Each window only says
// what changed, and never repeats back what it was told (see noteFollowedPopoutPath), so the two
// cannot argue over a file.

import { hasPendingPopoutHandoff, isPopoutHandoffGiving, setPopoutReturnTime } from "./video-core-popout-resume"

const CHANNEL_NAME = "vc-single-playback"
const HEARTBEAT_MS = 1000
// A popout that stopped reporting (crashed, closed without "pagehide") stops counting after this.
const STALE_MS = 3500
// After a return the popout keeps playing for a moment until the main window has the stream; its
// reports are ignored that long.
const RETURN_GRACE_MS = 10_000
// A file the main window was told to take by the popout is not announced back for this long.
const FOLLOWED_TTL_MS = 5000
// A popout still starting up holds the main window's file this long (retrying this often) before
// it is given up on.
const FOLLOW_RETRY_MS = 300
const FOLLOW_GIVE_UP_MS = 60_000

type Message =
    | { type: "popout-state", playing: boolean }
    | { type: "popout-open", path?: string }
    | { type: "popout-closed", path?: string, time?: number }
    | { type: "main-path", path: string }
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

/**
 * Popout window: the file now playing here; announced to the main window right away. The player has
 * no playback info for a moment between episodes; that gap is not a file, so the last one stays.
 */
export function setPopoutCurrentPath(path: string | null | undefined) {
    if (!path || path === popoutCurrentPath) return
    popoutCurrentPath = path
    announcePopoutPresence?.()
}

/** Popout window: the file this window is on, or last was on. */
export function getPopoutCurrentPath() {
    return popoutCurrentPath
}

// The file the main window's player is on, as last announced, waiting for this window to take it.
let wantedMainPath: string | undefined
let followTimer: number | undefined
const mainPathListeners = new Set<(path: string) => void>()

/**
 * Popout window: subscribe to the main window's episode. The listener is told to play that file
 * (it is not delivered when this window is on it already). From the moment it is told, this window
 * counts as being on the file, so its heartbeat does not pull the main window back to the old one;
 * a listener whose stream then fails puts the file it really is on back with setPopoutCurrentPath.
 */
export function onMainPathChange(listener: (path: string) => void): () => void {
    mainPathListeners.add(listener)
    return () => mainPathListeners.delete(listener)
}

function followMainPath(path: string) {
    wantedMainPath = path
    applyMainPath(Date.now() + FOLLOW_GIVE_UP_MS)
}

// Taken once this window has an episode of its own that is settled. A popout still starting (no
// file yet, or a handoff still waiting to put the main window's position on its first stream) would
// carry that position over to the wrong file, so the latest file wanted waits for it.
function applyMainPath(giveUpAt: number) {
    window.clearTimeout(followTimer)
    followTimer = undefined
    const path = wantedMainPath
    if (!path || path === popoutCurrentPath) {
        wantedMainPath = undefined
        return
    }
    if (!popoutCurrentPath || hasPendingPopoutHandoff()) {
        if (Date.now() < giveUpAt) followTimer = window.setTimeout(() => applyMainPath(giveUpAt), FOLLOW_RETRY_MS)
        return
    }
    wantedMainPath = undefined
    popoutCurrentPath = path
    mainPathListeners.forEach(l => {
        try {
            l(path)
        }
        catch {
        }
    })
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
        const msg = event.data
        if (msg?.type === "query") {
            report(true)
            announceOpen()
        } else if (msg?.type === "main-path" && msg.path) {
            followMainPath(msg.path)
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
        // The pip's final position, whichever way it was closed: the main window plays on from it.
        const video = document.querySelector("video")
        const time = video && Number.isFinite(video.currentTime) && video.currentTime > 0 ? video.currentTime : undefined
        post({ type: "popout-closed", path: popoutCurrentPath, time })
    }
    window.addEventListener("pagehide", onHide)
    announceOpen()
    report(true)

    return () => {
        if (announcePopoutPresence === announceOpen) announcePopoutPresence = null
        window.clearTimeout(followTimer)
        followTimer = undefined
        wantedMainPath = undefined
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

// The file the popout is on, as last reported. Listeners hear about every distinct path, the first
// one included: when the main player is already on it, following is a no-op; when it is not (a
// change that was missed, a reload while the pip was open) this is what puts it back in step.
let popoutPathNow: string | undefined
const popoutPathListeners = new Set<(path: string) => void>()

/** Main window: subscribe to the popout's episode. The current one is delivered on subscribe. */
export function onPopoutPathChange(listener: (path: string) => void): () => void {
    popoutPathListeners.add(listener)
    if (popoutPathNow) {
        try {
            listener(popoutPathNow)
        }
        catch {
        }
    }
    return () => popoutPathListeners.delete(listener)
}

function setPopoutPath(path: string | undefined) {
    if (!path || path === popoutPathNow) return
    popoutPathNow = path
    popoutPathListeners.forEach(l => {
        try {
            l(path)
        }
        catch {
        }
    })
}

const popoutClosedListeners = new Set<(path: string, time: number) => void>()

/** Main window: the pip went away (closed or returned), with the file and second it was on. */
export function onPopoutClosed(listener: (path: string, time: number) => void): () => void {
    popoutClosedListeners.add(listener)
    return () => popoutClosedListeners.delete(listener)
}

/** Main window: whether the popout window exists right now (playing or paused). */
export function isPopoutPresent() {
    return popoutPresentNow
}

// Files this window's player was moved to because the popout was on them, oldest first. The change
// that follows is the popout's own and is not announced back: the popout is on that file already,
// and an echo that reaches it after it has moved on would drag it back.
const followedPopoutPaths: { path: string, at: number }[] = []

/** Main window: the player is being moved to the popout's file (announceMainPath will not echo it). */
export function noteFollowedPopoutPath(path: string) {
    followedPopoutPaths.push({ path, at: Date.now() })
    if (followedPopoutPaths.length > 8) followedPopoutPaths.shift()
}

/**
 * Main window: this window's player is now on `path` (picked here, started here, or moved on by
 * itself), so the popout moves to it too. Announce changes only, never the file a window loaded
 * with — a main window that reloaded must not drag a popout that is already elsewhere back to the
 * file it had stored. Not announced when the popout was what put the player there.
 */
export function announceMainPath(path: string | null | undefined) {
    if (!path) return
    const now = Date.now()
    while (followedPopoutPaths.length && now - followedPopoutPaths[0].at > FOLLOWED_TTL_MS) followedPopoutPaths.shift()
    const followed = followedPopoutPaths.map(f => f.path).lastIndexOf(path)
    if (followed >= 0) {
        // Seen now. The ones before it were adopted too, and the player went straight past them
        // (two changes in one render): they are done as well.
        followedPopoutPaths.splice(0, followed + 1)
        return
    }
    const channel = openChannel()
    if (!channel) return
    try {
        channel.postMessage({ type: "main-path", path } satisfies Message)
    }
    catch {
    }
    finally {
        channel.close()
    }
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
            // Wherever the pip ended up is the episode the main player belongs on, whatever
            // changes of episode it missed on the way.
            setPopoutPath(msg.path)
            popoutOpenUntil = 0
            setPopoutPresent(false)
            popoutPathNow = undefined
            if (msg.time && msg.time > 0 && msg.path) {
                console.warn("[POPOUT RETURN] pip closed at", msg.time, msg.path)
                setPopoutReturnTime(msg.path, msg.time)
            }
            if (msg.path) {
                const path = msg.path
                const time = msg.time && msg.time > 0 ? msg.time : 0
                popoutClosedListeners.forEach(l => {
                    try {
                        l(path, time)
                    }
                    catch {
                    }
                })
            }
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
