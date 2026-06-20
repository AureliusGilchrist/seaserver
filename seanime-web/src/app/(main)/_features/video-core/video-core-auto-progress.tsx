import { useGetAnimeEntry, useUpdateAnimeEntryProgress } from "@/api/hooks/anime_entries.hooks"
import { VideoCoreLifecycleState } from "@/app/(main)/_features/video-core/video-core.atoms"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { Button } from "@/components/ui/button"
import { atom, useAtomValue, useSetAtom } from "jotai"
import { useAtom } from "jotai/react"
import React from "react"

/**
 * Fork: AniList auto-progress at the 80% mark, driven entirely on the client via the
 * reliable REST mutation (useUpdateAnimeEntryProgress) — the same path the manual
 * "Update progress" button uses. This intentionally does NOT rely on the websocket
 * "video-completed" round-trip (which can silently fail when the desktop server is
 * reachable over a flaky/link-local address), so it works for both the online stream
 * and the local in-app (native) player.
 *
 * Behaviour (see decision table):
 *  - episode === currentProgress            -> nothing (already recorded)
 *  - episode === currentProgress + 1        -> "Auto-update progress" ON: silent update
 *                                              "Auto-update progress" OFF: confirm prompt
 *  - episode  >  currentProgress + 1 (ahead)-> always confirm prompt (never silently jump)
 *  - episode  <  currentProgress    (behind)-> always confirm prompt (never silently rewind)
 */

export type VideoCoreProgressPromptState = {
    mediaId: number
    episodeNumber: number
    totalEpisodes: number
    malId?: number
    currentProgress: number
    direction: "ahead" | "behind"
    delta: number
}

// Module-level (a single in-app player is active at a time).
export const vc_progressPrompt = atom<VideoCoreProgressPromptState | null>(null)

export function useVideoCoreAutoProgress(state: VideoCoreLifecycleState) {
    const serverStatus = useServerStatus()
    const autoUpdate = !!serverStatus?.settings?.library?.autoUpdateProgress

    const mediaId = state.playbackInfo?.media?.id
    const episodeNumber = state.playbackInfo?.episode?.progressNumber ?? 0

    const { data: entry } = useGetAnimeEntry(mediaId)
    const setPrompt = useSetAtom(vc_progressPrompt)
    const { mutate: updateProgress } = useUpdateAnimeEntryProgress(mediaId, episodeNumber, true)

    // Ensure we only act once per (media, episode) playback.
    const handledRef = React.useRef<string | null>(null)
    React.useEffect(() => {
        handledRef.current = null
    }, [mediaId, episodeNumber])

    // Keep the latest render values so the stable callback never reads stale data.
    const latestRef = React.useRef({ entry, autoUpdate, state, mediaId, episodeNumber, updateProgress })
    latestRef.current = { entry, autoUpdate, state, mediaId, episodeNumber, updateProgress }

    const onReachedThreshold = React.useCallback(() => {
        const { entry, autoUpdate, state, mediaId, episodeNumber, updateProgress } = latestRef.current
        const media = state.playbackInfo?.media
        if (!media || !mediaId || !episodeNumber) return

        // Only update real AniList list entries (skip when not on the user's list / unauthenticated).
        if (!entry?.listData) return

        const key = `${mediaId}:${episodeNumber}`
        if (handledRef.current === key) return
        handledRef.current = key

        const currentProgress = entry.listData.progress ?? 0
        if (episodeNumber === currentProgress) return

        const totalEpisodes = media.episodes ?? 0
        const malId = media.idMal ?? undefined
        const isNormalNext = episodeNumber === currentProgress + 1

        if (isNormalNext && autoUpdate) {
            updateProgress({ episodeNumber, mediaId, totalEpisodes, malId })
            return
        }

        setPrompt({
            mediaId,
            episodeNumber,
            totalEpisodes,
            malId,
            currentProgress,
            direction: episodeNumber > currentProgress ? "ahead" : "behind",
            delta: Math.abs(episodeNumber - currentProgress),
        })
    }, [])

    return { onReachedThreshold }
}

/**
 * Centered overlay shown inside the player when finishing an episode whose number doesn't
 * match the user's AniList progress (or when auto-update is disabled). Reuses the reliable
 * REST mutation to apply the change.
 */
export function VideoCoreProgressPrompt() {
    const [prompt, setPrompt] = useAtom(vc_progressPrompt)
    const { mutate: updateProgress, isPending } = useUpdateAnimeEntryProgress(prompt?.mediaId ?? null, prompt?.episodeNumber ?? 0, true)

    if (!prompt) return null

    const { direction, delta, episodeNumber, mediaId, totalEpisodes, malId, currentProgress } = prompt
    const epWord = delta === 1 ? "episode" : "episodes"
    const line = direction === "ahead"
        ? `You were ${delta} ${epWord} ahead of where your AniList shows (currently ${currentProgress}).`
        : `You're ${delta} ${epWord} behind where your AniList shows (currently ${currentProgress}).`

    return (
        <div
            data-vc-element="progress-prompt"
            className="absolute inset-0 flex items-center justify-center z-[55]"
            onClick={e => e.stopPropagation()}
            onPointerMove={e => e.stopPropagation()}
        >
            <div className="bg-gray-950/80 backdrop-blur-md rounded-xl p-6 text-center shadow-2xl border border-[--border] max-w-sm">
                <p className="text-white text-lg font-medium mb-1">Update AniList progress?</p>
                <p className="text-gray-300 text-sm mb-1">{line}</p>
                <p className="text-gray-300 text-sm mb-5">Update it to episode {episodeNumber}?</p>
                <div className="flex gap-3 justify-center">
                    <Button
                        size="sm"
                        intent="white"
                        loading={isPending}
                        onClick={() => {
                            updateProgress({ episodeNumber, mediaId, totalEpisodes, malId: malId ?? undefined })
                            setPrompt(null)
                        }}
                    >
                        Update
                    </Button>
                    <Button
                        size="sm"
                        intent="gray-outline"
                        disabled={isPending}
                        onClick={() => setPrompt(null)}
                    >
                        Dismiss
                    </Button>
                </div>
            </div>
        </div>
    )
}
