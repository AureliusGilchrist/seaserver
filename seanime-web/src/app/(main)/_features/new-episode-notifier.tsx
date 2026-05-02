"use client"
import { animeLibraryCollectionAtom } from "@/app/(main)/_atoms/anime-library-collection.atoms"
import { useRouter } from "@/lib/navigation"
import { useAtomValue } from "jotai"
import React from "react"
import { toast } from "sonner"

const STORAGE_KEY = "sea-notified-episodes"

function getNotified(): Record<number, number> {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<number, number>
    } catch {
        return {}
    }
}

function markNotified(mediaId: number, episode: number) {
    const current = getNotified()
    current[mediaId] = episode
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)) } catch {}
}

/**
 * Silently watches the library collection for newly-aired episodes on
 * CURRENT/PAUSED anime and shows a toast notification when one drops.
 * Remembers which episodes it has already notified about (per device,
 * stored in localStorage) so notifications never repeat.
 */
export function NewEpisodeNotifier() {
    const collection = useAtomValue(animeLibraryCollectionAtom)
    const router = useRouter()
    // Run check whenever the library collection changes
    React.useEffect(() => {
        if (!collection?.lists) return

        const now = Math.floor(Date.now() / 1000)
        const notified = getNotified()
        let stagger = 0

        for (const list of collection.lists) {
            for (const entry of list.entries ?? []) {
                const { media, listData, mediaId } = entry
                if (!media || !listData) continue

                // Only notify for actively-watching anime
                const status = listData.status
                if (status !== "CURRENT" && status !== "PAUSED") continue

                const nextAiring = media.nextAiringEpisode
                if (!nextAiring) continue

                const { airingAt, episode } = nextAiring
                const progress = listData.progress ?? 0

                // Episode has aired AND user hasn't seen it yet AND we haven't notified yet
                if (airingAt <= now && episode > progress && (notified[mediaId] ?? -1) < episode) {
                    markNotified(mediaId, episode)

                    const title = media.title?.userPreferred
                        ?? media.title?.romaji
                        ?? media.title?.english
                        ?? "Unknown"

                    const delay = stagger * 400
                    stagger++
                    const id = mediaId
                    setTimeout(() => {
                        toast.info("New episode available", {
                            description: `${title} — Episode ${episode}`,
                            duration: 8000,
                            action: {
                                label: "Watch",
                                onClick: () => router.push(`/entry?id=${id}`),
                            },
                        })
                    }, delay)
                }
            }
        }
    }, [collection])

    return null
}
