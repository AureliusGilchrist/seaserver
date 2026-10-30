"use client"
import { AL_MangaDetailsById_Media, Manga_Entry } from "@/api/generated/types"
import { CommentSection } from "@/app/(main)/_features/comment/comment-section"
import { MediaDetailsInfoSection, MediaDetailsStaffSection } from "@/app/(main)/_features/media/_components/media-details-sections"
import { MediaEntryCharactersSection } from "@/app/(main)/_features/media/_components/media-entry-characters-section"
import { MediaEntryDetailsTabs } from "@/app/(main)/_features/media/_components/media-entry-details-tabs"
import { MangaRecommendations } from "@/app/(main)/manga/_components/manga-recommendations"
import React from "react"
import { LuInfo, LuLayers, LuMessageSquare, LuUsers } from "react-icons/lu"

/** Everything under the chapter list. */
export function MangaEntryDetailsTabs({ entry, details }: { entry: Manga_Entry, details: AL_MangaDetailsById_Media | undefined }) {
    return (
        <MediaEntryDetailsTabs
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    icon: <LuInfo />,
                    content: <MediaDetailsInfoSection
                        mediaId={entry.mediaId}
                        type="manga"
                        genres={details?.genres}
                        nativeTitle={entry.media?.title?.native}
                    />,
                },
                {
                    value: "cast",
                    label: "Characters & Staff",
                    icon: <LuUsers />,
                    content: <>
                        <MediaEntryCharactersSection details={details} isMangaPage />
                        <MediaDetailsStaffSection mediaId={entry.mediaId} />
                    </>,
                },
                {
                    value: "related",
                    label: "Related",
                    icon: <LuLayers />,
                    content: <MangaRecommendations entry={entry} details={details} />,
                },
                {
                    value: "discussion",
                    label: "Discussion",
                    icon: <LuMessageSquare />,
                    content: <CommentSection mediaId={entry.mediaId} mediaType="manga" />,
                },
            ]}
        />
    )
}
