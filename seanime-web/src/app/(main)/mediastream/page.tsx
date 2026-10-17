"use client"
import { useGetAnimeEntry } from "@/api/hooks/anime_entries.hooks"
import { EpisodeGridItem } from "@/app/(main)/_features/anime/_components/episode-grid-item"
import { MediaEntryPageSmallBanner } from "@/app/(main)/_features/media/_components/media-entry-page-small-banner"
import { MediaEpisodeInfoModal } from "@/app/(main)/_features/media/_components/media-episode-info-modal"
import { SeaMediaPlayerLayout } from "@/app/(main)/_features/sea-media-player/sea-media-player-layout"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { useMediastreamCurrentFile } from "@/app/(main)/mediastream/_lib/mediastream.atoms"
import { useMediastreamVideoCore } from "@/app/(main)/mediastream/_lib/use-mediastream-videocore"
import { MediastreamVideoCore } from "@/app/(main)/mediastream/_lib/mediastream-videocore"
import { MediastreamPlaybackInfo } from "@/app/(main)/mediastream/_lib/mediastream-playback-info"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { useRouter, useSearchParams } from "@/lib/navigation"
import React from "react"
import { PluginEpisodeGridItemMenuItems } from "../_features/plugin/actions/plugin-actions"
import { SeaMediaPlayerProvider } from "../_features/sea-media-player/sea-media-player-provider"


