import { AL_AnimeDetailsById_Media, Anime_Entry, Nullish } from "@/api/generated/types"
import { MediaCardGrid } from "@/app/(main)/_features/media/_components/media-card-grid"
import { MediaFranchiseSection } from "@/app/(main)/_features/media/_components/media-franchise-section"
import { MediaSectionHeading } from "@/app/(main)/_features/media/_components/media-section-heading"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import React from "react"
import { LuThumbsUp } from "react-icons/lu"

type RelationsRecommendationsSectionProps = {
    entry: Nullish<Anime_Entry>
    details: Nullish<AL_AnimeDetailsById_Media>
    containerRef?: React.RefObject<HTMLElement>
    maxCol?: number
}

export function RelationsRecommendationsSection(props: RelationsRecommendationsSectionProps) {

    const {
        entry,
        details,
        containerRef,
        maxCol,
        ...rest
    } = props

    const recommendations = React.useMemo(() => details?.recommendations?.edges?.map(edge => edge?.node?.mediaRecommendation)?.filter(Boolean) || [],
        [details?.recommendations?.edges])

    if (!entry || !details) return null

    return (
        <>
            {/* The whole franchise, not only the first few direct relations. */}
            <MediaFranchiseSection mediaId={entry.mediaId} fallbackRelations={details?.relations?.edges as any} />
            {recommendations.length > 0 && <>
                <MediaSectionHeading icon={<LuThumbsUp />} title="Recommendations" count={recommendations.length} />
                <MediaCardGrid maxCol={maxCol}>
                    {recommendations.map(media => {
                        return <div key={media.id} className="col-span-1">
                            <MediaEntryCard
                                media={media!}
                                showLibraryBadge
                                showTrailer
                                type="anime"
                            />
                        </div>
                    })}
                </MediaCardGrid>
            </>}
        </>
    )
}
