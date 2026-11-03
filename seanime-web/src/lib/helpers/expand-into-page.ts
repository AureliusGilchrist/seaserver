import { getViewportCssSize, toCssRect } from "@/lib/interface-scale/interface-scale"
const EXPAND_MS = 950
const LAYER_Z_INDEX = "9999"

/**
 * Carries a card's image into the page it opens: it grows from the card to fill the screen, then
 * dissolves over the page loading behind it. Pass the navigation as `navigate`, and call this only
 * for one that is really happening.
 *
 * Only transform, opacity and filter are animated, because those run on the compositor and keep
 * moving while the new page renders. The navigation waits for the animation to start for the same
 * reason. The layers sit on the body, so they outlive the page the card was on.
 */
export function expandIntoPage(image: HTMLImageElement | null | undefined, navigate: () => void) {
    const measured = image?.getBoundingClientRect()
    const rect = measured && toCssRect(measured)
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (!image?.currentSrc || !rect?.width || !rect.height || reducedMotion) {
        navigate()
        return
    }

    const backdrop = document.createElement("div")
    backdrop.dataset.expandIntoPage = "backdrop"
    Object.assign(backdrop.style, {
        position: "fixed",
        inset: "0",
        background: "var(--background, #000)",
        pointerEvents: "none",
        zIndex: LAYER_Z_INDEX,
    })

    const copy = document.createElement("img")
    copy.src = image.currentSrc
    copy.alt = ""
    copy.setAttribute("aria-hidden", "true")
    copy.dataset.expandIntoPage = "image"
    Object.assign(copy.style, {
        position: "fixed",
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        objectFit: "cover",
        borderRadius: "12px",
        pointerEvents: "none",
        willChange: "transform, opacity, filter",
        zIndex: LAYER_Z_INDEX,
    })

    document.body.append(backdrop, copy)

    const viewport = getViewportCssSize()
    const covering = Math.max(viewport.width / rect.width, viewport.height / rect.height) * 1.02
    const x = viewport.width / 2 - (rect.left + rect.width / 2)
    const y = viewport.height / 2 - (rect.top + rect.height / 2)
    const expanded = `translate(${x}px, ${y}px) scale(${covering})`

    backdrop.animate([
        { opacity: 0, offset: 0, easing: "ease-out" },
        { opacity: 0.9, offset: 0.45, easing: "ease-in" },
        { opacity: 0, offset: 1 },
    ], { duration: EXPAND_MS, fill: "forwards" })

    const expansion = copy.animate([
        { transform: "none", opacity: 1, filter: "blur(0px) brightness(1)", offset: 0, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
        { transform: expanded, opacity: 1, filter: "blur(1px) brightness(0.85)", offset: 0.5, easing: "ease-in-out" },
        { transform: expanded, opacity: 0, filter: "blur(6px) brightness(0.85)", offset: 1 },
    ], { duration: EXPAND_MS, fill: "forwards" })

    // On a timer rather than onfinish: nothing may leave these covering the page.
    window.setTimeout(() => {
        copy.remove()
        backdrop.remove()
    }, EXPAND_MS + 150)

    let navigated = false
    const go = () => {
        if (navigated) return
        navigated = true
        navigate()
    }
    expansion.ready.then(go, go)
    window.setTimeout(go, 100)
}
