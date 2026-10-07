import { useGetAnimeEntry } from "@/api/hooks/anime_entries.hooks"
import { useGetAnilistAnimeDetails } from "@/api/hooks/anilist.hooks"
import { VideoCoreLifecycleState } from "@/app/(main)/_features/video-core/video-core.atoms"
import { Button } from "@/components/ui/button"
import { SeaLink } from "@/components/shared/sea-link"
import { atom, useAtomValue, useSetAtom } from "jotai"
import { useAtom } from "jotai/react"
import React from "react"
import { LuArrowRight, LuPlay } from "react-icons/lu"

/**
 * Two things the player asks about rather than assuming.
 *
 *  - **The sequel.** Finishing the last episode of a series used to be the end of the road: the
 *    next episode button disappeared, and whatever continued the story was a page you had to find
 *    yourself. When there is nothing left to play but AniList says a sequel exists, the player
 *    offers it — one press to its page, which is where its episodes and its download options are.
 *
 *  - **Whether anyone is still there.** Binge sessions run for hours, and a player that keeps
 *    fetching, decoding and reporting progress for an empty room is doing all of it for nobody.
 *    Every third episode, playback pauses and asks. Continuing is one press; nothing is marked
 *    watched or unwatched either way — the check is about the room, not about the list.
 */

/** How many episodes play before the player checks that somebody is watching. */
const EPISODES_BETWEEN_CHECKS = 3

export type VideoCoreSequelPromptState = {
    mediaId: number
    /** The series just finished. */
    title: string
    /** The sequel's media id, and what it is called. */
    sequelId: number
    sequelTitle: string
}

export type VideoCoreStillWatchingState = {
    /** How many episodes have been played since the last check. */
    episodesWatched: number
}

// Module-level, like the progress prompt: there is one in-app player at a time.
export const vc_sequelPrompt = atom<VideoCoreSequelPromptState | null>(null)
export const vc_stillWatchingPrompt = atom<VideoCoreStillWatchingState | null>(null)

/** The sequel of a series, if AniList lists one. */
function findSequel(relations?: { relationType?: string; node?: any }[]): any | null {
    if (!relations?.length) return null
    // SEQUEL is the direct continuation. A series that continues as a "SIDE_STORY" or "ALTERNATIVE"
    // is not the same story picking up where it left off, so those are not offered as "the sequel".
    const sequel = relations.find(edge => (edge.relationType ?? "").toUpperCase() === "SEQUEL")
    return sequel?.node ?? null
}

/**
 * Watches episode transitions and raises the two prompts.
 *
 * Returns a callback the player calls when an episode reaches its end — the same place auto-progress
 * is triggered from — plus the state the prompts read.
 */
export function useVideoCoreWatchingChecks(state: VideoCoreLifecycleState, onPausePlayback?: () => void) {
    const mediaId = state.playbackInfo?.media?.id
    const episodeNumber = state.playbackInfo?.episode?.progressNumber ?? 0
    const totalEpisodes = state.playbackInfo?.media?.episodes ?? 0

    // Relations live on the full details, not on the entry's media object — and the details request
    // is the one most likely to be turned away while a graph walk is running, so it is asked for
    // only once the series has actually run out of episodes to play.
    const onLastEpisode = totalEpisodes > 0 && episodeNumber >= totalEpisodes
    const { data: details } = useGetAnilistAnimeDetails(onLastEpisode ? mediaId : null)

    const setSequelPrompt = useSetAtom(vc_sequelPrompt)
    const setStillWatching = useSetAtom(vc_stillWatchingPrompt)
    const stillWatching = useAtomValue(vc_stillWatchingPrompt)

    // Episodes played since the last check, kept per playback session. A ref, not state: nothing
    // renders from the count, and a re-render per episode would be work for no visible difference.
    const playedRef = React.useRef(0)

    // The last episode the end-of-episode callback has already handled, so a replayed end (a seek
    // back and forward again) does not count twice.
    const handledEndRef = React.useRef<string | null>(null)

    React.useEffect(() => {
        playedRef.current = 0
        handledEndRef.current = null
    }, [mediaId])

    const latestRef = React.useRef({ details, state, mediaId, episodeNumber, totalEpisodes, setSequelPrompt, setStillWatching })
    latestRef.current = { details, state, mediaId, episodeNumber, totalEpisodes, setSequelPrompt, setStillWatching }

    /**
     * Called when an episode finishes. Decides which of the two prompts, if either, is due.
     */
    const onEpisodeEnded = React.useCallback(() => {
        const { details, state, mediaId, episodeNumber, totalEpisodes, setSequelPrompt, setStillWatching } = latestRef.current
        if (!mediaId || !episodeNumber) return

        const key = `${mediaId}:${episodeNumber}`
        if (handledEndRef.current === key) return
        handledEndRef.current = key

        playedRef.current += 1

        // The last episode of a finished series: offer whatever continues it.
        const isLastEpisode = totalEpisodes > 0 && episodeNumber >= totalEpisodes
        if (isLastEpisode) {
            const sequel = findSequel(details?.relations?.edges)
            if (sequel?.id) {
                setSequelPrompt({
                    mediaId,
                    title: state.playbackInfo?.media?.title?.userPreferred ?? state.playbackInfo?.media?.title?.romaji ?? "This series",
                    sequelId: sequel.id,
                    sequelTitle: sequel.title?.userPreferred ?? sequel.title?.romaji ?? "the sequel",
                })
            }
        }

        // Every third episode, check that somebody is still there. The sequel prompt, if it just
        // came up, is the more useful question and is asked on its own.
        if (!isLastEpisode && playedRef.current >= EPISODES_BETWEEN_CHECKS) {
            playedRef.current = 0
            setStillWatching({ episodesWatched: EPISODES_BETWEEN_CHECKS })
        }
    }, [])

    // Pausing is the point of the still-watching check: a prompt over a playing video is one the
    // video talks over. The callback is optional so the hook is usable without a player to pause.
    React.useEffect(() => {
        if (stillWatching) {
            onPausePlayback?.()
        }
    }, [stillWatching, onPausePlayback])

    return { onEpisodeEnded }
}

