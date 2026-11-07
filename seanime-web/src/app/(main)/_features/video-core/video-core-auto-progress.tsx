import { useRecordEpisodeWatched } from "@/api/hooks/update-notice.hooks"
import { useGetAnimeEntry, useUpdateAnimeEntryProgress } from "@/api/hooks/anime_entries.hooks"
import { VideoCoreLifecycleState } from "@/app/(main)/_features/video-core/video-core.atoms"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { Button } from "@/components/ui/button"
import { bridgePlayedProgress, getEffectiveProgress, markEpisodePlayed, markPromptDismissed, wasPromptDismissed } from "@/lib/progress-queue/progress-queue"
import { atom, useAtomValue, useSetAtom } from "jotai"
import { AnimatePresence, motion } from "motion/react"
import { LuCheck, LuLoader, LuX } from "react-icons/lu"
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

/** The "episode finished" pop-up shown in the player when the watched threshold is reached. */
export type VideoCoreEpisodeFinishedNotice = {
    /** Changes on every new notice, so the pop-up restarts its timer. */
    key: number
    mediaId: number
    episodeNumber: number
    threshold: number
    /** What happened on AniList: nothing to do, being sent, sent, or failed. */
    anilist: "none" | "pending" | "done" | "failed"
}

export const vc_episodeFinishedNotice = atom<VideoCoreEpisodeFinishedNotice | null>(null)

/** Updates the AniList line of the current notice, if it is still about that episode. */
const vc_setEpisodeFinishedAnilist = atom(null, (get, set, payload: { mediaId: number, episodeNumber: number, anilist: VideoCoreEpisodeFinishedNotice["anilist"] }) => {
    const notice = get(vc_episodeFinishedNotice)
    if (!notice || notice.mediaId !== payload.mediaId || notice.episodeNumber !== payload.episodeNumber) return
    set(vc_episodeFinishedNotice, { ...notice, anilist: payload.anilist })
})

