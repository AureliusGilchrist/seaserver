import { useGetAnimeEntry } from "@/api/hooks/anime_entries.hooks"
import { useGetAnilistAnimeDetails } from "@/api/hooks/anilist.hooks"
import { VideoCoreLifecycleState } from "@/app/(main)/_features/video-core/video-core.atoms"
import { Button } from "@/components/ui/button"
import { usePlayNext } from "@/app/(main)/_atoms/playback.atoms"
import { useRouter } from "@/lib/navigation"
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
 *    Every third episode, before the next one starts, the player asks. Continuing is one press;
 *    nothing is marked watched or unwatched either way — the check is about the room, not about
 *    the list.
 *
 *    The question is asked *between* episodes, never mid-episode: an earlier version paused
 *    playback at the 85% mark, which stranded the episode before its `ended` event — auto-next
 *    never fired while nobody answered, the stream session sat open in a paused state, and a
 *    prompt raised during a fullscreen episode survived the between-episode reload, where the
 *    fullscreen manager is briefly destroyed and Escape had no fallback — a stuck player only
 *    a restart could fix.
 */

/** How many episodes play before the player checks that somebody is watching, when the
 * player settings don't override it (Settings -> App). */
export const DEFAULT_EPISODES_BETWEEN_CHECKS = 3

/** The default hours the check applies in: from 7 pm to 10 am. */
export const DEFAULT_CHECK_START_HOUR = 19
export const DEFAULT_CHECK_END_HOUR = 10

/**
 * The hours the check applies in, configurable in Personal settings: "from startHour to endHour" —
 * by default the night, from 7 pm to 10 am, which is when a session runs long enough for the
 * question to be worth asking and when an empty room is most likely. Midday viewing is short and
 * deliberate, so it is never interrupted.
 *
 * The window may span midnight: 19 → 10 is "past 7 pm or before 10 am", not a between-two check.
 * A window whose ends meet (startHour === endHour) is the whole day.
 */
export function isInCheckWindow(hour: number, startHour: number, endHour: number): boolean {
    const start = Math.min(23, Math.max(0, Math.round(startHour)))
    const end = Math.min(23, Math.max(0, Math.round(endHour)))
    if (start === end) return true
    if (start < end) return hour >= start && hour < end
    return hour >= start || hour < end
}

/**
 * Whether the check applies at this hour, honoring the chosen timing mode ("night" — the preset
 * evening-to-morning window, "always" — every hour, "custom" — the user's own window).
 * Midnight-crossing windows and equal ends mean the whole day, as in isInCheckWindow.
 */
export function isStillWatchingActiveHour(
    hour: number,
    timingMode: "night" | "always" | "custom",
    startHour: number,
    endHour: number,
): boolean {
    if (timingMode === "always") return true
    return isInCheckWindow(hour, startHour, endHour)
}

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

/** Settings -> App: whether the still-watching check runs, and how many episodes between checks. */
export type VideoCoreStillWatchingConfig = {
    enabled: boolean
    episodes: number
    /** Whether the player is allowed to advance on its own (auto-next on, not a watch party).
     * The check only intercepts an advance the player was about to make by itself — with
     * auto-next off the user picks each episode, so there is nothing to ask about. */
    canAutoAdvance?: boolean
    /** When the check applies: "night" — the preset 7 pm-to-10 am window (the default), "always" —
     * every hour, "custom" — the startHour/endHour window below. */
    timingMode?: "night" | "always" | "custom"
    /** Hours of day (0–23) the check applies in when timingMode is "night" or "custom" — the
     * default window is 19 → 10, 7 pm to 10 am. The window may span midnight; equal ends mean the
     * whole day. */
    startHour?: number
    endHour?: number
}

// Module-level, like the progress prompt: there is one in-app player at a time.
export const vc_sequelPrompt = atom<VideoCoreSequelPromptState | null>(null)
export const vc_stillWatchingPrompt = atom<VideoCoreStillWatchingState | null>(null)

/**
 * Set at the 85% mark of an episode that has earned a check; consumed when the episode
 * actually ends, where it becomes the prompt instead of an automatic next episode. A flag
 * rather than the prompt itself so the question lands at the episode boundary — never in
 * the middle of one.
 */
