import { Anime_Episode } from "@/api/generated/types"
import {
    finishEntry,
    looksDozed,
    noteInput,
    pushHistory,
    recapOrder,
    shortDescription,
    splitShowMore,
    startEntry,
    StillWatchingEpisodeSnapshot,
    StillWatchingHistoryEntry,
} from "@/app/(main)/_features/video-core/_lib/still-watching-history"
import { vc_skipOpeningOnceAtom } from "@/app/(main)/_features/video-core/video-core-atoms"
import { useVideoCorePlaylist } from "@/app/(main)/_features/video-core/video-core-playlist"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { cn } from "@/components/ui/core/styling"
import { getImageUrl } from "@/lib/server/assets"
import { useGetAnimeEntry } from "@/api/hooks/anime_entries.hooks"
import { useGetAnilistAnimeDetails } from "@/api/hooks/anilist.hooks"
import { VideoCoreLifecycleState } from "@/app/(main)/_features/video-core/video-core.atoms"
import { vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_playlistState } from "@/app/(main)/_features/video-core/video-core-playlist"
import { Button } from "@/components/ui/button"
import { usePlayNext } from "@/app/(main)/_atoms/playback.atoms"
import { useRouter } from "@/lib/navigation"
import { atom, useAtomValue, useSetAtom } from "jotai"
import { useAtom } from "jotai/react"
import React from "react"
import { LuArrowRight, LuChevronDown, LuHistory, LuMoon, LuPlay } from "react-icons/lu"

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
    /** What played since the last check (or since watching started), oldest first. */
    history: StillWatchingHistoryEntry[]
    /** The episode "Keep watching" plays, when there is one. */
    next: StillWatchingEpisodeSnapshot | null
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
    /** A pause or gap longer than this (minutes) starts a fresh viewing session: the count restarts. */
    sessionGapMinutes?: number
    /** Mouse movement during playback postpones the question, one episode per `mouseAmount`
     * screen-widths travelled, at most `mouseMaxExtra` episodes. */
    mouseExtends?: boolean
    mouseAmount?: number
    mouseMaxExtra?: number
}

/**
 * The viewing session the check counts in. Module scope on purpose: the player remounts between
 * episodes, and a per-mount ref lost the count every episode (so the question was never asked).
 * A session ends only after a break longer than the profile's "fresh session" setting.
 */
const stillWatchingSession = {
    /** Episodes played since the last check in this session. */
    played: 0,
    /** Last time video was actually playing (ms), for the session-break rule. */
    lastActiveAt: 0,
    /** Mouse travel since the last check, in screen widths. */
    moved: 0,
    /** Extra episodes already granted by mouse movement since the last check. */
    extraUsed: 0,
    /** Finished episodes since the last check, for the recap. */
    history: [] as StillWatchingHistoryEntry[],
    /** The episode playing now, with the input seen while it plays. */
    current: null as StillWatchingHistoryEntry | null,
    /** The history the armed check will show, set aside when the check arms. */
    armed: [] as StillWatchingHistoryEntry[],
}

function resetStillWatchingSession() {
    stillWatchingSession.played = 0
    stillWatchingSession.moved = 0
    stillWatchingSession.extraUsed = 0
    stillWatchingSession.history = []
}

