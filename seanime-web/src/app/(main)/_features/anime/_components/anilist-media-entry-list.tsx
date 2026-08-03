import { AL_AnimeCollection_MediaListCollection_Lists, AL_AnimeCollection_MediaListCollection_Lists_Entries } from "@/api/generated/types"
import { MediaCardLazyGrid } from "@/app/(main)/_features/media/_components/media-card-grid"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { Button } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselDotButtons } from "@/components/ui/carousel"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuChevronDown, LuChevronUp } from "react-icons/lu"

// Number of cards shown before a collapsible list is truncated.
const COLLAPSED_ITEM_COUNT = 12


type AnilistAnimeEntryListProps = {
    list: AL_AnimeCollection_MediaListCollection_Lists | undefined
    type: "anime" | "manga"
    layout?: "grid" | "carousel"
    /**
     * Truncate the grid to {@link COLLAPSED_ITEM_COUNT} items with a "Show more" toggle.
     * Keeps long lists (Completed, Planning, …) from burying everything below them.
     */
    collapsible?: boolean
}

/**
 * Displays a list of media entry card from an Anilist media list collection.
 */
export function AnilistAnimeEntryList(props: AnilistAnimeEntryListProps) {

    const {
        list,
        type,
        layout = "grid",
        collapsible = false,
        ...rest
    } = props

    const [expanded, setExpanded] = React.useState(false)

    const entries = React.useMemo(() => list?.entries?.filter(Boolean) ?? [], [list?.entries])
    const canCollapse = collapsible && layout === "grid" && entries.length > COLLAPSED_ITEM_COUNT
    const visibleEntries = canCollapse && !expanded ? entries.slice(0, COLLAPSED_ITEM_COUNT) : entries

    function getListData(entry: AL_AnimeCollection_MediaListCollection_Lists_Entries) {
        return {
            progress: entry.progress!,
            score: entry.score!,
            status: entry.status!,
            startedAt: entry.startedAt?.year ? new Date(entry.startedAt.year,
                (entry.startedAt.month || 1) - 1,
                entry.startedAt.day || 1).toISOString() : undefined,
            completedAt: entry.completedAt?.year ? new Date(entry.completedAt.year,
                (entry.completedAt.month || 1) - 1,
                entry.completedAt.day || 1).toISOString() : undefined,
        }
    }

    if (layout === "carousel") return (
        <Carousel
            className={cn("w-full max-w-full !mt-0")}
            gap="xl"
            opts={{
                align: "start",
                dragFree: true,
            }}
            autoScroll={false}
        >
            <CarouselDotButtons className="-top-2" />
            <CarouselContent className="px-6">
                {list?.entries?.filter(Boolean)?.map(entry => {
                    return <div
                        key={entry.media?.id}
                        className={"relative basis-[200px] col-span-1 place-content-stretch flex-none md:basis-[250px] mx-2 mt-8 mb-0"}
                    >
                        <MediaEntryCard
                            key={`${entry.media?.id}`}
                            listData={getListData(entry)}
                            showLibraryBadge
                            media={entry.media!}
                            showListDataButton
                            type={type}
                        />
                    </div>
                })}
            </CarouselContent>
        </Carousel>
    )

    return (
        <>
            <MediaCardLazyGrid itemCount={visibleEntries.length} data-anilist-anime-entry-list>
                {visibleEntries.map((entry) => (
                    <MediaEntryCard
                        key={`${entry.media?.id}`}
                        listData={getListData(entry)}
                        showLibraryBadge
                        media={entry.media!}
                        showListDataButton
                        type={type}
                    />
                ))}
            </MediaCardLazyGrid>

            {canCollapse && (
                <div className="flex justify-center pt-2" data-anilist-anime-entry-list-toggle>
                    <Button
                        intent="gray-subtle"
                        size="sm"
                        rounded
                        rightIcon={expanded ? <LuChevronUp /> : <LuChevronDown />}
                        onClick={() => setExpanded(p => !p)}
                    >
                        {expanded ? "Show less" : `Show ${entries.length - COLLAPSED_ITEM_COUNT} more`}
                    </Button>
                </div>
            )}
        </>
    )
}
