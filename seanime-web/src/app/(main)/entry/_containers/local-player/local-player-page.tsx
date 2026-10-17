import { Anime_Entry } from "@/api/generated/types"
import { EpisodeGridItem } from "@/app/(main)/_features/anime/_components/episode-grid-item"
import { MediaEpisodeInfoModal } from "@/app/(main)/_features/media/_components/media-episode-info-modal"
import { SeaMediaPlayerProvider } from "@/app/(main)/_features/sea-media-player/sea-media-player-provider"
import { VideoCoreInlineLayout } from "@/app/(main)/_features/video-core/video-core-inline-helpers"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { MediastreamVideoCore } from "@/app/(main)/mediastream/_lib/mediastream-videocore"
import { MediastreamPlaybackInfo } from "@/app/(main)/mediastream/_lib/mediastream-playback-info"
import { useMediastreamActiveOnDevice, useMediastreamCurrentFile } from "@/app/(main)/mediastream/_lib/mediastream.atoms"
import { useMediastreamVideoCore } from "@/app/(main)/mediastream/_lib/use-mediastream-videocore"
import { Alert } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { PluginEpisodeGridItemMenuItems } from "@/app/(main)/_features/plugin/actions/plugin-actions"
import React from "react"

type LocalEpisodes = NonNullable<Anime_Entry["episodes"]>

type LocalPlayerPageProps = {
    entry: Anime_Entry | undefined
    entryLoading?: boolean
}

function useLocalEpisodes(entry: Anime_Entry | undefined): LocalEpisodes {
    return React.useMemo(() => {
        const all = entry?.episodes ?? []
        return [
            ...all.filter(ep => ep.type === "main"),
            ...all.filter(ep => ep.type === "special"),
            ...all.filter(ep => ep.type === "nc"),
        ].filter(ep => !!ep.localFile?.path)
    }, [entry?.episodes])
}

export function LocalPlayerPage({ entry, entryLoading }: LocalPlayerPageProps) {
    const serverStatus = useServerStatus()
    const { activeOnDevice } = useMediastreamActiveOnDevice()
    const { filePath, setFilePath } = useMediastreamCurrentFile()
    const episodes = useLocalEpisodes(entry)

    const hasCurrentFile = !!filePath && episodes.some(ep => ep.localFile?.path === filePath)
    const playerAvailable = !!serverStatus?.mediastreamSettings?.transcodeEnabled && !!activeOnDevice

    if (!entry?.media || entryLoading) return <Skeleton className="w-full aspect-video" />

    if (!playerAvailable) {
        return <Alert
            intent="warning"
            title="Local Player unavailable"
            description="Enable media streaming in the settings and activate it on this device to play local files here."
        />
    }

    if (episodes.length === 0) {
        return <Alert intent="info" description="No local files found for this anime." />
    }

    if (hasCurrentFile) {
        return <LocalPlayerActive entry={entry} episodes={episodes} />
    }

    return (
        <VideoCoreInlineLayout
            mediaId={entry.mediaId}
            title={entry.media.title?.userPreferred}
            hideBackButton
            currentEpisodeNumber={null}
            episodes={episodes}
            mediaPlayer={
                <div className="w-full h-full flex items-center justify-center bg-black rounded-md text-[--muted]">
                    Select a local episode to start playing
                </div>
            }
            episodeList={<LocalEpisodeList episodes={episodes} entry={entry} onPlay={setFilePath} />}
        />
    )
}

function LocalPlayerActive({ entry, episodes }: { entry: Anime_Entry, episodes: LocalEpisodes }) {
    const { filePath } = useMediastreamCurrentFile()

    const {
        lifecycleState,
        episode: currentEpisode,
        hasNextEpisode,
        hasPreviousEpisode,
        playNextEpisode,
        playPreviousEpisode,
        onPlayFile,
        handleTerminateStream,
        handleChangeStreamType,
        mediaContainer,
        isCodecSupported,
        disabledAutoSwitchToDirectPlay,
    } = useMediastreamVideoCore({ episodes, mediaId: entry.mediaId })

    // progressNumber is the AniList-facing number (may differ from episodeNumber for specials/batches)
    const progressNumber = currentEpisode?.progressNumber ?? currentEpisode?.episodeNumber ?? null

    return (
        <SeaMediaPlayerProvider
            media={entry.media!}
            progress={{
                currentProgress: entry.listData?.progress ?? 0,
                currentEpisodeNumber: progressNumber,
                currentEpisodeTitle: currentEpisode?.displayTitle || currentEpisode?.episodeTitle || null,
            }}
        >
            <VideoCoreInlineLayout
                mediaId={entry.mediaId}
                title={entry.media?.title?.userPreferred}
                hideBackButton
                currentEpisodeNumber={currentEpisode?.episodeNumber ?? null}
                episodes={episodes}
                rightHeaderActions={
                    <MediastreamPlaybackInfo
                        mediaContainer={mediaContainer}
                        isCodecSupported={isCodecSupported}
                        handleChangeStreamType={handleChangeStreamType}
                        disabledAutoSwitchToDirectPlay={disabledAutoSwitchToDirectPlay}
                    />
                }
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
                episodeList={<LocalEpisodeList episodes={episodes} entry={entry} selectedPath={filePath} onPlay={onPlayFile} />}
            />
        </SeaMediaPlayerProvider>
    )
}

type LocalEpisodeListProps = {
    entry: Anime_Entry
    episodes: LocalEpisodes
    selectedPath?: string
    onPlay: (path: string) => void
}

function LocalEpisodeList({ entry, episodes, selectedPath, onPlay }: LocalEpisodeListProps) {
    const progress = entry.listData?.progress

    return <>
        {episodes.map(episode => (
            <EpisodeGridItem
                key={episode.localFile?.path || ""}
                id={`episode-${String(episode.episodeNumber)}`}
                media={episode?.baseAnime as any}
                title={episode?.displayTitle || episode?.baseAnime?.title?.romaji || ""}
                image={episode?.episodeMetadata?.image || episode?.baseAnime?.coverImage?.large}
                episodeTitle={episode?.episodeTitle}
                fileName={episode?.localFile?.parsedInfo?.original}
                onClick={() => {
                    if (episode.localFile?.path) onPlay(episode.localFile.path)
                }}
                description={episode?.episodeMetadata?.summary || episode?.episodeMetadata?.overview}
                isWatched={!!progress && progress >= episode?.progressNumber}
                isFiller={episode.episodeMetadata?.isFiller}
                isSelected={!!selectedPath && episode.localFile?.path === selectedPath}
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
    </>
}
