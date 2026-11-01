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
    return React.useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, getConnectivity)
}

/** Errors that only say the server can't reach the internet. The offline chip already says that. */
export function isOfflineErrorMessage(message: string | undefined) {
    if (!message) return false
    return message.includes("anilist: no connection")
        || message.includes("is not stored for offline use")
        || message.includes("the server is offline")
}
