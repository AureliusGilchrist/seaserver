"use client"

import React from "react"
import { useAtomValue } from "jotai"
import { useQueryClient } from "@tanstack/react-query"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { profileSessionTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { useMigrateServerPersonalDefaults } from "@/app/(main)/_hooks/use-personal-settings"
import { useMigrateLegacyCardSizes } from "@/app/(main)/_features/media/card-size"
import { WSEvents } from "@/lib/server/ws-events"
import { applyRemoteClientPref, type ClientPrefUpdatedPayload, hydrateClientPrefs, resetClientPrefsHydration } from "./sea-storage"
import { syncClientTimeZone } from "@/lib/client-settings"

/**
 * Hydrates server-side client preferences into localStorage BEFORE rendering children.
 * Must wrap any provider that reads from localStorage during initialization
 * (UICustomizeProvider, EasterEggEngine, RewardProvider, AnimeThemeProvider, etc.).
 *
 * Behaviour:
 *  - If there's no profile session token, render children immediately (no-op hydration).
 *  - If a profile session token exists, fetch profile and global preferences into localStorage,
 *    then render children. Renders nothing while the requests are in flight.
 *  - When the profile session token changes, re-hydrate so per-profile values are correct.
 *  - While mounted, changes the same profile makes on its other clients (web, Denshi, Denshi
 *    Mobile) arrive over the websocket and are applied live.
 */
export function ClientPrefsHydrator({ children }: { children: React.ReactNode }) {
    const profileToken = useAtomValue(profileSessionTokenAtom)
    const [tokenSnapshot, setTokenSnapshot] = React.useState<string | undefined>(profileToken)
    const [hydrated, setHydrated] = React.useState(false)

    useClientPrefsLiveSync()

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
            if (cancelled) return
            syncClientTimeZone()
            setHydrated(true)
        })()
        return () => { cancelled = true }
    }, [tokenSnapshot])

    if (!hydrated) return null
    return <>
        <ServerDefaultsMigration />
        {children}
    </>
}

/** Runs once the profile's preferences are in: see useMigrateServerPersonalDefaults. */
function ServerDefaultsMigration() {
    useMigrateServerPersonalDefaults()
    useMigrateLegacyCardSizes()
    return null
}

/**
 * Personal settings changed on another client of this profile: synced client preferences are
 * written locally (see applyRemoteClientPref), and a theme change refetches the status, which
 * carries the profile's theme.
 */
function useClientPrefsLiveSync() {
    const queryClient = useQueryClient()

    const onPref = React.useCallback((payload: ClientPrefUpdatedPayload) => {
        applyRemoteClientPref(payload)
    }, [])
    useWebsocketMessageListener<ClientPrefUpdatedPayload>({ type: WSEvents.CLIENT_PREF_UPDATED, onMessage: onPref })

    const onTheme = React.useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.STATUS.GetStatus.key] })
        void queryClient.invalidateQueries({ queryKey: [API_ENDPOINTS.THEME.GetTheme.key] })
    }, [queryClient])
    useWebsocketMessageListener({ type: WSEvents.THEME_UPDATED, onMessage: onTheme })
}
