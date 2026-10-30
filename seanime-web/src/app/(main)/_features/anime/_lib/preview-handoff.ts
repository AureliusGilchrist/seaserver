// Netflix-style hand-off from an episode card's hover preview to the player: clicking play while the
// preview runs fades the screen from the preview's frame into the player, which starts where the
// preview was. The preview registers its <video>; the card's click takes the position and shows the
// frame full-screen; the player consumes the position when the stream can play and fades the frame
// out. Plain DOM, so it works across the route change between the card and the player.

type Active = { path: string, video: HTMLVideoElement }
type Pending = { path: string, time: number, expiresAt: number }

let active: Active | null = null
let pending: Pending | null = null
let overlay: HTMLDivElement | null = null
let overlayTimer: ReturnType<typeof setTimeout> | null = null

export function registerActivePreview(path: string, video: HTMLVideoElement) {
    active = { path, video }
}

export function clearActivePreview(video: HTMLVideoElement) {
    if (active?.video === video) active = null
}

/**
 * Called on a card click. When that card's preview is playing, records its position for the
 * player and starts the fade. Returns whether it did.
 */
export function handoffFromPreview(path: string | undefined): boolean {
    if (!path || !active || active.path !== path) return false
    const video = active.video
    if (!(video.currentTime > 0) || video.readyState < 2) return false
    pending = { path, time: video.currentTime, expiresAt: Date.now() + 60_000 }
    showOverlay(video)
    return true
}

/** The position to start at, once, when the player opens the same file. */
export function takePendingPreviewResume(path: string | undefined): number | null {
    const p = pending
    if (!p) return null
    if (p.expiresAt < Date.now()) {
        pending = null
        return null
    }
    if (path && p.path !== path) return null
    pending = null
    return p.time
}

/** Fades the hand-off frame away (the player is showing). */
export function finishPreviewTransition() {
    if (!overlay) return
    const el = overlay
    overlay = null
    if (overlayTimer) clearTimeout(overlayTimer)
    el.style.opacity = "0"
    setTimeout(() => el.remove(), 700)
}

function showOverlay(video: HTMLVideoElement) {
    finishPreviewTransition()
    const el = document.createElement("div")
    el.setAttribute("data-preview-handoff", "")
    Object.assign(el.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483000",
        background: "#000",
        opacity: "0",
        transition: "opacity 450ms ease",
        pointerEvents: "none",
    } as CSSStyleDeclaration)
    // The frame the preview was on, filling the screen, so the cut into the player is seamless.
    try {
        const canvas = document.createElement("canvas")
        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
        Object.assign(canvas.style, { width: "100%", height: "100%", objectFit: "contain", transform: "scale(1.02)", transition: "transform 900ms ease" } as CSSStyleDeclaration)
        el.appendChild(canvas)
        requestAnimationFrame(() => {
            canvas.style.transform = "scale(1)"
        })
    }
    catch {
        // A frame that can't be drawn leaves a plain black fade.
    }
    document.body.appendChild(el)
    // Tracked, or finishPreviewTransition() can't find it and the frame stays over the player for good.
    overlay = el
    requestAnimationFrame(() => {
        el.style.opacity = "1"
    })
    // Never left over the app if the player doesn't open.
    overlayTimer = setTimeout(finishPreviewTransition, 8000)
}
