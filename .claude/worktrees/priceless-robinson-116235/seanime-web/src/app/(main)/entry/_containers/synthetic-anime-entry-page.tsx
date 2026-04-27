"use client"
import { SyntheticAnime, getSyntheticAnimeSynonyms, getSyntheticAnimeTags, getSyntheticAnimeStudios } from "@/api/hooks/synthetic-anime.hooks"
import { MediaPageHeader, MediaPageHeaderDetailsContainer, MediaPageHeaderEntryDetails } from "@/app/(main)/_features/media/_components/media-page-header-components"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import { SeaLink } from "@/components/shared/sea-link"
import { IconButton } from "@/components/ui/button"
import React from "react"
import { LuSparkles, LuExternalLink } from "react-icons/lu"
import { SiMyanimelist } from "react-icons/si"
import capitalize from "lodash/capitalize"

type SyntheticAnimeEntryPageProps = {
    syntheticAnime: SyntheticAnime
}

export function SyntheticAnimeEntryPage({ syntheticAnime }: SyntheticAnimeEntryPageProps) {
    const synonyms = getSyntheticAnimeSynonyms(syntheticAnime)
    const tags = getSyntheticAnimeTags(syntheticAnime)
    const studios = getSyntheticAnimeStudios(syntheticAnime)

    // Parse sources to find external links
    const sources = React.useMemo(() => {
        try {
            return JSON.parse(syntheticAnime.sources || "[]") as string[]
        } catch {
            return []
        }
    }, [syntheticAnime.sources])

    const malUrl = sources.find(s => s.includes("myanimelist.net"))
    const anidbUrl = sources.find(s => s.includes("anidb.net"))
    const anilistUrl = sources.find(s => s.includes("anilist.co"))

    React.useLayoutEffect(() => {
        try {
            if (syntheticAnime?.title) {
                document.title = `${syntheticAnime.title} | Seanime`
            }
        } catch {}
    }, [syntheticAnime])

    return (
        <div data-synthetic-anime-entry-page>
            <MediaPageHeader
                backgroundImage={syntheticAnime.coverImage}
                coverImage={syntheticAnime.coverImage || syntheticAnime.thumbnail}
            >
                <MediaPageHeaderDetailsContainer>
                    <MediaPageHeaderEntryDetails
                        coverImage={syntheticAnime.coverImage || syntheticAnime.thumbnail}
                        title={syntheticAnime.title}
                        englishTitle={syntheticAnime.titleEnglish !== syntheticAnime.title ? syntheticAnime.titleEnglish : undefined}
                        romajiTitle={undefined}
                        startDate={syntheticAnime.seasonYear ? { year: syntheticAnime.seasonYear } : undefined}
                        season={syntheticAnime.season as any}
                        progressTotal={syntheticAnime.episodes}
                        status={syntheticAnime.status as any}
                        description={syntheticAnime.description}
                        listData={undefined}
                        media={null as any}
                        type="anime"
                    >
                        <div
                            data-synthetic-anime-meta-section-details
                            className={cn(
                                "flex gap-3 flex-wrap items-center",
                                "justify-center lg:justify-start lg:max-w-[65vw]",
                            )}
                        >
                            {/* Synthetic Badge */}
                            <Badge intent="warning" size="lg" className="gap-1.5">
                                <LuSparkles className="text-sm" />
                                Synthetic Anime
                            </Badge>

                            {/* Type Badge */}
                            {syntheticAnime.type && (
                                <Badge size="lg" intent="gray" className="rounded-full">
                                    {syntheticAnime.type}
                                </Badge>
                            )}

                            {/* Episodes */}
                            {syntheticAnime.episodes > 0 && (
                                <Badge size="lg" intent="gray" className="rounded-full">
                                    {syntheticAnime.episodes} episodes
                                </Badge>
                            )}

                            {/* Season */}
                            {syntheticAnime.season && syntheticAnime.seasonYear && (
                                <Badge size="lg" intent="gray" className="rounded-full">
                                    {capitalize(syntheticAnime.season)} {syntheticAnime.seasonYear}
                                </Badge>
                            )}

                            {/* Status */}
                            {syntheticAnime.status && (
                                <Badge 
                                    size="lg" 
                                    intent={syntheticAnime.status === "FINISHED" ? "success" : syntheticAnime.status === "ONGOING" ? "primary" : "gray"} 
                                    className="rounded-full"
                                >
                                    {capitalize(syntheticAnime.status)}
                                </Badge>
                            )}

                            {/* Studios */}
                            {studios.length > 0 && (
                                <Badge size="lg" intent="gray" className="rounded-full">
                                    {studios.slice(0, 2).map(s => capitalize(s)).join(", ")}
                                </Badge>
                            )}
                        </div>
                    </MediaPageHeaderEntryDetails>

                    {/* External Links */}
                    <div
                        data-synthetic-anime-meta-section-buttons-container
                        className={cn(
                            "flex flex-row w-full gap-3 items-center justify-center lg:justify-start lg:max-w-[65vw]",
                            "flex-wrap",
                        )}
                    >
                        {malUrl && (
                            <SeaLink href={malUrl} target="_blank">
                                <IconButton size="sm" intent="gray-link" className="px-0" icon={<SiMyanimelist className="text-lg" />} />
                            </SeaLink>
                        )}
                        {anilistUrl && (
                            <SeaLink href={anilistUrl} target="_blank">
                                <IconButton size="sm" intent="gray-link" className="px-0" icon={<LuExternalLink className="text-lg" />} />
                            </SeaLink>
                        )}
                        {anidbUrl && (
                            <SeaLink href={anidbUrl} target="_blank">
                                <IconButton size="sm" intent="gray-link" className="px-0" icon={<LuExternalLink className="text-lg" />} />
                            </SeaLink>
                        )}
                    </div>

                </MediaPageHeaderDetailsContainer>
            </MediaPageHeader>

            <div
                data-synthetic-anime-entry-page-content-container
                className="px-4 md:px-8 relative z-[8]"
            >
                <PageWrapper
                    data-synthetic-anime-entry-page-content
                    className="relative 2xl:order-first pb-10 lg:min-h-[calc(100vh-10rem)]"
                    {...{
                        initial: { opacity: 0, y: 20 },
                        animate: { opacity: 1, y: 0 },
                        exit: { opacity: 0, y: 20 },
                        transition: {
                            type: "spring",
                            damping: 12,
                            stiffness: 80,
                            delay: 0.5,
                        },
                    }}
                >
                    <div className="h-10" />

                    {/* Synonyms Section */}
                    {synonyms.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold mb-3">Alternative Titles</h3>
                            <div className="flex flex-wrap gap-2">
                                {synonyms.slice(0, 10).map((syn, i) => (
                                    <Badge key={i} size="md" intent="gray" className="rounded-md">
                                        {syn}
                                    </Badge>
                                ))}
                                {synonyms.length > 10 && (
                                    <Badge size="md" intent="gray" className="rounded-md">
                                        +{synonyms.length - 10} more
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tags Section */}
                    {tags.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold mb-3">Tags</h3>
                            <div className="flex flex-wrap gap-2">
                                {tags.slice(0, 20).map((tag, i) => (
                                    <Badge key={i} size="sm" intent="gray" className="rounded-md">
                                        {tag}
                                    </Badge>
                                ))}
                                {tags.length > 20 && (
                                    <Badge size="sm" intent="gray" className="rounded-md">
                                        +{tags.length - 20} more
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Info Notice */}
                    <div className="mt-8 p-4 rounded-lg bg-[--subtle] border border-[--border]">
                        <div className="flex items-start gap-3">
                            <LuSparkles className="text-[--warning] text-xl mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-[--warning]">Synthetic Anime Entry</h4>
                                <p className="text-sm text-[--muted] mt-1">
                                    This anime entry was imported from the anime-offline-database and may not have a corresponding AniList entry.
                                    Some features like progress tracking and list management may not be available.
                                </p>
                            </div>
                        </div>
                    </div>

                </PageWrapper>
            </div>
        </div>
    )
}
