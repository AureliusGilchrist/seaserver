"use client"
import { useQuery } from "@tanstack/react-query"

type VolumeCoverMedia = {
    title?: { romaji?: string | null, english?: string | null, userPreferred?: string | null } | null
    coverImage?: { extraLarge?: string | null, large?: string | null, medium?: string | null } | null
} | null | undefined

const API = "https://api.mangadex.org"

async function fetchVolumeOneCover(title: string): Promise<string | null> {
    const search = await fetch(`${API}/manga?title=${encodeURIComponent(title)}&limit=1&order[relevance]=desc`)
    if (!search.ok) return null
    const id = ((await search.json()) as any)?.data?.[0]?.id as string | undefined
    if (!id) return null

    const covers = await fetch(`${API}/cover?manga[]=${id}&limit=100&order[volume]=asc`)
    if (!covers.ok) return null
    const list = (((await covers.json()) as any)?.data ?? []) as { attributes?: { volume?: string | null, fileName?: string } }[]
    const pick = list.find(c => c.attributes?.volume === "1") ?? list.find(c => !!c.attributes?.fileName)
    const file = pick?.attributes?.fileName
    return file ? `https://uploads.mangadex.org/covers/${id}/${file}.512.jpg` : null
}

/** The volume 1 cover of a manga (portrait), falling back to the AniList cover. */
export function useMangaVolumeCover(media: VolumeCoverMedia): string | null {
    const title = media?.title?.english || media?.title?.romaji || media?.title?.userPreferred || ""
    const { data } = useQuery({
        queryKey: ["manga-volume-1-cover", title],
        queryFn: () => fetchVolumeOneCover(title),
        enabled: !!title,
        staleTime: Infinity,
        gcTime: 7 * 24 * 60 * 60 * 1000,
        retry: false,
    })
    return data || media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || null
}
