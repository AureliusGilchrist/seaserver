import { toast } from "sonner"
import { LuRefreshCw } from "react-icons/lu"
import React from "react"

/**
 * "no cached data available": the server asked AniList, got nothing back, and had no saved copy to
 * fall back on. Usually a passing AniList hiccup. A page can have a dozen requests fail this way at
 * once, so they all share one calm toast (fixed id) instead of a stack of red 500s, and its Retry
 * re-runs every request that failed.
 */

export function isCacheMissError(error: any): boolean {
    const msg = error?.response?.data?.error
    return typeof msg === "string" && /no cached data|cache lookup failed/i.test(msg)
}

const pendingRetries = new Set<() => void>()

export function showCacheMissToast(retry?: () => void) {
    if (retry) pendingRetries.add(retry)
    toast("Please try again.", {
        id: "cache-miss",
        description: "AniList didn't answer and there's no saved copy yet.",
        icon: <LuRefreshCw className="size-4 text-sky-300" />,
        duration: 5000,
        className: "!border-sky-400/30",
        action: pendingRetries.size ? {
            label: "Retry",
            onClick: () => {
                const retries = [...pendingRetries]
                pendingRetries.clear()
                for (const r of retries) {
                    try {
                        r()
                    }
                    catch {
                    }
                }
            },
        } : undefined,
        onDismiss: () => pendingRetries.clear(),
        onAutoClose: () => pendingRetries.clear(),
    })
}
