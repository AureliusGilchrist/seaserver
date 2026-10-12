// Fork: playback position handed back from the popout window. Set by the main window just
// before it restarts the stream, consumed once by the player when the stream can play.
type PopoutResume = { time: number, paused: boolean, expiresAt: number }

let pending: PopoutResume | null = null

export function setPendingPopoutResume(time: number, paused: boolean) {
    pending = { time, paused, expiresAt: Date.now() + 60_000 }
}

export function takePendingPopoutResume(): { time: number, paused: boolean } | null {
    const current = pending
    pending = null
    if (!current || current.expiresAt < Date.now() || !(current.time > 0)) return null
    return { time: current.time, paused: current.paused }
}
