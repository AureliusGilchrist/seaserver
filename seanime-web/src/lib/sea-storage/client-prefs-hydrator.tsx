"use client"

import React from "react"
import { useAtomValue } from "jotai"
import { profileSessionTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { hydrateClientPrefs, resetClientPrefsHydration } from "./sea-storage"

/**
 * Hydrates server-side client preferences into localStorage BEFORE rendering children.
 * Must wrap any provider that reads from localStorage during initialization
 * (UICustomizeProvider, EasterEggEngine, RewardProvider, AnimeThemeProvider, etc.).
 *
 * Behaviour:
 *  - If there's no profile session token, render children immediately (no-op hydration).
 *  - If a profile session token exists, fetch /api/v1/client-prefs and write each entry to
 *    localStorage, then render children. Renders nothing while the request is in flight.
 *  - When the profile session token changes, re-hydrate so per-profile values are correct.
 */
export function ClientPrefsHydrator({ children }: { children: React.ReactNode }) {
    const profileToken = useAtomValue(profileSessionTokenAtom)
    const [tokenSnapshot, setTokenSnapshot] = React.useState<string | undefined>(profileToken)
    const [hydrated, setHydrated] = React.useState(false)

    // Re-hydrate when the profile token changes (e.g. user switches profiles).
    React.useEffect(() => {
        if (profileToken !== tokenSnapshot) {
            setTokenSnapshot(profileToken)
            setHydrated(false)
            resetClientPrefsHydration()
        }
    }, [profileToken, tokenSnapshot])

    React.useEffect(() => {
        let cancelled = false
        ;(async () => {
            await hydrateClientPrefs()
            if (!cancelled) setHydrated(true)
        })()
        return () => { cancelled = true }
    }, [tokenSnapshot])

    if (!hydrated) return null
    return <>{children}</>
}
