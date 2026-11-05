// Fork: playback position handed between the main window and the desktop popout window.
//
// The window taking over playback starts its own stream, holds it paused at the handed-over
// second and asks the window giving it up for its live position ("ready" → "position"). It then
// seeks there and plays, and says "started" once it is really playing; only then does the giving
// window stop. Both windows play the same frames for a moment instead of the picture going black
// while the new stream loads, and neither side is left paused.
//
// The two windows are the same origin in the same Electron session, so a BroadcastChannel reaches
// across them. Every step has a timeout that falls back to the old one-shot handoff.

type PopoutResume = { time: number, paused: boolean, handoffId?: string, expiresAt: number }

let pending: PopoutResume | null = null

/** Set by the window taking over, before its stream starts; consumed once when it can play. */
export function setPendingPopoutResume(time: number, paused: boolean, handoffId?: string) {
    pending = { time, paused, handoffId, expiresAt: Date.now() + 60_000 }
}

/** A live handoff is waiting for this window's stream: it must not autoplay over the other window. */
export function hasPendingPopoutHandoff() {
    return !!pending?.handoffId && pending.expiresAt >= Date.now()
}

export function takePendingPopoutResume(): { time: number, paused: boolean, handoffId?: string } | null {
    const current = pending
    pending = null
    if (!current || current.expiresAt < Date.now()) return null
    if (!current.handoffId && !(current.time > 0)) return null
    return { time: current.time, paused: current.paused, handoffId: current.handoffId }
}

const CHANNEL_NAME = "vc-popout-handoff"

export type PopoutReturnRequest = { path: string, time: number, paused: boolean, from?: string }

type HandoffMessage =
    | { type: "ready", id: string }
    | { type: "position", id: string, time: number, paused: boolean }
    | { type: "started", id: string }
    | { type: "failed", id: string }
    | ({ type: "return-request", id: string } & PopoutReturnRequest)
    | { type: "return-ack", id: string }

function openChannel(): BroadcastChannel | null {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null
    try {
        return new BroadcastChannel(CHANNEL_NAME)
    }
    catch {
        return null
    }
}

function post(message: HandoffMessage) {
    const channel = openChannel()
    if (!channel) return
    try {
        channel.postMessage(message)
    }
    finally {
        channel.close()
    }
}

export function newPopoutHandoffId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// A seek in the window taking over lands a little after the position was read; reading slightly
// ahead keeps the picture from stepping back.
const POSITION_LEAD_SECONDS = 0.25

/**
 * The window giving playback up. Answers the taking-over window's "ready" with the live position
 * and calls onStarted once that window is playing (onFailed if it gave up). When nothing comes
 * back within timeoutMs, onTimeout runs instead. Returns a function that cancels the handoff.
 */
export function startPopoutHandoffGiver(opts: {
    id: string
    video: HTMLVideoElement | null
    onStarted: () => void
    onFailed?: () => void
    onTimeout?: () => void
    timeoutMs?: number
}): () => void {
    const { id, video } = opts
    const channel = openChannel()

    // The position also has to be answerable after the video is gone (the page it was on was
    // left), so the last one seen is kept and moved forward by the time since.
    let last = video
        ? { time: video.currentTime, paused: video.paused, rate: video.playbackRate || 1, at: performance.now() }
        : { time: 0, paused: false, rate: 1, at: performance.now() }
    const record = () => {
        if (!video || !video.isConnected) return
        last = { time: video.currentTime, paused: video.paused, rate: video.playbackRate || 1, at: performance.now() }
    }
    const events = ["timeupdate", "play", "pause", "seeked", "ratechange"] as const
    events.forEach(e => video?.addEventListener(e, record))

    const livePosition = () => {
        record()
        const elapsed = last.paused ? 0 : ((performance.now() - last.at) / 1000) * last.rate
        const lead = last.paused ? 0 : POSITION_LEAD_SECONDS * last.rate
        return { time: last.time + elapsed + lead, paused: last.paused }
    }

    let done = false
    const finish = () => {
        if (done) return
        done = true
        window.clearTimeout(timer)
        events.forEach(e => video?.removeEventListener(e, record))
        channel?.close()
    }

    const timer = window.setTimeout(() => {
        if (done) return
        finish()
        opts.onTimeout?.()
    }, opts.timeoutMs ?? 30_000)

    if (channel) {
        channel.onmessage = (event: MessageEvent<HandoffMessage>) => {
            const msg = event.data
            if (!msg || msg.id !== id || done) return
            if (msg.type === "ready") {
                channel.postMessage({ type: "position", id, ...livePosition() } satisfies HandoffMessage)
            } else if (msg.type === "started") {
                finish()
                opts.onStarted()
            } else if (msg.type === "failed") {
                finish()
                opts.onFailed?.()
            }
        }
    }

    return finish
}

