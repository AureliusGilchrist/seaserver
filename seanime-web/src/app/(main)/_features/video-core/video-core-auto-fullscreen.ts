/**
 * One-shot "enter fullscreen when the player is ready" flag, set inside the click that starts
 * playback (the only reliable user-gesture moment) and consumed by video-core's `handleCanPlay`
 * once the video can actually play.
 *
 * Consumed-and-cleared with an expiry, so a stale flag can't fullscreen unrelated later playback
 * (e.g. the click's playback failed and the user navigated elsewhere).
 */

const AUTO_FULLSCREEN_TTL_MS = 60_000

let pending: { expiresAt: number } | null = null

export function requestAutoFullscreen() {
    pending = { expiresAt: Date.now() + AUTO_FULLSCREEN_TTL_MS }
}

export function takePendingAutoFullscreen(): boolean {
    if (!pending) return false
    const valid = pending.expiresAt > Date.now()
    pending = null
    return valid
}
