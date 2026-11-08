"use client"

import React from "react"

/**
 * Radix (dialogs, modal popovers and menus) and vaul (drawers) mark <body> with
 * `pointer-events: none` while a modal layer is open and remove it when the layer closes.
 * A layer that is unmounted while it is open or still animating closed — a row that vanishes
 * on a refetch, a page left mid-close — can leave that mark behind. Then almost nothing in the
 * app can be clicked until a reload.
 *
 * This watches <body> and clears the mark whenever it stays set with no modal layer open.
 */
const OPEN_LAYER_SELECTOR = [
    "[role=dialog][data-state=open]",
    "[role=alertdialog][data-state=open]",
    "[role=menu][data-state=open]",
    "[role=listbox][data-state=open]",
    "[data-radix-popper-content-wrapper]",
    "[data-vaul-drawer][data-state=open]",
].join(",")

export function releaseStuckBodyPointerLock() {
    if (typeof document === "undefined") return
    const body = document.body
    if (body.style.pointerEvents !== "none") return
    if (document.querySelector(OPEN_LAYER_SELECTOR)) return
    body.style.pointerEvents = ""
}

export function useBodyPointerLockGuard() {
    React.useEffect(() => {
        if (typeof MutationObserver === "undefined") return
        let timer: number | undefined
        const schedule = () => {
            window.clearTimeout(timer)
            // Give a closing layer time to finish its exit animation and clean up after itself.
            timer = window.setTimeout(releaseStuckBodyPointerLock, 600)
        }
        // Body style changes (a lock being set) and portal removals (a layer going away) both
        // warrant a check.
        const observer = new MutationObserver(schedule)
        observer.observe(document.body, { attributes: true, attributeFilter: ["style"], childList: true })
        // Clicks that do nothing are the symptom; check on them too.
        window.addEventListener("pointerdown", schedule, true)
        schedule()
        return () => {
            observer.disconnect()
            window.removeEventListener("pointerdown", schedule, true)
            window.clearTimeout(timer)
        }
    }, [])
}
