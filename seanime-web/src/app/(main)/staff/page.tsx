"use client"

import { useGetAnilistStaffDetails } from "@/api/hooks/anilist.hooks"
import { AL_StaffDetails_Staff_StaffMedia_Edge_Node } from "@/api/generated/types"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Badge } from "@/components/ui/badge"
import { useSearchParams } from "@/lib/navigation"
import React, { useMemo } from "react"
import { LuArrowLeft } from "react-icons/lu"
import { SeaLink } from "@/components/shared/sea-link"

export default function Page() {
    const searchParams = useSearchParams()
    const id = Number(searchParams.get("id")) || 0

    const { data, isLoading } = useGetAnilistStaffDetails(id)

    const { animeWorks, mangaWorks } = useMemo(() => {
        const anime: AL_StaffDetails_Staff_StaffMedia_Edge_Node[] = []
        const manga: AL_StaffDetails_Staff_StaffMedia_Edge_Node[] = []
        const seen = new Set<number>()

        for (const edge of data?.Staff?.staffMedia?.edges ?? []) {
            const node = edge?.node
            if (!node || seen.has(node.id)) continue
            seen.add(node.id)
            if (node.type === "MANGA") {
                manga.push(node)
            } else {
                anime.push(node)
            }
        }
        return { animeWorks: anime, mangaWorks: manga }
    }, [data])

    if (isLoading) {
        return <PageWrapper className="p-8 flex justify-center"><LoadingSpinner /></PageWrapper>
    }

    if (!data?.Staff) {
        return <PageWrapper className="p-8 text-center text-[--muted]">Staff not found</PageWrapper>
    }

    const staff = data.Staff

    return (
        <PageWrapper className="p-4 sm:p-8 space-y-6">
            <div className="flex items-center gap-4">
                <SeaLink href="/" className="text-[--muted] hover:text-white transition">
                    <LuArrowLeft className="text-2xl" />
                </SeaLink>
            </div>

            <div className="flex gap-6 items-start">
                {staff.image?.large && (
                    <img
                        src={staff.image.large}
                        alt={staff.name?.full ?? ""}
                        className="w-32 h-44 object-cover rounded-lg flex-shrink-0"
                    />
                )}
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold">{staff.name?.full}</h1>
                    {staff.name?.native && (
                        <p className="text-[--muted] text-lg">{staff.name.native}</p>
                    )}
                    {staff.primaryOccupations && staff.primaryOccupations.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {staff.primaryOccupations.map((occ) => (
                                <Badge key={occ} intent="gray" size="sm">{occ}</Badge>
                            ))}
                        </div>
                    )}
                    {staff.description && (
                        <p className="text-sm text-[--muted] max-w-2xl line-clamp-4">{staff.description}</p>
                    )}
                </div>
            </div>

            {animeWorks.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Anime</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {animeWorks.map(media => (
                            <div key={media.id} className="col-span-1">
                                <MediaEntryCard
                                    media={media as any}
                                    type="anime"
                                    showLibraryBadge
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {mangaWorks.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Manga</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {mangaWorks.map(media => (
                            <div key={media.id} className="col-span-1">
                                <MediaEntryCard
                                    media={media as any}
                                    type="manga"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </PageWrapper>
    )
}