/**
 * The window taking over: asks the giving window for its live position. Resolves with that, or
 * with the fallback when no answer comes in time (the giving window is gone or never listened).
 */
export function requestPopoutHandoffPosition(id: string, fallback: { time: number, paused: boolean }, timeoutMs = 1500) {
    return new Promise<{ time: number, paused: boolean, live: boolean }>(resolve => {
        const channel = openChannel()
        if (!channel) {
            resolve({ ...fallback, live: false })
            return
        }
        let settled = false
        const settle = (value: { time: number, paused: boolean, live: boolean }) => {
            if (settled) return
            settled = true
            window.clearInterval(retry)
            window.clearTimeout(timer)
            channel.close()
            resolve(value)
        }
        channel.onmessage = (event: MessageEvent<HandoffMessage>) => {
            const msg = event.data
            if (msg?.type === "position" && msg.id === id && Number.isFinite(msg.time)) {
                settle({ time: Math.max(0, msg.time), paused: !!msg.paused, live: true })
            }
        }
        const ask = () => channel.postMessage({ type: "ready", id } satisfies HandoffMessage)
        ask()
        // A message sent before the other side's listener was attached is simply lost.
        const retry = window.setInterval(ask, 250)
        const timer = window.setTimeout(() => settle({ ...fallback, live: false }), timeoutMs)
    })
}

/** The window taking over is playing (or holding paused, as asked): the giving window can stop. */
export function announcePopoutHandoffStarted(id: string) {
    post({ type: "started", id })
}

/** The window taking over could not start: the giving window keeps playing. */
export function announcePopoutHandoffFailed(id: string) {
    post({ type: "failed", id })
}

/**
 * Popout → main: asks the main window to take playback back while the popout keeps playing.
 * Resolves true once the main window has accepted (it then runs the "ready" exchange above),
 * false when it did not answer — the caller then falls back to the one-shot return.
 */
export function requestPopoutReturn(id: string, request: PopoutReturnRequest, timeoutMs = 1000) {
    return new Promise<boolean>(resolve => {
        const channel = openChannel()
        if (!channel) {
            resolve(false)
            return
        }
        const timer = window.setTimeout(() => {
            channel.close()
            resolve(false)
        }, timeoutMs)
        channel.onmessage = (event: MessageEvent<HandoffMessage>) => {
            const msg = event.data
            if (msg?.type === "return-ack" && msg.id === id) {
                window.clearTimeout(timer)
                channel.close()
                resolve(true)
            }
        }
        channel.postMessage({ type: "return-request", id, ...request } satisfies HandoffMessage)
    })
}

// Paths handed back over the channel recently. The popout still calls the shell's return IPC at
// the end (it raises the main window and closes the popout), and the shell then re-sends the
// return event: that one must not restart the stream the main window already took over.
const recentReturns = new Map<string, number>()

export function wasReturnedOverChannel(path: string) {
    const at = recentReturns.get(path)
    if (at === undefined) return false
    recentReturns.delete(path)
    return Date.now() - at < 60_000
}

/** Main window: accept return requests from the popout. Returns an unsubscribe function. */
export function listenForPopoutReturns(onRequest: (request: PopoutReturnRequest, id: string) => boolean): () => void {
    const channel = openChannel()
    if (!channel) return () => {}
    channel.onmessage = (event: MessageEvent<HandoffMessage>) => {
        const msg = event.data
        if (msg?.type !== "return-request" || typeof msg.path !== "string") return
        const accepted = onRequest({ path: msg.path, time: msg.time, paused: msg.paused, from: msg.from }, msg.id)
        if (!accepted) return
        recentReturns.set(msg.path, Date.now())
        channel.postMessage({ type: "return-ack", id: msg.id } satisfies HandoffMessage)
    }
    return () => channel.close()
}
