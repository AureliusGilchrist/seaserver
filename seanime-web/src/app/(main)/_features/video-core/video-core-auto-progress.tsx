import { useRecordEpisodeWatched } from "@/api/hooks/update-notice.hooks"
import { useGetAnimeEntry, useUpdateAnimeEntryProgress } from "@/api/hooks/anime_entries.hooks"
import { VideoCoreLifecycleState } from "@/app/(main)/_features/video-core/video-core.atoms"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { Button } from "@/components/ui/button"
import { getEffectiveProgress, markPromptDismissed, wasPromptDismissed } from "@/lib/progress-queue/progress-queue"
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
    const personal = usePersonalSettings()
    const autoUpdate = personal.autoUpdateProgress

    const mediaId = state.playbackInfo?.media?.id
    const episodeNumber = state.playbackInfo?.episode?.progressNumber ?? 0

    const { data: entry } = useGetAnimeEntry(mediaId)
    const setPrompt = useSetAtom(vc_progressPrompt)
    const { mutate: updateProgress } = useUpdateAnimeEntryProgress(mediaId, episodeNumber, true)
    const { mutate: recordWatched } = useRecordEpisodeWatched()

    // Ensure we only act once per (media, episode) playback.
    const handledRef = React.useRef<string | null>(null)
    const recordedRef = React.useRef<string | null>(null)
    React.useEffect(() => {
        handledRef.current = null
        recordedRef.current = null
    }, [mediaId, episodeNumber])

    // Keep the latest render values so the stable callback never reads stale data.
    const latestRef = React.useRef({ entry, autoUpdate, state, mediaId, episodeNumber, updateProgress, recordWatched })
    latestRef.current = { entry, autoUpdate, state, mediaId, episodeNumber, updateProgress, recordWatched }

    const onReachedThreshold = React.useCallback(() => {
        const { entry, autoUpdate, state, mediaId, episodeNumber, updateProgress, recordWatched } = latestRef.current
        const media = state.playbackInfo?.media
        if (!media || !mediaId || !episodeNumber) return

        // The timeline entry is recorded for every watched episode, including rewatches and
        // resumed episodes where the AniList progress is already at or past this one.
        const recordKey = `${mediaId}:${episodeNumber}`
        if (recordedRef.current !== recordKey) {
            recordedRef.current = recordKey
            recordWatched({ mediaId, episodeNumber, totalEpisodes: media.episodes ?? 0 })
        }

        // Only update real AniList list entries (skip when not on the user's list / unauthenticated).
        if (!entry?.listData) return

        const key = `${mediaId}:${episodeNumber}`
        if (handledRef.current === key) return
        handledRef.current = key

        const realProgress = entry.listData.progress ?? 0
        // What this app knows has been watched: AniList's cached value, or further when updates
        // are still queued / in flight from this run. Comparing against the AniList value alone is
        // what produced the random "you're 2 episodes ahead" prompts — the previous episode's
        // update simply hadn't shown up in the cached entry yet.
        const currentProgress = getEffectiveProgress(mediaId, realProgress)
        if (episodeNumber === currentProgress) return
        // Already watched-and-sent this run (e.g. rewatching the episode before it synced).
        if (episodeNumber > realProgress && episodeNumber <= currentProgress) return
        // Asked about this exact episode earlier in the run and the user said no.
        if (wasPromptDismissed(mediaId, episodeNumber)) return

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

    const [secondsLeft, setSecondsLeft] = React.useState(30)
    const applyRef = React.useRef<() => void>(() => {})
    applyRef.current = () => {
        if (!prompt) return
        updateProgress({
            episodeNumber: prompt.episodeNumber,
            mediaId: prompt.mediaId,
            totalEpisodes: prompt.totalEpisodes,
            malId: prompt.malId ?? undefined,
        })
        setPrompt(null)
    }

    React.useEffect(() => {
        if (!prompt) return
        setSecondsLeft(30)
        const id = window.setInterval(() => {
            setSecondsLeft(s => {
                if (s <= 1) {
                    window.clearInterval(id)
                    window.setTimeout(() => applyRef.current(), 0)
                    return 0
                }
                return s - 1
            })
        }, 1000)
        return () => window.clearInterval(id)
    }, [prompt?.mediaId, prompt?.episodeNumber])

    if (!prompt) return null

    const { direction, delta, episodeNumber, mediaId, totalEpisodes, malId, currentProgress } = prompt
    const epWord = delta === 1 ? "episode" : "episodes"
    const line = direction === "ahead"
        ? `You were ${delta} ${epWord} ahead of where your AniList shows (currently ${currentProgress}).`
        : `You're ${delta} ${epWord} behind where your AniList shows (currently ${currentProgress}).`

    return (
        <div
            data-vc-element="progress-prompt"
            className="absolute inset-0 flex items-center justify-center z-[55] cursor-auto"
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
                        Update ({secondsLeft}s)
                    </Button>
                    <Button
                        size="sm"
                        intent="gray-outline"
                        disabled={isPending}
                        onClick={() => {
                            markPromptDismissed(mediaId, episodeNumber)
                            setPrompt(null)
                        }}
                    >
                        Dismiss
                    </Button>
                </div>
            </div>
        </div>
    )
}
