/**
 * Recovery from a decode error part-way through a file.
 *
 * Chromium's decoder sometimes chokes on one bad packet (PIPELINE_ERROR_DECODE) in a file that plays
 * fine past it. Reloading the same source just after that point, up to twice per source, gets past
 * it. Every player goes through this (the main window's, the popout window's native player, online
 * streams), and more than one error listener may ask about the same error: each error is decided
 * once, and every listener gets the same answer.
 */

const MAX_RETRIES = 2

type RecoveryState = { src: string, retries: number, lastError: MediaError | null, lastHandled: boolean }

const states = new WeakMap<HTMLVideoElement, RecoveryState>()

/** Returns true when the error is being recovered from, so callers should not report or act on it. */
export function recoverFromDecodeError(video: HTMLVideoElement, onRetry?: (at: number, attempt: number) => void): boolean {
    const error = video.error
    if (!error) return false
    const src = video.currentSrc || video.src
    if (!src || src.startsWith("blob:")) return false

    let state = states.get(video)
    if (!state || state.src !== src) {
        state = { src, retries: 0, lastError: null, lastHandled: false }
        states.set(video, state)
    }
    // Already decided by another listener for this very error.
    if (state.lastError === error) return state.lastHandled
    state.lastError = error

    if (error.code !== MediaError.MEDIA_ERR_DECODE || state.retries >= MAX_RETRIES) {
        state.lastHandled = false
        return false
    }

    state.retries++
    state.lastHandled = true
    const attempt = state.retries
    const at = video.currentTime
    const resumeAt = at + 1.5 * attempt
    onRetry?.(at, attempt)

    const onMeta = () => {
        video.removeEventListener("loadedmetadata", onMeta)
        const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 1) : resumeAt
        video.currentTime = Math.min(resumeAt, end)
        video.play().catch(() => {})
    }
    video.addEventListener("loadedmetadata", onMeta)
    video.src = src
    video.load()
    return true
}
