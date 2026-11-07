"use client"

import React from "react"

/**
 * Progress Bar Speed and Animation Speed (Enhancements): plays every CSS animation at the chosen
 * rate through the Web Animations API, so no stylesheet has to know about it. Progress bars get
 * their own rate; everything else that moves on its own gets the other. Transition speed is
 * separate (the Transition Speed tab sets --sea-dur). The shop's speed previews keep their own pace.
 */

const BAR_SELECTOR = [
    ".sea-progress-fill",
    ".sea-progress-track",
    ".UI-ProgressBar__indicator",
    "[data-vc-element='time-range-chapter-bar']",
    "[data-vc-element='time-range-chapter']",
    "[data-vc-element='control-volume-slider-progress']",
].join(",")

const EXEMPT_SELECTOR = "[data-sea-speed-preview]"

function rateFor(target: Element | null, barRate: number, motionRate: number): number | null {
    if (!target) return motionRate
    if (target.closest(EXEMPT_SELECTOR)) return null
    return target.closest(BAR_SELECTOR) ? barRate : motionRate
}

function animationTarget(animation: Animation): Element | null {
    const effect = animation.effect as KeyframeEffect | null
    return effect?.target ?? null
}

/** Only CSS animations: transitions follow Transition Speed, and script-driven animations pace themselves. */
function isCssAnimation(animation: Animation): boolean {
    return typeof CSSAnimation !== "undefined" && animation instanceof CSSAnimation
}

function apply(animation: Animation, barRate: number, motionRate: number) {
    if (!isCssAnimation(animation)) return
    const rate = rateFor(animationTarget(animation), barRate, motionRate)
    if (rate === null || animation.playbackRate === rate) return
    // updatePlaybackRate keeps the current frame, so changing speed never makes anything jump.
    if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(rate)
    else animation.playbackRate = rate
}

export function useAnimationSpeeds(barRate: number, motionRate: number) {
    // The progress-bar fill glides by transition; Still makes it jump straight to the value.
    React.useEffect(() => {
        const root = document.documentElement
        root.style.setProperty("--sea-bar-glide", barRate > 0 ? `${(0.5 / barRate).toFixed(3)}s` : "0s")
    }, [barRate])

    React.useEffect(() => {
        if (typeof document.getAnimations !== "function") return
        const normal = barRate === 1 && motionRate === 1

        // Animations already running take the new rate at once (including going back to Normal).
        for (const a of document.getAnimations()) apply(a, barRate, motionRate)
        if (normal) return

        // New ones as they start (or restart, e.g. when an element's animation changes).
        const onStart = (e: AnimationEvent) => {
            const el = e.target as Element | null
            if (!el || typeof (el as any).getAnimations !== "function") return
            for (const a of (el as Element).getAnimations()) apply(a, barRate, motionRate)
        }
        document.addEventListener("animationstart", onStart, true)
        return () => document.removeEventListener("animationstart", onStart, true)
    }, [barRate, motionRate])
}
