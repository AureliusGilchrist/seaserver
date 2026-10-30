"use client"
import { AL_MangaDetailsById_Media, Manga_Entry } from "@/api/generated/types"
import {
    AnimeEntryRankings,
    MediaEntryAudienceScore,
    MediaEntryGenresList,
} from "@/app/(main)/_features/media/_components/media-entry-metadata-components"
import { MangaEntryStaff } from "@/app/(main)/_features/media/_components/manga-entry-staff"
import { MediaCreatorsLine } from "@/app/(main)/_features/media/_components/media-info-panel"
import { MediaMetaChips, MediaStatsRow } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { useGetMediaInfo } from "@/api/hooks/anilist.hooks"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
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
import { SeaLink } from "@/components/shared/sea-link"
import { IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Tooltip } from "@/components/ui/tooltip"
import { getCustomSourceExtensionId, getCustomSourceMediaSiteUrl, isCustomSource } from "@/lib/server/utils"
import { useThemeSettings } from "@/lib/theme/hooks"
import React from "react"
import { BiExtension } from "react-icons/bi"
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai"
import { LuExternalLink } from "react-icons/lu"
import { SiAnilist } from "react-icons/si"
import { PluginMangaPageButtons } from "../../_features/plugin/actions/plugin-actions"
import { useMangaFavorites } from "@/app/(main)/manga/_lib/use-manga-favorites"


export function MetaSection(props: { entry: Manga_Entry | undefined, details: AL_MangaDetailsById_Media | undefined }) {

    const { entry, details } = props
    const ts = useThemeSettings()
    const { isFavorite, toggleFavorite } = useMangaFavorites()
    const personal = usePersonalSettings()
    const { data: info } = useGetMediaInfo(entry?.mediaId)

    if (!entry?.media) return null

    const primaryTitle = entry.media?.title?.romaji
        || entry.media?.title?.english
        || entry.media?.title?.native

    // With the AniList staff known, "Story & art by …" is the short credit line; otherwise the
    // staff badges from the details query stand in for it.
    const hasCreatorsLine = !!info?.staff?.edges?.length

    return (
        <MediaPageHeader
            backgroundImage={entry.media?.bannerImage}
            coverImage={entry.media?.coverImage?.extraLarge || entry.media?.coverImage?.large}
        >

            <MediaPageHeaderDetailsContainer>

                <MediaPageHeaderEntryDetails
                    coverImage={entry.media?.coverImage?.extraLarge || entry.media?.coverImage?.large}
                    title={primaryTitle}
                    englishTitle={entry.media?.title?.english}
                    romajiTitle={entry.media?.title?.romaji}
                    startDate={entry.media?.startDate}
                    season={entry.media?.season}
                    color={entry.media?.coverImage?.color}
                    progressTotal={entry.media?.chapters}
                    status={entry.media?.status}
                    description={entry.media?.description}
                    listData={entry.listData}
                    media={entry.media}
                    type="manga"
                >
                    <div
                        data-manga-meta-section-details
                        className="flex flex-col gap-3 items-center lg:items-start lg:max-w-[65vw]"
                    >
                        <MediaMetaChips media={entry.media as any} info={info} type="manga" className="w-full" />

                        <MediaStatsRow info={info} meanScore={entry.media?.meanScore} hideScore={personal.hideAudienceScore} />

                        {hasCreatorsLine && <MediaCreatorsLine info={info} className="w-full" />}

                        <MediaEntryGenresList genres={details?.genres} type="manga" />

                        {/* Staff badges and rankings are folded away to keep the hero calm. */}
                        {((!hasCreatorsLine && !!details?.staff?.edges?.length) || !!details?.rankings?.length) &&
                            <MediaPageHeaderMoreDetails label={hasCreatorsLine ? "Rankings" : "Staff & rankings"}>
                                {!hasCreatorsLine && <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
                                    <MangaEntryStaff staff={details?.staff} />
                                </div>}
                                <AnimeEntryRankings rankings={details?.rankings} />
                            </MediaPageHeaderMoreDetails>}
                    </div>
                </MediaPageHeaderEntryDetails>

                <PluginWebviewSlot slot="after-media-entry-details" />

                <MediaPageHeaderActions
                    data-manga-meta-section-buttons-container
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
                                <SeaLink href={`https://anilist.co/manga/${entry.mediaId}`} target="_blank">
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
                    <ToWatchButton media={entry.media} mediaType="MANGA" />

                    <MediaSyncTrackButton mediaId={entry.mediaId} type="manga" size="md" />

                    <PluginMangaPageButtons media={entry.media} />
                </MediaPageHeaderActions>

            </MediaPageHeaderDetailsContainer>
        </MediaPageHeader>

    )

}
