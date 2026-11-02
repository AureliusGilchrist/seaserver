import React from "react"

export type Connectivity = "online" | "offline" | "blocked"

let current: Connectivity = "online"
const listeners = new Set<() => void>()

export function getConnectivity() {
    return current
}

export function setConnectivity(next: string | undefined) {
    const value: Connectivity = next === "offline" || next === "blocked" ? next : "online"
    if (value === current) return
    current = value
    listeners.forEach(listener => listener())
}

export function useConnectivity() {
    return React.useSyncExternalStore(subscribe, getConnectivity)
}

// Whether offline mode was turned on by hand (the sidebar switch) rather than the internet being down.
let forced = false

export function getOfflineForced() {
    return forced
}

export function setOfflineForced(next: boolean) {
    if (next === forced) return
    forced = next
    listeners.forEach(listener => listener())
}

export function useOfflineForced() {
    return React.useSyncExternalStore(subscribe, getOfflineForced)
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

/** Errors that only say the server can't reach the internet. The offline chip already says that. */
export function isOfflineErrorMessage(message: string | undefined) {
    if (!message) return false
    return message.includes("anilist: no connection")
        || message.includes("is not stored for offline use")
        || message.includes("the server is offline")
}
