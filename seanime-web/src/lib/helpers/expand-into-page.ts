const EXPAND_MS = 1000

/**
 * Grows a copy of a card's image until it covers the screen, then fades it away over the page that
 * loads behind it. The copy sits on the body, so it outlives the page the card was on.
 */
export function expandIntoPage(image: HTMLImageElement | null | undefined) {
    if (!image?.currentSrc || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

    const rect = image.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const copy = document.createElement("img")
    copy.src = image.currentSrc
    copy.alt = ""
    copy.setAttribute("aria-hidden", "true")
    copy.dataset.expandIntoPage = ""
    Object.assign(copy.style, {
        position: "fixed",
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        objectFit: "cover",
        borderRadius: "0.75rem",
        pointerEvents: "none",
        zIndex: "9999",
    })
    document.body.appendChild(copy)

    const covering = Math.max(window.innerWidth / rect.width, window.innerHeight / rect.height) * 1.05
    const x = window.innerWidth / 2 - (rect.left + rect.width / 2)
    const y = window.innerHeight / 2 - (rect.top + rect.height / 2)
    const expanded = `translate(${x}px, ${y}px) scale(${covering})`

    copy.animate([
        { transform: "none", opacity: 1, offset: 0, easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
        { transform: expanded, opacity: 1, offset: 0.45, easing: "ease-in-out" },
        { transform: expanded, opacity: 0, offset: 1 },
    ], { duration: EXPAND_MS, fill: "forwards" }).onfinish = () => copy.remove()
}