export const vc_stillWatchingHold = atom(false)

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
export function useVideoCoreWatchingChecks(
    state: VideoCoreLifecycleState,
    stillWatchingConfig?: VideoCoreStillWatchingConfig,
) {
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
    const setStillWatchingHold = useSetAtom(vc_stillWatchingHold)

    // Episodes played since the last check, kept per playback session. A ref, not state: nothing
    // renders from the count, and a re-render per episode would be work for no visible difference.
    const playedRef = React.useRef(0)

    // The last episode the end-of-episode callback has already handled, so a replayed end (a seek
    // back and forward again) does not count twice.
    const handledEndRef = React.useRef<string | null>(null)

    const stillWatchingHold = useAtomValue(vc_stillWatchingHold)

    // A new stream starting renders every raised prompt stale — the question was about the
    // episode that just finished, and letting it survive the transition would either sit over
    // the new episode or (in the old pause-based design) pause a fresh one at 0:00.
    React.useEffect(() => {
        setStillWatching(null)
        setStillWatchingHold(false)
    }, [state.playbackInfo?.id, setStillWatching, setStillWatchingHold])

    React.useEffect(() => {
        playedRef.current = 0
        handledEndRef.current = null
    }, [mediaId])

    const latestRef = React.useRef({ details, state, mediaId, episodeNumber, totalEpisodes, setSequelPrompt, setStillWatching, setStillWatchingHold, stillWatchingConfig, stillWatchingHold })
    latestRef.current = { details, state, mediaId, episodeNumber, totalEpisodes, setSequelPrompt, setStillWatching, setStillWatchingHold, stillWatchingConfig, stillWatchingHold }

    /**
     * Called when an episode reaches the completion threshold. Counts the episode and arms the
     * check when the interval is due — the question itself waits for the episode to end.
     */
    const onEpisodeEnded = React.useCallback(() => {
        const { mediaId, episodeNumber, setStillWatchingHold, stillWatchingConfig } = latestRef.current
        if (!mediaId || !episodeNumber) return

        const key = `${mediaId}:${episodeNumber}`
        if (handledEndRef.current === key) return
        handledEndRef.current = key

        // The check intercepts only advances the player would make on its own.
        if (stillWatchingConfig?.canAutoAdvance === false) return

        const checkInterval = Math.max(1, stillWatchingConfig?.episodes ?? DEFAULT_EPISODES_BETWEEN_CHECKS)
        if (playedRef.current + 1 >= checkInterval) {
            playedRef.current = 0
            setStillWatchingHold(true)
        } else {
            playedRef.current += 1
        }
    }, [])

    /**
     * Called by the player instead of an automatic next episode. Returns true when the advance
     * must be withheld — the check was armed and now becomes the prompt (night hours only);
     * false means "go ahead".
     */
    const beforeAutoNext = React.useCallback(() => {
        const { setStillWatching, setStillWatchingHold, stillWatchingConfig, stillWatchingHold } = latestRef.current

        // A still-watching prompt raised for a previous episode has no claim on this one.
        setStillWatching(null)

        if (!stillWatchingConfig?.canAutoAdvance) return false
        if (!stillWatchingHold) return false

        setStillWatchingHold(false)

        const hour = new Date().getHours()
        if (!isStillWatchingActiveHour(hour, stillWatchingConfig.timingMode ?? "night", stillWatchingConfig.startHour ?? DEFAULT_CHECK_START_HOUR, stillWatchingConfig.endHour ?? DEFAULT_CHECK_END_HOUR)) return false

        const checkInterval = Math.max(1, stillWatchingConfig?.episodes ?? DEFAULT_EPISODES_BETWEEN_CHECKS)
        setStillWatching({ episodesWatched: checkInterval })
        return true
    }, [])

    /**
     * Called when the video has actually finished playing, i.e. after the ending song. The sequel
     * offer waits for this rather than appearing at the 80% mark.
     */
    const onVideoEnded = React.useCallback(() => {
        const { details, state, mediaId, episodeNumber, totalEpisodes, setSequelPrompt } = latestRef.current
        if (!mediaId || !episodeNumber) return
        if (!(totalEpisodes > 0 && episodeNumber >= totalEpisodes)) return
        const sequel = findSequel(details?.relations?.edges)
        if (sequel?.id) {
            setSequelPrompt({
                mediaId,
                title: state.playbackInfo?.media?.title?.userPreferred ?? state.playbackInfo?.media?.title?.romaji ?? "This series",
                sequelId: sequel.id,
                sequelTitle: sequel.title?.userPreferred ?? sequel.title?.romaji ?? "the sequel",
            })
        }
    }, [])

    return { onEpisodeEnded, onVideoEnded, beforeAutoNext }
}

/**
 * "Would you like to move to the sequel?" — shown when a series runs out of episodes and AniList
 * knows what comes next.
 */
export function VideoCoreSequelPrompt() {
    const [prompt, setPrompt] = useAtom(vc_sequelPrompt)
    const router = useRouter()
    const { setPlayNext } = usePlayNext()

    if (!prompt) return null

    const startSequel = () => {
        const id = prompt.sequelId
        setPrompt(null)
        setPlayNext(id, () => router.push(`/entry?id=${id}`))
    }

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
                    <Button size="sm" intent="white" leftIcon={<LuPlay />} onClick={startSequel}>
                        Start episode 1
                    </Button>
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
 * "Are you still watching?" — every few episodes, between one episode ending and the next
 * starting. The next episode waits until answered.
 */
export function VideoCoreStillWatchingPrompt({ onContinue }: { onContinue?: () => void }) {
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
                    That's {prompt.episodesWatched} episodes in a row. The next one starts when you say so.
                </p>
                <div className="flex gap-3 justify-center">
                    <Button
                        size="sm"
                        intent="white"
                        leftIcon={<LuArrowRight />}
                        onClick={() => {
                            setPrompt(null)
                            onContinue?.()
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
