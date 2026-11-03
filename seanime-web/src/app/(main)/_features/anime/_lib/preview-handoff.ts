import { getCssZoom } from "@/lib/interface-scale/interface-scale"

// Netflix-style hand-off from an episode card's hover preview to the player: clicking play while the
// preview runs grows the preview's frame from the card to full-screen and fades it into the player,
// which starts where the preview was. The preview registers its <video>; the card's click takes the
// position and expands the frame; the player consumes the position when the stream can play and
// fades the frame out. Plain DOM, so it works across the route change between the card and the player.

type Active = { path: string, video: HTMLVideoElement }
type Pending = { path: string, time: number, expiresAt: number }

let active: Active | null = null
let pending: Pending | null = null
let overlay: HTMLDivElement | null = null
let overlayTimer: ReturnType<typeof setTimeout> | null = null

const EXPAND_MS = 500
const FADE_OUT_MS = 450

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
    setTimeout(() => el.remove(), FADE_OUT_MS + 250)
}

function showOverlay(video: HTMLVideoElement) {
    finishPreviewTransition()
    const el = document.createElement("div")
    el.setAttribute("data-preview-handoff", "")
    Object.assign(el.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483000",
        transition: `opacity ${FADE_OUT_MS}ms ease`,
        pointerEvents: "none",
    } as CSSStyleDeclaration)

    const backdrop = document.createElement("div")
    Object.assign(backdrop.style, { position: "absolute", inset: "0", background: "#000" } as CSSStyleDeclaration)
    el.appendChild(backdrop)
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: EXPAND_MS, easing: "ease-out", fill: "forwards" })

    // The frame the preview was on, growing from its card to fill the screen. It is the full frame
    // scaled down rather than the card's picture scaled up, so it stays sharp all the way.
    try {
        const canvas = document.createElement("canvas")
        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
        Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", willChange: "transform" } as CSSStyleDeclaration)
        el.appendChild(canvas)

        const rect = video.getBoundingClientRect()
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        if (rect.width && !reducedMotion) {
            const x = (rect.left + rect.width / 2 - window.innerWidth / 2) / getCssZoom()
            const y = (rect.top + rect.height / 2 - window.innerHeight / 2) / getCssZoom()
            canvas.animate([
                { transform: `translate(${x}px, ${y}px) scale(${rect.width / window.innerWidth})` },
                { transform: "none" },
            ], { duration: EXPAND_MS, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
        }
    }
    catch {
        // A frame that can't be drawn leaves a plain black fade.
    }
    document.body.appendChild(el)
    // Tracked, or finishPreviewTransition() can't find it and the frame stays over the player for good.
    overlay = el
    // Never left over the app if the player doesn't open.
    overlayTimer = setTimeout(finishPreviewTransition, 8000)
}
