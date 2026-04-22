"use client"

import { useGetAnilistCharacterDetails } from "@/api/hooks/anilist.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Badge } from "@/components/ui/badge"
import { usePathname, useSearchParams } from "@/lib/navigation"
import React, { useMemo } from "react"
import { LuArrowLeft, LuHeart } from "react-icons/lu"
import { SeaLink } from "@/components/shared/sea-link"

export default function Page() {
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const idFromQuery = Number(searchParams.get("id"))
    const idFromPath = useMemo(() => {
        const match = pathname.match(/\/character\/(\d+)$/)
        if (!match) return 0
        return Number(match[1]) || 0
    }, [pathname])
    const id = idFromQuery || idFromPath || 0

    const { data, isLoading } = useGetAnilistCharacterDetails(id)

    const { animeAppearances, mangaAppearances } = useMemo(() => {
        const anime: any[] = []
        const manga: any[] = []
        const seen = new Set<number>()

        for (const edge of data?.media?.edges ?? []) {
            const node = edge?.node
            if (!node || seen.has(node.id)) continue
            seen.add(node.id)
            if (node.type === "MANGA") {
                manga.push({ ...node, _role: edge.characterRole, _voiceActors: edge.voiceActors })
            } else {
                anime.push({ ...node, _role: edge.characterRole, _voiceActors: edge.voiceActors })
            }
        }
        return { animeAppearances: anime, mangaAppearances: manga }
    }, [data])

    if (isLoading) {
        return <PageWrapper className="p-8 flex justify-center"><LoadingSpinner /></PageWrapper>
    }

    if (!data) {
        return <PageWrapper className="p-8 text-center text-[--muted]">Character not found</PageWrapper>
    }

    const dob = data.dateOfBirth
    const dobStr = dob && (dob.month || dob.day || dob.year)
        ? [dob.month && `${dob.month}`, dob.day && `${dob.day}`, dob.year && `${dob.year}`].filter(Boolean).join("/")
        : null

    // Collect unique voice actors across all edges
    const voiceActors = useMemo(() => {
        const seen = new Set<number>()
        const vas: any[] = []
        for (const edge of data?.media?.edges ?? []) {
            for (const va of edge?.voiceActors ?? []) {
                if (va && !seen.has(va.id)) {
                    seen.add(va.id)
                    vas.push(va)
                }
            }
        }
        return vas
    }, [data])

    const bgImage = data.image?.large

    return (
        <PageWrapper className="p-4 sm:p-8 space-y-6">
            {bgImage && (
                <div
                    aria-hidden
                    style={{
                        position: "fixed", inset: 0, zIndex: 0,
                        backgroundImage: `url(${bgImage})`,
                        backgroundSize: "cover", backgroundPosition: "center top",
                        opacity: 0.12, filter: "blur(28px)", pointerEvents: "none",
                        transform: "scale(1.05)",
                    }}
                />
            )}
            <div className="relative z-[1] flex items-center gap-4">
                <SeaLink href="/" className="text-[--muted] hover:text-white transition">
                    <LuArrowLeft className="text-2xl" />
                </SeaLink>
            </div>

            <div className="flex gap-6 items-start">
                {data.image?.large && (
                    <img
                        src={data.image.large}
                        alt={data.name?.full ?? ""}
                        className="w-32 h-44 object-cover rounded-lg flex-shrink-0"
                    />
                )}
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold">{data.name?.full}</h1>
                    {data.name?.native && (
                        <p className="text-[--muted] text-lg">{data.name.native}</p>
                    )}
                    {data.name?.alternative?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {data.name.alternative.map((alt: string) => (
                                <Badge key={alt} intent="gray" size="sm">{alt}</Badge>
                            ))}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm text-[--muted]">
                        {data.gender && <span>Gender: {data.gender}</span>}
                        {data.age && <span>Age: {data.age}</span>}
                        {dobStr && <span>Birthday: {dobStr}</span>}
                        {data.favourites > 0 && (
                            <span className="flex items-center gap-1">
                                <LuHeart className="text-red-400" /> {data.favourites.toLocaleString()}
                            </span>
                        )}
                    </div>
                    {data.description && (
                        <p className="text-sm text-[--muted] max-w-2xl whitespace-pre-line">{data.description}</p>
                    )}
                </div>
            </div>

            {voiceActors.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Voice Actors</h2>
                    <div className="flex flex-wrap gap-4">
                        {voiceActors.map((va: any) => (
                            <SeaLink key={va.id} href={`/staff?id=${va.id}`} className="flex items-center gap-3 bg-gray-900 rounded-lg p-3 hover:bg-gray-800 transition">
                                {va.image?.large && (
                                    <img src={va.image.large} alt={va.name?.full ?? ""} className="w-12 h-12 object-cover rounded-full" />
                                )}
                                <div>
                                    <p className="text-sm font-medium">{va.name?.full}</p>
                                    {va.name?.native && <p className="text-xs text-[--muted]">{va.name.native}</p>}
                                    {va.languageV2 && <p className="text-xs text-[--muted]">{va.languageV2}</p>}
                                </div>
                            </SeaLink>
                        ))}
                    </div>
                </div>
            )}

            {animeAppearances.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Anime Appearances</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {animeAppearances.map((media: any) => (
                            <div key={media.id} className="col-span-1">
                                <MediaEntryCard
                                    media={media}
                                    type="anime"
                                    showLibraryBadge
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {mangaAppearances.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Manga Appearances</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {mangaAppearances.map((media: any) => (
                            <div key={media.id} className="col-span-1">
                                <MediaEntryCard
                                    media={media}
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