export function useVideoCoreAutoProgress(state: VideoCoreLifecycleState) {
    const personal = usePersonalSettings()
    const autoUpdate = personal.autoUpdateProgress

    const mediaId = state.playbackInfo?.media?.id
    const episodeNumber = state.playbackInfo?.episode?.progressNumber ?? 0

    const { data: entry } = useGetAnimeEntry(mediaId)
    const setPrompt = useSetAtom(vc_progressPrompt)
    const setNoticeAnilist = useSetAtom(vc_setEpisodeFinishedAnilist)
    // No toast: the result shows on the player's "episode finished" pop-up.
    const { mutate: updateProgress } = useUpdateAnimeEntryProgress(mediaId, episodeNumber, false)
    const { mutate: recordWatched } = useRecordEpisodeWatched()

    // Ensure we only act once per (media, episode) playback.
    const handledRef = React.useRef<string | null>(null)
    const recordedRef = React.useRef<string | null>(null)
    React.useEffect(() => {
        handledRef.current = null
        recordedRef.current = null
    }, [mediaId, episodeNumber])

    // Keep the latest render values so the stable callback never reads stale data.
    const latestRef = React.useRef({ entry, autoUpdate, state, mediaId, episodeNumber, updateProgress, recordWatched, setNoticeAnilist })
    latestRef.current = { entry, autoUpdate, state, mediaId, episodeNumber, updateProgress, recordWatched, setNoticeAnilist }

    // `target` counts an episode other than the one now loaded: the previous episode, when the
    // player moved on to the next one before the threshold (ending skipped, "next episode").
    const onReachedThreshold = React.useCallback((target?: { media: NonNullable<VideoCoreLifecycleState["playbackInfo"]>["media"], episodeNumber: number }) => {
        const latest = latestRef.current
        const { entry, autoUpdate, updateProgress, recordWatched, setNoticeAnilist } = latest
        const media = target ? target.media : latest.state.playbackInfo?.media
        const mediaId = target ? target.media?.id : latest.mediaId
        const episodeNumber = target ? target.episodeNumber : latest.episodeNumber
        if (!media || !mediaId || !episodeNumber) return
        // The cached entry belongs to the loaded media.
        if (target && mediaId !== latest.mediaId) return

        markEpisodePlayed(mediaId, episodeNumber)

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
        const knownProgress = getEffectiveProgress(mediaId, realProgress)
        if (episodeNumber === knownProgress) return
        // Already watched-and-sent this run (e.g. rewatching the episode before it synced).
        if (episodeNumber > realProgress && episodeNumber <= knownProgress) return
        // Asked about this exact episode earlier in the run and the user said no.
        if (wasPromptDismissed(mediaId, episodeNumber)) return

        // Episodes in between that the user did play (most of the way) were watched, even if their
        // own update never went out (left before the threshold, a dropped request, another
        // window). They are counted here, so binge watching never asks to "skip ahead".
        const currentProgress = episodeNumber > knownProgress
            ? bridgePlayedProgress(mediaId, knownProgress, episodeNumber)
            : knownProgress

        const totalEpisodes = media.episodes ?? 0
        const malId = media.idMal ?? undefined
        const isNormalNext = episodeNumber === currentProgress + 1

        if (isNormalNext && autoUpdate) {
            setNoticeAnilist({ mediaId, episodeNumber, anilist: "pending" })
            updateProgress({ episodeNumber, mediaId, totalEpisodes, malId }, {
                onSuccess: () => setNoticeAnilist({ mediaId, episodeNumber, anilist: "done" }),
                onError: () => setNoticeAnilist({ mediaId, episodeNumber, anilist: "failed" }),
            })
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

const EPISODE_FINISHED_NOTICE_MS = 6000

/**
 * Pop-up inside the player when the episode reaches the watched threshold (replaces the toast).
 * It never pauses or blocks playback: it slides in at the top, shows whether AniList was
 * updated, and leaves on its own. Hovering keeps it open; the × closes it.
 */
export function VideoCoreEpisodeFinishedPopup() {
    const [notice, setNotice] = useAtom(vc_episodeFinishedNotice)
    const [hovered, setHovered] = React.useState(false)

    // Closing the player drops it, so it doesn't come back the next time a video opens.
    React.useEffect(() => () => setNotice(null), [])

    // Starts again for each new notice, and once more when the AniList result comes in so it can be read.
    React.useEffect(() => {
        if (!notice || hovered || notice.anilist === "pending") return
        const id = window.setTimeout(() => setNotice(null), EPISODE_FINISHED_NOTICE_MS)
        return () => window.clearTimeout(id)
    }, [notice?.key, notice?.anilist, hovered])

    return (
        // Positioned by this wrapper: motion owns the pop-up's own transform.
        <div className="pointer-events-none absolute left-1/2 top-16 z-[56] w-[min(22rem,calc(100%-2rem))] -translate-x-1/2">
        <AnimatePresence>
            {notice && (
                <motion.div
                    key={notice.key}
                    data-vc-element="episode-finished-popup"
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 0, y: -16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="pointer-events-auto cursor-auto"
                    onClick={e => e.stopPropagation()}
                    onPointerMove={e => e.stopPropagation()}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                >
                    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gray-950/80 shadow-2xl backdrop-blur-md">
                        <div className="flex items-center gap-3 p-3.5 pr-10">
                            <motion.div
                                initial={{ scale: 0.4, rotate: -30 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.08 }}
                                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40"
                            >
                                <LuCheck className="size-5" strokeWidth={3} />
                            </motion.div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-white">Episode {notice.episodeNumber} watched</p>
                                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-300">
                                    {notice.anilist === "pending" && <><LuLoader className="size-3 animate-spin" /> Updating AniList…</>}
                                    {notice.anilist === "done" && <span className="text-emerald-300">AniList updated to episode {notice.episodeNumber}</span>}
                                    {notice.anilist === "failed" && <span className="text-orange-300">Couldn't update AniList</span>}
                                    {notice.anilist === "none" && <>Reached your {notice.threshold}% watched mark</>}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="Close"
                            className="absolute right-2 top-2 rounded-md p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                            onClick={() => setNotice(null)}
                        >
                            <LuX className="size-4" />
                        </button>
                        {notice.anilist !== "pending" && (
                            <motion.div
                                key={`${notice.key}-${notice.anilist}`}
                                className="absolute bottom-0 left-0 h-0.5 bg-emerald-400/70"
                                initial={{ width: "100%" }}
                                animate={{ width: hovered ? "100%" : "0%" }}
                                transition={{ duration: hovered ? 0.2 : EPISODE_FINISHED_NOTICE_MS / 1000, ease: "linear" }}
                            />
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
        </div>
    )
}
