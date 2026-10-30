"use client"
import { AL_AnimeDetailsById_Media, Anime_Entry } from "@/api/generated/types"
import { CommentSection } from "@/app/(main)/_features/comment/comment-section"
import { MediaDetailsInfoSection, MediaDetailsStaffSection } from "@/app/(main)/_features/media/_components/media-details-sections"
import { MediaEntryCharactersSection } from "@/app/(main)/_features/media/_components/media-entry-characters-section"
import { MediaEntryDetailsTabs } from "@/app/(main)/_features/media/_components/media-entry-details-tabs"
import { AnimeThemesSection } from "@/app/(main)/entry/_components/anime-themes-section"
import { KitsuInfoSection } from "@/app/(main)/entry/_components/kitsu-info-section"
import { RelationsRecommendationsSection } from "@/app/(main)/entry/_components/relations-recommendations-section"
import React from "react"
import { LuInfo, LuLayers, LuMessageSquare, LuUsers } from "react-icons/lu"

/** Everything under the episode list, the same in every view of the anime page. */
export function AnimeEntryDetailsTabs({ entry, details }: { entry: Anime_Entry, details: AL_AnimeDetailsById_Media | undefined }) {
    return (
        <MediaEntryDetailsTabs
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    icon: <LuInfo />,
                    content: <>
                        <MediaDetailsInfoSection
                            mediaId={entry.mediaId}
                            type="anime"
                            genres={details?.genres}
                            nativeTitle={entry.media?.title?.native}
                        />
                        <AnimeThemesSection malId={entry.media?.idMal} />
                        <KitsuInfoSection malId={entry.media?.idMal} />
                    </>,
                },
                {
                    value: "cast",
                    label: "Cast & Staff",
                    icon: <LuUsers />,
                    content: <>
                        <MediaEntryCharactersSection details={details} />
                        <MediaDetailsStaffSection mediaId={entry.mediaId} />
                    </>,
                },
                {
                    value: "related",
                    label: "Related",
                    icon: <LuLayers />,
                    content: <RelationsRecommendationsSection entry={entry} details={details} />,
                },
                {
                    value: "discussion",
                    label: "Discussion",
                    icon: <LuMessageSquare />,
                    content: <CommentSection mediaId={entry.mediaId} mediaType="anime" />,
                },
            ]}
        />
    )
}
