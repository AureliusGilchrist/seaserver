import { useGetAnimeCollection } from "@/api/hooks/anilist.hooks"
import { EpisodeCard } from "@/app/(main)/_features/anime/_components/episode-card"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { useRouter } from "@/lib/navigation"
import React from "react"
import { IoPlayCircleOutline } from "react-icons/io5"

/**
 * @description
 * Episodes that have already aired for anime in the user's "Currently watching" list
 * but are past their AniList progress.
 */
export function UnwatchedEpisodes() {
    const serverStatus = useServerStatus()
    const router = useRouter()

    const { data: animeCollection } = useGetAnimeCollection()

    const items = React.useMemo(() => {
        const entries = animeCollection?.MediaListCollection?.lists
            ?.filter(list => list.status === "CURRENT" || list.status === "REPEATING")
            .flatMap(list => list.entries ?? []) ?? []

        const seen = new Set<number>()
        const ret = entries.flatMap(entry => {
            const media = entry?.media
            if (!media || seen.has(media.id)) return []
            seen.add(media.id)
            if (media.isAdult && !serverStatus?.settings?.anilist?.enableAdultContent) return []

            // Number of episodes that have aired so far
            let aired: number | undefined
            if (media.nextAiringEpisode?.episode) {
                aired = media.nextAiringEpisode.episode - 1
            } else if (media.status === "FINISHED") {
                aired = media.episodes
            }
            const progress = entry.progress ?? 0
            if (!aired || aired <= progress) return []

            return [{
                media,
                nextEpisode: progress + 1,
                unwatched: aired - progress,
                // Still-airing shows first, the one that aired most recently on top
                sortKey: media.nextAiringEpisode ? -media.nextAiringEpisode.timeUntilAiring : Number.MIN_SAFE_INTEGER,
            }]
        })

        return ret.sort((a, b) => b.sortKey - a.sortKey)
    }, [animeCollection, serverStatus?.settings?.anilist?.enableAdultContent])

    if (!items.length) return null

    return (
        <AppLayoutStack>
            <div>
                <h2 className="flex gap-3 items-center"><IoPlayCircleOutline /> Aired, not watched yet</h2>
                <p className="text-[--muted]">From your currently watching list</p>
            </div>

            <Carousel
                className="w-full max-w-full"
                gap="md"
                opts={{
                    align: "start",
                }}
                autoScroll
            >
                <CarouselDotButtons />
                <CarouselContent>
                    {items.map(({ media, nextEpisode, unwatched }) => (
                        <CarouselItem
                            key={media.id}
                            className="md:basis-1/2 lg:basis-1/3 2xl:basis-1/4 min-[2000px]:basis-1/5"
                        >
                            <EpisodeCard
                                image={media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large}
                                topTitle={media.title?.userPreferred}
                                title={`Episode ${nextEpisode}`}
                                meta={unwatched > 1 ? `${unwatched} episodes to watch` : "1 episode to watch"}
                                actionIcon={null}
                                onClick={() => {
                                    router.push(`/entry?id=${media.id}`)
                                }}
                                anime={{
                                    id: media.id,
                                    image: media.coverImage?.large,
                                    title: media.title?.userPreferred,
                                }}
                            />
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>
        </AppLayoutStack>
    )
}
