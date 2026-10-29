/**
 * Stops a <video> from holding a network connection: pause, drop the source, and load() so the
 * browser aborts the in-flight range request. Safe on an element that's already detached.
 */
export function releaseVideoElement(el: HTMLVideoElement) {
    try {
        el.pause()
        if (el.getAttribute("src") || el.currentSrc) {
            el.removeAttribute("src")
            el.load()
        }
    }
    catch {
        // a detached element can throw on load(); nothing left to release then
    }
}