/** What the recap needs to know about an episode, kept apart from the playlist objects. */
export function snapshotEpisode(ep: Anime_Episode | null | undefined): StillWatchingEpisodeSnapshot | null {
    if (!ep) return null
    return {
        aniDBEpisode: ep.aniDBEpisode,
        episodeNumber: ep.episodeNumber,
        progressNumber: ep.progressNumber,
        displayTitle: ep.displayTitle,
        episodeTitle: ep.episodeTitle,
        image: ep.episodeMetadata?.image || ep.baseAnime?.coverImage?.large,
        description: ep.episodeMetadata?.summary || ep.episodeMetadata?.overview,
        isFiller: ep.episodeMetadata?.isFiller,
        length: ep.episodeMetadata?.length,
    }
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

    // Each stream starting is an episode the recap may list: note when it started, then the input
    // seen while it plays (for "you may have dozed off").
    React.useEffect(() => {
        const ep = snapshotEpisode(state.playbackInfo?.episode)
        if (!mediaId || !ep) return
        stillWatchingSession.current = startEntry(mediaId, ep, Date.now())
    }, [state.playbackInfo?.id])
    React.useEffect(() => {
        let lastMove = 0
        const note = () => {
            const cur = stillWatchingSession.current
            if (cur) noteInput(cur, Date.now())
        }
        const onMove = (e: PointerEvent) => {
            if (e.pointerType === "touch") return
            const now = Date.now()
            if (now - lastMove < 1000) return
            lastMove = now
            note()
        }
        window.addEventListener("pointermove", onMove, { passive: true })
        window.addEventListener("pointerdown", note, { passive: true })
        window.addEventListener("keydown", note)
        window.addEventListener("wheel", note, { passive: true })
        return () => {
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerdown", note)
            window.removeEventListener("keydown", note)
            window.removeEventListener("wheel", note)
        }
    }, [])

    // A different show is a different end-of-episode key; the session count itself carries on.
    React.useEffect(() => {
        handledEndRef.current = null
    }, [mediaId])

    // Session break: while video plays, note the time; a gap longer than the profile's setting
    // (pause, or time between episodes) starts a fresh session.
    const videoElement = useAtomValue(vc_videoElement)
    const sessionGapMs = Math.max(1, stillWatchingConfig?.sessionGapMinutes ?? 30) * 60_000
    React.useEffect(() => {
        if (!videoElement) return
        let lastTick = 0
        const touch = () => {
            const now = Date.now()
            if (now - lastTick < 2000) return
            lastTick = now
            const last = stillWatchingSession.lastActiveAt
            if (last && now - last > sessionGapMs) resetStillWatchingSession()
            stillWatchingSession.lastActiveAt = now
        }
        const onPlaying = () => {
            lastTick = 0
            touch()
        }
        videoElement.addEventListener("playing", onPlaying)
        videoElement.addEventListener("timeupdate", touch)
        return () => {
            videoElement.removeEventListener("playing", onPlaying)
            videoElement.removeEventListener("timeupdate", touch)
        }
    }, [videoElement, sessionGapMs])

    // Mouse movement, in screen widths travelled, for the "movement postpones the question" option.
    const mouseExtends = !!stillWatchingConfig?.mouseExtends
    React.useEffect(() => {
        if (!mouseExtends) return
        let lx: number | null = null, ly: number | null = null
        const onMove = (e: PointerEvent) => {
            if (e.pointerType === "touch") return
            if (lx !== null && ly !== null) {
                stillWatchingSession.moved += Math.hypot(e.clientX - lx, e.clientY - ly) / Math.max(1, window.innerWidth)
            }
            lx = e.clientX
            ly = e.clientY
        }
        window.addEventListener("pointermove", onMove, { passive: true })
        return () => window.removeEventListener("pointermove", onMove)
    }, [mouseExtends])

    // Whether there is anything left to advance to. The playlist's next episode is what auto-next
    // actually plays (it knows about missing files and skipped filler); before it has loaded, fall
    // back to the episode count. No next episode means there's nothing to ask about.
    const playlistState = useAtomValue(vc_playlistState)
    const hasNextEpisode = playlistState
        ? !!playlistState.nextEpisode
        : !(totalEpisodes > 0 && episodeNumber >= totalEpisodes)

    const nextEpisode = playlistState?.nextEpisode ?? null
    const latestRef = React.useRef({ details, state, mediaId, episodeNumber, totalEpisodes, setSequelPrompt, setStillWatching, setStillWatchingHold, stillWatchingConfig, stillWatchingHold, hasNextEpisode, nextEpisode })
    latestRef.current = { details, state, mediaId, episodeNumber, totalEpisodes, setSequelPrompt, setStillWatching, setStillWatchingHold, stillWatchingConfig, stillWatchingHold, hasNextEpisode, nextEpisode }

    /**
     * Called when an episode reaches the completion threshold. Counts the episode and arms the
     * check when the interval is due — the question itself waits for the episode to end.
     */
    const onEpisodeEnded = React.useCallback(() => {
        const { mediaId, episodeNumber, setStillWatchingHold, stillWatchingConfig, hasNextEpisode } = latestRef.current
        if (!mediaId || !episodeNumber) return
        // The last episode: nothing plays next, so it neither counts nor asks.
        if (!hasNextEpisode) return

        const key = `${mediaId}:${episodeNumber}`
        if (handledEndRef.current === key) return
        handledEndRef.current = key

        // Into the recap history, whether or not the check is due.
        const cur = stillWatchingSession.current
        if (cur && cur.mediaId === mediaId) {
            stillWatchingSession.history = pushHistory(stillWatchingSession.history, finishEntry(cur, Date.now()))
        }

        // The check intercepts only advances the player would make on its own, and only when on.
        if (stillWatchingConfig?.canAutoAdvance === false) return
        if (stillWatchingConfig?.enabled === false) return

        const checkInterval = Math.max(1, stillWatchingConfig?.episodes ?? DEFAULT_EPISODES_BETWEEN_CHECKS)
        const session = stillWatchingSession
        if (session.played + 1 >= checkInterval) {
            // Enough mouse movement since the last check means someone's clearly here: postpone by
            // one episode, up to the profile's maximum.
            const amount = Math.max(1, stillWatchingConfig?.mouseAmount ?? 20)
            const maxExtra = Math.max(0, stillWatchingConfig?.mouseMaxExtra ?? 2)
            if (stillWatchingConfig?.mouseExtends && session.moved >= amount && session.extraUsed < maxExtra) {
                session.extraUsed += 1
                session.moved = 0
                session.played = checkInterval - 1 // the next episode checks again
                return
            }
            stillWatchingSession.armed = stillWatchingSession.history
            resetStillWatchingSession()
            setStillWatchingHold(true)
        } else {
            session.played += 1
        }
    }, [])

    /**
     * Called by the player instead of an automatic next episode. Returns true when the advance
     * must be withheld — the check was armed and now becomes the prompt (night hours only);
     * false means "go ahead".
     */
    const beforeAutoNext = React.useCallback(() => {
        const { setStillWatching, setStillWatchingHold, stillWatchingConfig, stillWatchingHold, hasNextEpisode } = latestRef.current

        // A still-watching prompt raised for a previous episode has no claim on this one.
        setStillWatching(null)

        if (!hasNextEpisode) {
            setStillWatchingHold(false)
            return false
        }

        if (!stillWatchingConfig?.canAutoAdvance) return false
        if (stillWatchingConfig.enabled === false) return false
        if (!stillWatchingHold) return false

        setStillWatchingHold(false)

        const hour = new Date().getHours()
        // When to ask follows the profile's Personal settings (night by default, all day, or own hours).
        if (!isStillWatchingActiveHour(hour, stillWatchingConfig.timingMode ?? "night", stillWatchingConfig.startHour ?? DEFAULT_CHECK_START_HOUR, stillWatchingConfig.endHour ?? DEFAULT_CHECK_END_HOUR)) return false

        const checkInterval = Math.max(1, stillWatchingConfig?.episodes ?? DEFAULT_EPISODES_BETWEEN_CHECKS)
        const history = stillWatchingSession.armed
        stillWatchingSession.armed = []
        setStillWatching({
            episodesWatched: history.length || checkInterval,
            history,
            next: snapshotEpisode(latestRef.current.nextEpisode),
        })
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
            className="absolute inset-0 flex items-center justify-center z-[55] cursor-auto"
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
 * "Are you still watching?" — every few episodes, between one episode ending and the next starting.
 * The next episode waits until answered. "I think I missed something" opens a recap of what played
 * (greyed, newest first, dozed-off ones flagged) where any card replays that episode; the episode
 * that plays next always sits at the bottom. Personal settings shape all of it.
 */
export function VideoCoreStillWatchingPrompt({ onContinue, onLeave }: { onContinue?: () => void, onLeave?: () => void }) {
    const [prompt, setPrompt] = useAtom(vc_stillWatchingPrompt)
    const personal = usePersonalSettings()
    const playlistState = useAtomValue(vc_playlistState)
    const { playSpecificEpisode } = useVideoCorePlaylist()
    const setSkipOpeningOnce = useSetAtom(vc_skipOpeningOnceAtom)
    const [view, setView] = React.useState<"ask" | "recap" | "countdown">("ask")
    const [showAll, setShowAll] = React.useState(false)
    const [remaining, setRemaining] = React.useState(0)

    React.useEffect(() => {
        setView("ask")
        setShowAll(false)
    }, [prompt])

    const ordered = React.useMemo(() => recapOrder(prompt?.history ?? [], personal.stillWatchingFlagDozed && personal.stillWatchingDozedFirst),
        [prompt, personal.stillWatchingFlagDozed, personal.stillWatchingDozedFirst])
    const dozed = personal.stillWatchingFlagDozed ? ordered.filter(looksDozed) : []
    const { shown, hidden } = splitShowMore(ordered, personal.stillWatchingRecapCount)
    const canPickEpisodes = !!playlistState?.episodes?.length

    const close = () => setPrompt(null)
    const playNext = () => {
        close()
        onContinue?.()
    }
    const keepWatching = () => {
        if (!prompt?.next || personal.stillWatchingCountdown <= 0) return playNext()
        setRemaining(personal.stillWatchingCountdown)
        setView("countdown")
    }
    const done = () => {
        close()
        if (personal.stillWatchingDoneLeaves) onLeave?.()
    }
    const replay = (entry: StillWatchingHistoryEntry) => {
        const target = playlistState?.episodes?.find(e =>
            (!!entry.episode.aniDBEpisode && e.aniDBEpisode === entry.episode.aniDBEpisode) ||
            e.progressNumber === entry.episode.progressNumber)
        if (!target) return
        close()
        if (personal.stillWatchingReplayFrom === "afterOpening") setSkipOpeningOnce(true)
        playSpecificEpisode(target)
    }

    // Countdown after "Keep watching".
    React.useEffect(() => {
        if (view !== "countdown") return
        if (remaining <= 0) {
            playNext()
            return
        }
        const t = setTimeout(() => setRemaining(r => r - 1), 1000)
        return () => clearTimeout(t)
    }, [view, remaining])

    // Enter keeps watching, M opens the recap, Esc is done (or cancels the countdown).
    React.useEffect(() => {
        if (!prompt) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault()
                e.stopPropagation()
                if (view === "countdown") playNext()
                else keepWatching()
            } else if ((e.key === "m" || e.key === "M") && personal.stillWatchingRecap && view === "ask") {
                e.stopPropagation()
                setView("recap")
            } else if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                if (view === "countdown") setView("ask")
                else done()
            }
        }
        window.addEventListener("keydown", onKey, true)
        return () => window.removeEventListener("keydown", onKey, true)
    })

    if (!prompt) return null

    const nextCard = prompt.next
        ? <RecapCard
            episode={prompt.next}
            label={view === "countdown" ? `Up next · ${remaining}s` : "Up next"}
            variant="next"
            descriptions={personal.stillWatchingRecapDescriptions}
            spoilerGuard={personal.stillWatchingSpoilerGuard}
            onClick={playNext}
            countdown={view === "countdown" ? { remaining, total: personal.stillWatchingCountdown } : undefined}
        />
        : <div className="rounded-2xl border border-dashed border-white/15 p-4 text-center text-sm text-white/55">That was the last episode.</div>

    const entryCard = (e: StillWatchingHistoryEntry) => {
        const isDozed = personal.stillWatchingFlagDozed && looksDozed(e)
        return <RecapCard
            key={e.key}
            episode={e.episode}
            label={isDozed ? "May have dozed off" : "Watched"}
            variant={isDozed ? "dozed" : "watched"}
            descriptions={personal.stillWatchingRecapDescriptions}
            onClick={canPickEpisodes ? () => replay(e) : undefined}
        />
    }

    return (
        <div
            data-vc-element="still-watching-prompt"
            className="absolute inset-0 z-[56] flex cursor-auto items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={e => e.stopPropagation()}
            onPointerMove={e => e.stopPropagation()}
        >
            <div
                className={cn(
                    "w-full rounded-3xl border border-white/10 bg-gray-950/80 p-6 shadow-2xl backdrop-blur-xl",
                    view === "ask" ? "max-w-md text-center" : "max-w-2xl",
                )}
            >
                <p className="text-xl font-semibold text-white">Still watching?</p>
                <p className="mt-1 text-sm text-gray-300">
                    That's {prompt.episodesWatched} episode{prompt.episodesWatched === 1 ? "" : "s"} in a row. The next one starts when you say so.
                </p>
                {dozed.length > 0 && view === "ask" && (
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-amber-200/90">
                        <LuMoon className="size-3.5" />
                        Looks like you may have dozed off during {dozed.length === 1
                        ? `episode ${dozed[0].episode.progressNumber ?? dozed[0].episode.episodeNumber}`
                        : `${dozed.length} episodes`}.
                    </p>
                )}

                {view === "recap" && (
                    <div className="mt-5 max-h-[55vh] space-y-2.5 overflow-y-auto pr-1 text-left" data-vc-still-watching-recap>
                        {!canPickEpisodes && <p className="text-xs text-white/50">Replaying an earlier episode isn't available here.</p>}
                        {shown.map(entryCard)}
                        {showAll && hidden.map(entryCard)}
                        {hidden.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowAll(v => !v)}
                                className="mx-auto flex items-center gap-1.5 rounded-full bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-white/75 ring-1 ring-white/10 hover:text-white"
                            >
                                {showAll ? "Show less" : `Show more (${hidden.length})`}
                                <LuChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
                            </button>
                        )}
                        <div className="pt-1">{nextCard}</div>
                    </div>
                )}

                {view === "countdown" && <div className="mt-5 text-left">{nextCard}</div>}

                <div className={cn("mt-6 flex flex-wrap gap-2.5", view === "ask" ? "justify-center" : "justify-end")}>
                    {view === "countdown" ? <>
                        <Button size="sm" intent="white" leftIcon={<LuPlay />} onClick={playNext}>Play now</Button>
                        <Button size="sm" intent="gray-outline" onClick={() => setView("ask")}>Cancel</Button>
                    </> : <>
                        <Button size="sm" intent="white" leftIcon={<LuArrowRight />} onClick={keepWatching}>Keep watching</Button>
                        {personal.stillWatchingRecap && view === "ask" && (prompt.history.length > 0 || !!prompt.next) && (
                            <Button size="sm" intent="gray-subtle" leftIcon={<LuHistory />} onClick={() => setView("recap")}>
                                I think I missed something
                            </Button>
                        )}
                        <Button size="sm" intent="gray-outline" onClick={done}>I'm done for now</Button>
                    </>}
                </div>
            </div>
        </div>
    )
}

