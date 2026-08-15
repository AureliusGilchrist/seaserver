"use client"
import { getServerBaseUrl } from "@/api/client/server-url"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuTriangleAlert } from "react-icons/lu"

/**
 * The one place the app says "AniList is down".
 *
 * When AniList disables its API — which it does, answering every request with a 403 saying so — every
 * screen fails on its own: the library will not load, entries will not open, progress will not save.
 * None of them can say why, because none of them knows the difference between "this request failed"
 * and "the whole API is off". The only explanation was in the server log, which is not where somebody
 * trying to watch something is looking.
 *
 * The server records the condition centrally from whatever request happened to see it, and clears it
 * the moment any request succeeds. This asks once a minute and says the true thing while it lasts.
 */

/** How often to re-check. A minute is long enough to be free and short enough that the banner clears
 *  itself shortly after AniList comes back, without anybody reloading. */
const CHECK_INTERVAL_MS = 60_000

type Availability = {
    available: boolean
    message?: string
    since?: string
}

export function AnilistAvailabilityBanner() {
    const [availability, setAvailability] = React.useState<Availability | null>(null)

    React.useEffect(() => {
        let cancelled = false

        async function check() {
            try {
                const res = await fetch(`${getServerBaseUrl()}/api/v1/anilist/availability`, { credentials: "include" })
                if (!res.ok) return
                // The server wraps successful responses in { data }; tolerate both shapes.
                const body = (await res.json()) as { data?: Availability } | Availability
                const value = (body as { data?: Availability })?.data ?? (body as Availability)
                if (!cancelled) setAvailability(value)
            } catch {
                // The server itself being unreachable is a different problem with its own handling —
                // claiming AniList is down because this check failed would be inventing a diagnosis.
            }
        }

        check()
        const timer = setInterval(check, CHECK_INTERVAL_MS)
        return () => {
            cancelled = true
            clearInterval(timer)
        }
    }, [])

    if (!availability || availability.available) return null

    return (
        <div
            data-anilist-availability-banner
            className={cn(
                "sticky top-0 z-[60] w-full",
                "flex items-center justify-center gap-2 px-4 py-2",
                "bg-amber-950/90 border-b border-amber-700/60 backdrop-blur",
                "text-sm text-amber-100",
            )}
        >
            <LuTriangleAlert className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>
                Can&apos;t currently access AniList, please wait.
                <span className="text-amber-200/70">
                    {" "}— {availability.message || "the API is not responding"}. Checking again every minute.
                </span>
            </span>
        </div>
    )
}
