"use client"

import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import Lenis from "lenis"
import "lenis/dist/lenis.css"
import React from "react"

/**
 * Smooth, eased wheel scrolling for the page (Personal → "Smooth scrolling", on by default).
 *
 * The window still scrolls natively underneath — Lenis only animates towards where the wheel says
 * to go — so `window.scrollY`, the hero fades, scroll restoration and `scrollTo` all keep working.
 * Anything with its own scroll (drawers, modals, lists, the manga reader, horizontal rows) scrolls
 * natively too: `allowNestedScroll` hands the wheel to the nearest scrollable element under it.
 *
 * Off while a modal locks the page (Radix / react-remove-scroll mark the body), and when the
 * system asks for reduced motion. Touch keeps the platform's own scrolling.
 */
export function SmoothScroll() {
    const personal = usePersonalSettings()
    const enabled = personal.smoothScrolling

    React.useEffect(() => {
        if (!enabled || typeof window === "undefined") return
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

        const lenis = new Lenis({
            autoRaf: true,
            lerp: 0.085,
            wheelMultiplier: 1,
            smoothWheel: true,
            syncTouch: false,
            allowNestedScroll: true,
            // Elements that manage their own wheel (sliders, the video player, number inputs).
            prevent: node => !!node.closest?.("[data-lenis-prevent], [data-vc-element], input[type='range'], [role='slider']"),
        })

        // Pause while the page is scroll-locked by a modal, a drawer or a fullscreen player.
        const body = document.body
        const sync = () => {
            // Only the body is read: a stopped Lenis hides the <html> overflow itself, and reading
            // that back would keep it stopped for good.
            const locked = body.hasAttribute("data-scroll-locked")
                || getComputedStyle(body).overflow === "hidden"
                || !!document.fullscreenElement
            if (locked) lenis.stop()
            else lenis.start()
        }
        const observer = new MutationObserver(sync)
        observer.observe(body, { attributes: true, attributeFilter: ["style", "class", "data-scroll-locked"] })
        document.addEventListener("fullscreenchange", sync)
        sync()

        return () => {
            observer.disconnect()
            document.removeEventListener("fullscreenchange", sync)
            lenis.destroy()
        }
    }, [enabled])

    return null
}
