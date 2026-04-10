"use client"

import { useGetAnilistStudioDetails } from "@/api/hooks/anilist.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useSearchParams } from "@/lib/navigation"
import React from "react"
import { LuArrowLeft } from "react-icons/lu"
import { SeaLink } from "@/components/shared/sea-link"

export default function Page() {
    const searchParams = useSearchParams()
    const id = Number(searchParams.get("id")) || 0

    const { data, isLoading } = useGetAnilistStudioDetails(id)

    if (isLoading) {
        return <PageWrapper className="p-8 flex justify-center"><LoadingSpinner /></PageWrapper>
    }

    if (!data?.Studio) {
        return <PageWrapper className="p-8 text-center text-[--muted]">Studio not found</PageWrapper>
    }

    const studio = data.Studio

    return (
        <PageWrapper className="p-4 sm:p-8 space-y-6">
            <div className="flex items-center gap-4">
                <SeaLink href="/" className="text-[--muted] hover:text-white transition">
                    <LuArrowLeft className="text-2xl" />
                </SeaLink>
                <h1 className="text-3xl font-bold">{studio.name}</h1>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {studio.media?.nodes?.map(media => (
                    <div key={media?.id} className="col-span-1">
                        <MediaEntryCard
                            media={media}
                            type="anime"
                            showLibraryBadge
                        />
                    </div>
                ))}
            </div>
        </PageWrapper>
    )
}