function RecapCard({ episode, label, variant, descriptions, spoilerGuard, onClick, countdown }: {
    episode: StillWatchingEpisodeSnapshot
    label: string
    variant: "watched" | "dozed" | "next"
    descriptions: "full" | "short" | "hidden"
    spoilerGuard?: boolean
    onClick?: () => void
    countdown?: { remaining: number, total: number }
}) {
    const number = episode.progressNumber ?? episode.episodeNumber
    const title = episode.episodeTitle || episode.displayTitle
    const desc = descriptions === "hidden"
        ? ""
        : descriptions === "short" ? shortDescription(episode.description) : (episode.description ?? "").replace(/<[^>]+>/g, "")
    const greyed = variant !== "next"
    return (
        <button
            type="button"
            disabled={!onClick}
            onClick={onClick}
            className={cn(
                "group relative flex w-full gap-3 overflow-hidden rounded-2xl p-2.5 text-left ring-1 transition-all",
                variant === "next" ? "bg-brand-500/[0.08] ring-brand-400/30 hover:bg-brand-500/[0.14]" : "bg-white/[0.03] ring-white/10",
                greyed && "opacity-60 grayscale hover:opacity-100 hover:grayscale-0",
                variant === "dozed" && "ring-amber-300/25",
                !onClick && "cursor-default",
            )}
        >
            <span className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-white/[0.05] sm:w-44">
                {episode.image && <img src={getImageUrl(episode.image)} alt="" className="size-full object-cover" loading="lazy" />}
                {onClick && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <LuPlay className="size-6 text-white" />
                    </span>
                )}
                {countdown && (
                    <span
                        className="absolute bottom-0 left-0 h-1 bg-brand-300 transition-[width] duration-1000 ease-linear"
                        style={{ width: `${(1 - countdown.remaining / Math.max(1, countdown.total)) * 100}%` }}
                    />
                )}
            </span>
            <span className="min-w-0 flex-1 py-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                    <span
                        className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            variant === "next" ? "bg-brand-500/25 text-brand-100" : variant === "dozed" ? "bg-amber-400/15 text-amber-200" : "bg-white/[0.08] text-white/60",
                        )}
                    >{label}</span>
                    {episode.isFiller && <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-200">Filler</span>}
                </span>
                <span className="mt-1 block truncate text-sm font-semibold text-white">
                    {number !== undefined ? `Episode ${number}` : ""}{title && title !== `Episode ${number}` ? ` · ${title}` : ""}
                </span>
                {!!desc && (
                    <span
                        className={cn(
                            "mt-0.5 block text-xs leading-relaxed text-white/60",
                            descriptions === "short" && "line-clamp-2",
                            descriptions === "full" && "line-clamp-5",
                            spoilerGuard && variant === "next" && "blur-[3px] transition-[filter] group-hover:blur-0",
                        )}
                    >{desc}</span>
                )}
            </span>
        </button>
    )
}
