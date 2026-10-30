"use client"
import { AL_AnimeDetailsById_Media, Anime_Entry } from "@/api/generated/types"
import { TrailerModal } from "@/app/(main)/_features/anime/_components/trailer-modal"
import { AnimeAutoDownloaderButton } from "@/app/(main)/_features/anime/_containers/anime-auto-downloader-button"
import { ToggleLockFilesButton } from "@/app/(main)/_features/anime/_containers/toggle-lock-files-button"
import { AnimeDownloadingBadge } from "@/app/(main)/_features/media/_components/anime-downloading-badge"
import { AnimeEntryStudio } from "@/app/(main)/_features/media/_components/anime-entry-studio"
import { MediaCreatorsLine, MediaStudiosLine } from "@/app/(main)/_features/media/_components/media-info-panel"
import { MediaMetaChips, MediaStatsRow } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { useGetMediaInfo } from "@/api/hooks/anilist.hooks"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import {
    AnimeEntryRankings,
    MediaEntryAudienceScore,
    MediaEntryGenresList,
} from "@/app/(main)/_features/media/_components/media-entry-metadata-components"
import {
    MediaPageHeader,
    MediaPageHeaderActions,
    MediaPageHeaderDetailsContainer,
    MediaPageHeaderEntryDetails,
    MediaPageHeaderMoreDetails,
} from "@/app/(main)/_features/media/_components/media-page-header-components"
import { MediaSyncTrackButton } from "@/app/(main)/_features/media/_containers/media-sync-track-button"
import { ToWatchButton } from "@/app/(main)/_features/media/_components/to-watch-button"
import { PluginWebviewSlot } from "@/app/(main)/_features/plugin/webview/plugin-webviews"
import { useHasDebridService, useHasTorrentProvider, useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { NextAiringEpisode } from "@/app/(main)/entry/_components/next-airing-episode"
import { EntrySectionTabs, useAnimeEntryPageView } from "@/app/(main)/entry/_containers/anime-entry-page"
import { AnimeEntryDropdownMenu } from "@/app/(main)/entry/_containers/entry-actions/anime-entry-dropdown-menu"
import { AnimeEntrySilenceToggle } from "@/app/(main)/entry/_containers/entry-actions/anime-entry-silence-toggle"
import { EnqueueFutureButton } from "@/app/(main)/entry/_containers/enqueue-future/enqueue-future-button"
import { TorrentSearchButton } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-button"
import { SeaLink } from "@/components/shared/sea-link"
import { Badge } from "@/components/ui/badge"
import { Button, ButtonProps, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Tooltip } from "@/components/ui/tooltip"
import { TORRENT_CLIENT } from "@/lib/server/settings"
import { getCustomSourceExtensionId, getCustomSourceMediaSiteUrl, isCustomSource } from "@/lib/server/utils"
import { useThemeSettings } from "@/lib/theme/hooks"
import React from "react"
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai"
import { BiExtension } from "react-icons/bi"
import { IoInformationCircle } from "react-icons/io5"
import { LuExternalLink } from "react-icons/lu"
import { MdOutlineConnectWithoutContact } from "react-icons/md"
import { SiAnilist } from "react-icons/si"
import { displayTitle } from "@/lib/helpers/media"
import { useNakamaStatus } from "../../_features/nakama/nakama-manager"
import { PluginAnimePageButtons } from "../../_features/plugin/actions/plugin-actions"
import { useAnimeFavorites } from "../../(library)/_lib/use-anime-favorites"

export function AnimeMetaActionButton({ className, ...rest }: ButtonProps) {
    const ts = useThemeSettings()
    return <Button
        className={cn(
            "w-full",
            "lg:w-full lg:max-w-[280px]",
            className,
        )}
        {...rest}
        // intent="gray-outline"
    />
}

export function MetaSection(props: { entry: Anime_Entry, details: AL_AnimeDetailsById_Media | undefined }) {
    const serverStatus = useServerStatus()
    const { entry, details } = props
    const ts = useThemeSettings()
    const nakamaStatus = useNakamaStatus()
    const { isFavorite, toggleFavorite } = useAnimeFavorites()
    const personal = usePersonalSettings()
    const { data: info } = useGetMediaInfo(entry.mediaId)

    if (!entry.media) return null

    const { hasTorrentProvider } = useHasTorrentProvider()
    const { hasDebridService } = useHasDebridService()
    const { currentView, setView, isLibraryView, isTorrentStreamingView, isDebridStreamingView, isOnlineStreamingView } = useAnimeEntryPageView()

    const listData = entry.listData
    const type = "anime"

    const primaryTitle = displayTitle(entry.media?.title)
        || entry.media?.title?.native

    return (
        <>
            <MediaPageHeader
                backgroundImage={entry.media?.bannerImage}
                coverImage={entry.media?.coverImage?.extraLarge || entry.media?.coverImage?.large}
            >

            <MediaPageHeaderDetailsContainer>

                <MediaPageHeaderEntryDetails
                    coverImage={entry.media?.coverImage?.extraLarge || entry.media?.coverImage?.large}
                    title={primaryTitle}
                    color={entry.media?.coverImage?.color}
                    englishTitle={entry.media?.title?.english}
                    romajiTitle={entry.media?.title?.romaji}
                    startDate={entry.media?.startDate}
                    season={entry.media?.season}
                    progressTotal={entry.media?.episodes}
                    status={entry.media?.status}
                    description={entry.media?.description}
                    listData={entry.listData}
                    media={entry.media}
                    type="anime"
                >
                    <div
                        data-anime-meta-section-details
                        className={cn(
                            "flex flex-col gap-3 items-center lg:items-start",
                            "lg:max-w-[65vw]",
                        )}
                    >

                        <MediaMetaChips media={entry.media as any} info={info} type="anime" className="w-full" />

                        <div className="flex flex-wrap gap-2 items-center justify-center lg:justify-start" data-anime-meta-section-stats>
                            <MediaStatsRow info={info} meanScore={entry.media?.meanScore} hideScore={personal.hideAudienceScore} />
                            <AnimeDownloadingBadge mediaId={entry.mediaId} size="lg" />
                        </div>

                        {!isCustomSource(entry.mediaId) ? (info?.studios?.edges?.length
                            ? <MediaStudiosLine info={info} className="w-full" />
                            : <AnimeEntryStudio studios={details?.studios} />) : (
                            <Badge
                                size="lg"
                                intent="gray"
                                className="rounded-full px-0 border-transparent bg-transparent transition-all hover:bg-transparent hover:text-white hover:-translate-y-0.5"
                                data-anime-entry-studio-badge
                            >
                                {details?.studios?.nodes?.[0]?.name}
                            </Badge>
                        )}

                        <MediaEntryGenresList genres={details?.genres} />

                        {/* Credits and rankings are folded away to keep the hero calm. */}
                        {(!!info?.staff?.edges?.length || !!details?.rankings?.length) && <MediaPageHeaderMoreDetails label="Credits & rankings">
                            <MediaCreatorsLine info={info} className="w-full" />
                            <div
                                data-anime-meta-section-rankings-container
                                className={cn(
                                    "w-full",
                                )}
                            >
                                <AnimeEntryRankings rankings={details?.rankings} />
                            </div>
                        </MediaPageHeaderMoreDetails>}

                    </div>
                </MediaPageHeaderEntryDetails>

                <PluginWebviewSlot slot="after-media-entry-details" />

                <MediaPageHeaderActions
                    data-anime-meta-section-buttons-container
                    links={<>
                        {isCustomSource(entry.mediaId) && (
                            <Tooltip
                                trigger={<div>
                                    <SeaLink href={`/custom-sources?provider=${getCustomSourceExtensionId(entry.media)}`}>
                                        <IconButton size="sm" intent="gray-link" className="px-0" icon={<BiExtension className="text-lg" />} />
                                    </SeaLink>
                                </div>}
                            >
                                Custom source
                            </Tooltip>
                        )}

                        {!isCustomSource(entry.mediaId) && <Tooltip
                            trigger={<div>
                                <SeaLink href={`https://anilist.co/anime/${entry.mediaId}`} target="_blank">
                                    <IconButton size="sm" intent="gray-link" className="px-0" icon={<SiAnilist className="text-lg" />} />
                                </SeaLink>
                            </div>}
                        >
                            Open on AniList
                        </Tooltip>}

                        {isCustomSource(entry.mediaId) && !!getCustomSourceMediaSiteUrl(entry.media) && <Tooltip
                            trigger={<div>
                                <SeaLink href={getCustomSourceMediaSiteUrl(entry.media)!} target="_blank">
                                    <IconButton size="sm" intent="gray-link" className="px-0" icon={<LuExternalLink className="text-lg" />} />
                                </SeaLink>
                            </div>}
                        >
                            Open in website
                        </Tooltip>}

                        {!!entry?.media?.trailer?.id && <TrailerModal
                            trailerId={entry?.media?.trailer?.id} trigger={
                            <Button size="sm" intent="gray-link" className="px-0">
                                Trailer
                            </Button>}
                        />}

                        <Tooltip trigger={
                            <IconButton
                                size="sm"
                                intent="gray-link"
                                className="px-0"
                                icon={isFavorite(entry.mediaId)
                                    ? <AiFillHeart className="text-lg text-red-500" />
                                    : <AiOutlineHeart className="text-lg" />
                                }
                                onClick={() => toggleFavorite(entry.mediaId)}
                            />
                        }>
                            {isFavorite(entry.mediaId) ? "Remove from favorites" : "Add to favorites"}
                        </Tooltip>
                    </>}
                >

                    {/* The button the to-watch list is built from, near the front of the row — it
                        is the only place the list is added to, so it has to be findable. The
                        studio rides along, since the snapshot's row shows it. */}
                    <ToWatchButton media={entry.media!} studios={details?.studios?.nodes?.[0]?.name} />

                    {(
                        entry.media.status !== "NOT_YET_RELEASED"
                        && (
                            serverStatus?.settings?.torrent?.defaultTorrentClient !== TORRENT_CLIENT.NONE
                            || hasDebridService
                        )
                        && !entry._isNakamaEntry
                    ) && (
                        <TorrentSearchButton
                            entry={entry}
                            onClick={() => {
                                if (currentView !== "library") setView("library")
                            }}
                        />
                    )}

                    {(
                        entry.media.status !== "NOT_YET_RELEASED"
                        && serverStatus?.settings?.torrent?.defaultTorrentClient !== TORRENT_CLIENT.NONE
                        && !entry._isNakamaEntry
                    ) && (
                        <EnqueueFutureButton entry={entry} details={details} />
                    )}

                    <AnimeAutoDownloaderButton entry={entry} size="md" />

                    {isLibraryView && !entry._isNakamaEntry && !!entry.libraryData && <>
                        <MediaSyncTrackButton mediaId={entry.mediaId} type="anime" size="md" />
                        <AnimeEntrySilenceToggle mediaId={entry.mediaId} size="md" />
                        <ToggleLockFilesButton
                            allFilesLocked={entry.libraryData.allFilesLocked}
                            mediaId={entry.mediaId}
                            size="md"
                        />
                    </>}

                    <AnimeEntryDropdownMenu entry={entry} details={details} />

                    {entry._isNakamaEntry && currentView === "library" &&
                        <div className="flex items-center gap-2 h-10 px-4 rounded-full bg-black/25 ring-1 ring-white/10 backdrop-blur-md flex-none">
                            <MdOutlineConnectWithoutContact className="size-6 animate-pulse text-[--blue]" />
                            <span className="text-sm tracking-wide">Shared by {nakamaStatus?.hostConnectionStatus?.username}</span>
                        </div>}

                    <PluginAnimePageButtons media={entry.media!} />

                </MediaPageHeaderActions>

                <EntrySectionTabs entry={entry} />

                <NextAiringEpisode media={entry.media} />

                {entry.downloadInfo?.hasInaccurateSchedule && <p
                    className={cn(
                        "text-[--muted] text-sm text-center mb-3",
                        "text-left",
                    )}
                    data-anime-meta-section-inaccurate-schedule-message
                >
                    <span className="block">Could not retrieve accurate scheduling information for this show.</span>
                    <span className="block text-[--muted]">Please check the schedule online for more information.</span>
                </p>}


                {(!entry.anidbId || entry.anidbId === 0) && !isCustomSource(entry.mediaId) && entry.media?.status !== "NOT_YET_RELEASED" && (
                    <p
                        className={cn(
                            "text-center text-gray-200 opacity-50 text-sm flex gap-1 items-center",
                            "text-left",
                        )}
                        data-anime-meta-section-no-metadata-message
                    >
                        <IoInformationCircle />
                        Episode metadata retrieval not available for this entry.
                    </p>
                )}


            </MediaPageHeaderDetailsContainer>

        </MediaPageHeader>

        </>
    )

}