/**
 * "Would you like to move to the sequel?" — shown when a series runs out of episodes and AniList
 * knows what comes next.
 */
export function VideoCoreSequelPrompt() {
    const [prompt, setPrompt] = useAtom(vc_sequelPrompt)

    if (!prompt) return null

    return (
        <div
            data-vc-element="sequel-prompt"
            className="absolute inset-0 flex items-center justify-center z-[55]"
            onClick={e => e.stopPropagation()}
            onPointerMove={e => e.stopPropagation()}
        >
            <div className="bg-gray-950/80 backdrop-blur-md rounded-xl p-6 text-center shadow-2xl border border-[--border] max-w-sm">
                <p className="text-white text-lg font-medium mb-1">That's the end of {prompt.title}</p>
                <p className="text-gray-300 text-sm mb-5">
                    <span className="font-semibold text-white">{prompt.sequelTitle}</span> continues the story.
                </p>
                <div className="flex gap-3 justify-center">
                    <SeaLink href={`/entry?id=${prompt.sequelId}`} onClick={() => setPrompt(null)}>
                        <Button size="sm" intent="white" leftIcon={<LuPlay />}>
                            Move to the sequel
                        </Button>
                    </SeaLink>
                    <Button
                        size="sm"
                        intent="gray-outline"
                        onClick={() => setPrompt(null)}
                    >
                        Not now
                    </Button>
                </div>
            </div>
        </div>
    )
}

/**
 * "Are you still watching?" — every third episode, with playback paused behind it.
 */
export function VideoCoreStillWatchingPrompt({ onResume }: { onResume?: () => void }) {
    const [prompt, setPrompt] = useAtom(vc_stillWatchingPrompt)

    if (!prompt) return null

    return (
        <div
            data-vc-element="still-watching-prompt"
            className="absolute inset-0 flex items-center justify-center z-[56]"
            onClick={e => e.stopPropagation()}
            onPointerMove={e => e.stopPropagation()}
        >
            <div className="bg-gray-950/80 backdrop-blur-md rounded-xl p-6 text-center shadow-2xl border border-[--border] max-w-sm">
                <p className="text-white text-lg font-medium mb-1">Still watching?</p>
                <p className="text-gray-300 text-sm mb-5">
                    That's {prompt.episodesWatched} episodes in a row. Playback is paused until you say so.
                </p>
                <div className="flex gap-3 justify-center">
                    <Button
                        size="sm"
                        intent="white"
                        leftIcon={<LuArrowRight />}
                        onClick={() => {
                            setPrompt(null)
                            onResume?.()
                        }}
                    >
                        Keep watching
                    </Button>
                    <Button
                        size="sm"
                        intent="gray-outline"
                        onClick={() => setPrompt(null)}
                    >
                        I'm done for now
                    </Button>
                </div>
            </div>
        </div>
    )
}
