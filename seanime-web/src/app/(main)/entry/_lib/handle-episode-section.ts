import { Anime_Entry } from "@/api/generated/types"
import { __anime_entryPageViewAtom } from "@/app/(main)/entry/_containers/anime-entry-page"
import { useHandlePlayMedia } from "@/app/(main)/entry/_lib/handle-play-media"
import { usePlayNextVideoOnMount } from "@/app/(main)/entry/_lib/handle-play-on-mount"
import { __onlinestream_selectedEpisodeNumberAtom } from "@/app/(main)/onlinestream/_lib/onlinestream.atoms"
import { useProgressQueue } from "@/lib/progress-queue/progress-queue"
import { useSetAtom } from "jotai"
import React from "react"

export function useHandleEpisodeSection(props: { entry: Anime_Entry }) {
    const { entry } = props
    const media = entry.media

    const { playMediaFile } = useHandlePlayMedia()
    const setEntryPageView = useSetAtom(__anime_entryPageViewAtom)
    const setSelectedOnlineEpisodeNumber = useSetAtom(__onlinestream_selectedEpisodeNumberAtom)
    const [pendingNextEpisode, setPendingNextEpisode] = React.useState<Anime_Entry["nextEpisode"] | null>(null)

    usePlayNextVideoOnMount({
        onPlay: () => {
            if (entry.nextEpisode) {
                setPendingNextEpisode(entry.nextEpisode)
            }
        },
    }, !!entry.nextEpisode)

    const dismissPlayNextPrompt = React.useCallback(() => {
        setPendingNextEpisode(null)
    }, [])

    const watchNextEpisode = React.useCallback(() => {
        if (!pendingNextEpisode) return
        setPendingNextEpisode(null)

        // nextEpisode always comes from the library, so a local file is normally present.
        // If it somehow isn't, fall back to the Online Player for that episode instead of
        // handing playMediaFile an empty path.
        const path = pendingNextEpisode.localFile?.path ?? ""
        if (!path) {
            setEntryPageView("onlinestream")
            setSelectedOnlineEpisodeNumber(pendingNextEpisode.progressNumber ?? pendingNextEpisode.episodeNumber)
            return
        }

        playMediaFile({
            path,
            mediaId: entry.mediaId,
            episode: pendingNextEpisode,
        })
    }, [entry.mediaId, pendingNextEpisode, playMediaFile, setEntryPageView, setSelectedOnlineEpisodeNumber])

    const mainEpisodes = React.useMemo(() => {
        return entry.episodes?.filter(ep => ep.type === "main") ?? []
    }, [entry.episodes])

    const specialEpisodes = React.useMemo(() => {
        return (entry.episodes?.filter(ep => ep.type === "special") ?? [])
            .sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, undefined, { numeric: true }))
    }, [entry.episodes])

    const ncEpisodes = React.useMemo(() => {
        return (entry.episodes?.filter(ep => ep.type === "nc" && !!ep.localFile?.path) ?? []).sort((a,
            b,
        ) => a.localFile!.path!.localeCompare(b.localFile!.path!, undefined, { numeric: true }))
    }, [entry.episodes])

    const hasInvalidEpisodes = React.useMemo(() => {
        return entry.episodes?.some(ep => ep.isInvalid) ?? false
    }, [entry.episodes])

    // Episodes watched this run but still queued for AniList count as watched here: "up next" is the
    // episode the user is actually on, not the one AniList hasn't caught up to yet.
    const { effectiveProgress } = useProgressQueue(entry.mediaId, entry.listData?.progress)

    const episodesToWatch = React.useMemo(() => {

        const ret = mainEpisodes.filter(ep => {
            if (!entry.nextEpisode) {
                return true
            } else {
                return ep.progressNumber > effectiveProgress
            }
        })
        return (!!entry.listData?.progress && !entry.nextEpisode) ? ret.reverse() : ret
    }, [mainEpisodes, entry.nextEpisode, entry.listData?.progress, effectiveProgress])

    return {
        media,
        mainEpisodes,
        specialEpisodes,
        ncEpisodes,
        hasInvalidEpisodes,
        episodesToWatch,
        pendingNextEpisode,
        dismissPlayNextPrompt,
        watchNextEpisode,
    }
}