export default function Page() {
    const serverStatus = useServerStatus()
    const router = useRouter()

    React.useEffect(() => {
        document.body.setAttribute("data-player-page", "true")
        return () => document.body.removeAttribute("data-player-page")
    }, [])
    const searchParams = useSearchParams()
    const mediaId = searchParams.get("id")
    const { data: animeEntry, isLoading: animeEntryLoading } = useGetAnimeEntry(mediaId)
    const { filePath } = useMediastreamCurrentFile()

    const mainEpisodes = React.useMemo(() => {
        return animeEntry?.episodes?.filter(ep => ep.type === "main") ?? []
    }, [animeEntry?.episodes])

    const specialEpisodes = React.useMemo(() => {
        return animeEntry?.episodes?.filter(ep => ep.type === "special") ?? []
    }, [animeEntry?.episodes])

    const ncEpisodes = React.useMemo(() => {
        return animeEntry?.episodes?.filter(ep => ep.type === "nc") ?? []
    }, [animeEntry?.episodes])

    const episodes = React.useMemo(() => {
        return [...mainEpisodes, ...specialEpisodes, ...ncEpisodes]
    }, [mainEpisodes, specialEpisodes, ncEpisodes])

    const {
        lifecycleState,
        episode: currentEpisode,
        mediaContainer,
        isCodecSupported,
        hasNextEpisode,
        hasPreviousEpisode,
        playNextEpisode,
        playPreviousEpisode,
        onPlayFile,
        handleTerminateStream,
        handleChangeStreamType,
        disabledAutoSwitchToDirectPlay,
    } = useMediastreamVideoCore({ episodes, mediaId })

    const episodeNumber = React.useMemo(() => {
        return episodes.find(ep => !!ep.localFile?.path && ep.localFile?.path === filePath)?.episodeNumber || -1
    }, [episodes, filePath])

    // progressNumber is the AniList-facing episode number (may differ from episodeNumber for specials/batches)
    const progressNumber = React.useMemo(() => {
        const ep = episodes.find(ep => !!ep.localFile?.path && ep.localFile?.path === filePath)
        return ep?.progressNumber ?? ep?.episodeNumber ?? -1
    }, [episodes, filePath])

    const progress = animeEntry?.listData?.progress

    /**
     * Effect for when media entry changes
     * - Redirect if media entry is not found
     * - Reset current progress
     */
    React.useEffect(() => {
        if (!mediaId || (!animeEntryLoading && !animeEntry) || (!animeEntryLoading && !!animeEntry && !filePath)) {
            router.push("/")
        }
    }, [mediaId, animeEntry, animeEntryLoading, filePath])

    if (animeEntryLoading || !animeEntry?.media) return <div className="px-4 lg:px-8 space-y-4">
        <div className="flex gap-4 items-center relative">
            <Skeleton className="h-12" />
        </div>
        <div
            className="grid 2xl:grid-cols-[1fr,450px] gap-4 xl:gap-4"
        >
            <div className="w-full min-h-[70dvh] relative">
                <Skeleton className="h-full w-full absolute" />
            </div>

            <Skeleton className="hidden 2xl:block relative h-[78dvh] overflow-y-auto pr-4 pt-0" />

        </div>
    </div>

    return (
        <SeaMediaPlayerProvider
            media={animeEntry?.media}
            progress={{
                currentProgress: progress ?? 0,
                currentEpisodeNumber: progressNumber === -1 ? null : progressNumber,
                currentEpisodeTitle: currentEpisode?.displayTitle || currentEpisode?.episodeTitle || null,
            }}
        >
            <AppLayoutStack className="px-4 pt-4 pb-0 lg:px-8 lg:pt-8 lg:pb-0 z-[5]">
                <SeaMediaPlayerLayout
                    mediaId={mediaId ? Number(mediaId) : undefined}
                    title={animeEntry?.media?.title?.userPreferred}
                    episodes={episodes}
                    rightHeaderActions={<>
                        <MediastreamPlaybackInfo
                            mediaContainer={mediaContainer}
                            isCodecSupported={isCodecSupported}
                            handleChangeStreamType={handleChangeStreamType}
                            disabledAutoSwitchToDirectPlay={disabledAutoSwitchToDirectPlay}
                        />
                    </>}
                    mediaPlayer={
                        <MediastreamVideoCore
                            lifecycleState={lifecycleState}
                            episode={currentEpisode}
                            hasNextEpisode={!!hasNextEpisode}
                            hasPreviousEpisode={!!hasPreviousEpisode}
                            playNextEpisode={playNextEpisode}
                            playPreviousEpisode={playPreviousEpisode}
                            handleTerminateStream={handleTerminateStream}
                            handleChangeStreamType={handleChangeStreamType}
                            currentStreamType={mediaContainer?.streamType}
                        />
                    }
                    episodeList={episodes.map((episode) => (
                        <EpisodeGridItem
                            key={episode.localFile?.path || ""}
                            id={`episode-${String(episode.episodeNumber)}`}
                            media={episode?.baseAnime as any}
                            title={episode?.displayTitle || episode?.baseAnime?.title?.romaji || ""}
                            image={episode?.episodeMetadata?.image || episode?.baseAnime?.coverImage?.large}
                            episodeTitle={episode?.episodeTitle}
                            fileName={episode?.localFile?.parsedInfo?.original}
                            onClick={() => {
                                if (episode.localFile?.path) {
                                    onPlayFile(episode.localFile?.path || "")
                                }
                            }}
                            description={episode?.episodeMetadata?.summary || episode?.episodeMetadata?.overview}
                            isWatched={!!progress && progress >= episode?.progressNumber}
                            isFiller={episode.episodeMetadata?.isFiller}
                            isSelected={episode.localFile?.path === filePath}
                            length={episode.episodeMetadata?.length}
                            className="flex-none w-full"
                            episodeNumber={episode.episodeNumber}
                            watchedProgress={progress}
                            progressNumber={episode.progressNumber}
                            action={<>
                                <MediaEpisodeInfoModal
                                    title={episode.displayTitle}
                                    image={episode.episodeMetadata?.image}
                                    episodeTitle={episode.episodeTitle}
                                    airDate={episode.episodeMetadata?.airDate}
                                    length={episode.episodeMetadata?.length}
                                    summary={episode.episodeMetadata?.summary || episode.episodeMetadata?.overview}
                                    isInvalid={episode.isInvalid}
                                    filename={episode.localFile?.parsedInfo?.original}
                                />

                                <PluginEpisodeGridItemMenuItems isDropdownMenu={true} type="mediastream" episode={episode} />
                            </>}
                        />
                    ))}
                />
            </AppLayoutStack>

            <MediaEntryPageSmallBanner bannerImage={animeEntry?.media?.bannerImage || animeEntry?.media?.coverImage?.extraLarge} />
        </SeaMediaPlayerProvider>
    )
}
