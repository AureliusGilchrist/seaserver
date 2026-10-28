"use client"

import { useGetMediaInfo } from "@/api/hooks/anilist.hooks"
import { MediaInfoPanel, MediaStaffSection } from "@/app/(main)/_features/media/_components/media-info-panel"
import React from "react"

// The Information panel and the Staff strip as drop-in sections for a details page. Both read the
// same media-info query, so placing them apart costs one request.

export function MediaDetailsInfoSection({ mediaId, type, genres, nativeTitle, children }: {
    mediaId: number | undefined
    type: "anime" | "manga"
    genres?: (string | null | undefined)[] | null
    nativeTitle?: string | null
    children?: React.ReactNode
}) {
    const { data: info } = useGetMediaInfo(mediaId)
    return <MediaInfoPanel info={info} type={type} genres={genres} nativeTitle={nativeTitle}>{children}</MediaInfoPanel>
}

export function MediaDetailsStaffSection({ mediaId }: { mediaId: number | undefined }) {
    const { data: info } = useGetMediaInfo(mediaId)
    return <MediaStaffSection info={info} />
}
