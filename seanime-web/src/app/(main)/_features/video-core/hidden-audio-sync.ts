/**
 * Keeps a hidden <audio> element in step with a (muted) <video>.
 *
 * Used for direct play when the chosen audio track is not the file's default: Chromium can't switch
 * embedded audio tracks, so the server extracts the track and it plays alongside the picture.
 *
 * The previous loops checked every animation frame and hard-seeked the audio whenever it was a few
 * tenths of a second off. A seek takes time to land; the video keeps going; the gap crossed the
 * threshold again; another seek — a stream of tiny repeated chunks that sounded like a scratched
 * record. Buffering made it worse: a stalled video isn't "paused", so the audio ran ahead and was
 * yanked back over and over.
 *
 * This version follows the video's events (play, pause, rate, seeks, buffering) directly, and
 * corrects drift gently four times a second: small drift is absorbed by nudging the audio's speed by
 * a few percent, only a large gap gets one hard seek, and nothing is corrected while either element
 * is seeking or the video is buffering.
 */

const CHECK_INTERVAL_MS = 250
/** Below this, the two are in sync: the audio plays at exactly the video's rate. */
const IN_SYNC_SECONDS = 0.04
/** Above this, gliding back would take too long: one hard seek. */
const HARD_SEEK_SECONDS = 1
/** After any seek, let both elements settle before judging drift again. */
const SEEK_COOLDOWN_MS = 1500
/** Largest speed change used to close a gap (±4 %, below what ears notice as pitch). */
const MAX_NUDGE = 0.04

export type HiddenAudioSyncLog = (message: string) => void

export function attachHiddenAudioSync(
    video: HTMLVideoElement,
    audio: HTMLAudioElement,
    /** Seconds the audio should lead the picture (positive) or trail it (negative). Read every pass. */
    getDelay: () => number,
    log?: HiddenAudioSyncLog,
): () => void {
    let cooldownUntil = 0
    let buffering = false
    let disposed = false

    const target = () => video.currentTime + (getDelay() || 0)

    const hardSeek = (reason: string) => {
        const to = Math.max(0, target())
        const from = audio.currentTime
        audio.currentTime = to
        audio.playbackRate = video.playbackRate
        cooldownUntil = Date.now() + SEEK_COOLDOWN_MS
        if (Math.abs(to - from) > 0.25) log?.(`audio resynced (${reason}): ${from.toFixed(2)}s → ${to.toFixed(2)}s`)
    }

    const shouldPlay = () => !video.paused && !video.ended && !buffering

    const followPlayState = () => {
        if (disposed) return
        if (shouldPlay()) {
            if (audio.paused) audio.play().catch(() => {})
        } else if (!audio.paused) {
            audio.pause()
        }
    }

    const onPlay = () => {
        hardSeek("play")
        followPlayState()
    }
    const onPause = () => followPlayState()
    const onSeeking = () => {
        cooldownUntil = Date.now() + SEEK_COOLDOWN_MS
        if (!audio.paused) audio.pause()
    }
    const onSeeked = () => {
        hardSeek("seek")
        followPlayState()
    }
    const onWaiting = () => {
        buffering = true
        followPlayState()
    }
    const onPlaying = () => {
        const wasBuffering = buffering
        buffering = false
        if (wasBuffering) hardSeek("buffering ended")
        followPlayState()
    }
    const onRateChange = () => {
        audio.playbackRate = video.playbackRate
    }
    const onEnded = () => {
        if (!audio.paused) audio.pause()
    }

    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("seeking", onSeeking)
    video.addEventListener("seeked", onSeeked)
    video.addEventListener("waiting", onWaiting)
    video.addEventListener("playing", onPlaying)
    video.addEventListener("ratechange", onRateChange)
    video.addEventListener("ended", onEnded)

    const interval = window.setInterval(() => {
        if (disposed) return
        if (!video.isConnected) {
            audio.pause()
            return
        }
        // A video that dropped below "can play" without a waiting event is still buffering.
        if (!video.paused && video.readyState < 3) {
            if (!buffering) onWaiting()
            return
        }
        if (buffering && video.readyState >= 3 && !video.paused) onPlaying()

        followPlayState()
        if (!shouldPlay() || video.seeking || audio.seeking || Date.now() < cooldownUntil) {
            audio.playbackRate = video.playbackRate
            return
        }

        // Positive drift: the audio is behind where it should be.
        const drift = target() - audio.currentTime
        const abs = Math.abs(drift)
        if (abs < IN_SYNC_SECONDS) {
            audio.playbackRate = video.playbackRate
        } else if (abs < HARD_SEEK_SECONDS) {
            // Glide back: close the gap over roughly two seconds, capped at ±4 % speed.
            const nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, drift / 2))
            audio.playbackRate = video.playbackRate * (1 + nudge)
        } else {
            hardSeek(`drift ${drift.toFixed(2)}s`)
        }
    }, CHECK_INTERVAL_MS)

    // Start aligned.
    audio.playbackRate = video.playbackRate
    hardSeek("start")
    followPlayState()

    return () => {
        disposed = true
        window.clearInterval(interval)
        video.removeEventListener("play", onPlay)
        video.removeEventListener("pause", onPause)
        video.removeEventListener("seeking", onSeeking)
        video.removeEventListener("seeked", onSeeked)
        video.removeEventListener("waiting", onWaiting)
        video.removeEventListener("playing", onPlaying)
        video.removeEventListener("ratechange", onRateChange)
        video.removeEventListener("ended", onEnded)
    }
}
