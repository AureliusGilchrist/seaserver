import { AL_MangaDetailsById_Media, Manga_Entry, Nullish } from "@/api/generated/types"
import { MediaCardGrid } from "@/app/(main)/_features/media/_components/media-card-grid"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { MediaFranchiseSection } from "@/app/(main)/_features/media/_components/media-franchise-section"
import { MediaSectionHeading } from "@/app/(main)/_features/media/_components/media-section-heading"
import React from "react"
import { LuThumbsUp } from "react-icons/lu"

type MangaRecommendationsProps = {
    entry: Nullish<Manga_Entry>
    details: Nullish<AL_MangaDetailsById_Media>
    maxCol?: number
}

export function MangaRecommendations(props: MangaRecommendationsProps) {

    const {
        entry,
        details,
        maxCol,
        ...rest
    } = props

    const recommendations = details?.recommendations?.edges?.map(edge => edge?.node?.mediaRecommendation)?.filter(Boolean)?.slice(0, 6) || []

    if (!entry || !details) return null

    return (
        <div className="space-y-10" data-manga-recommendations-container>
            {/* The whole franchise (every adaptation, sequel and spin-off), not three anime. */}
            <MediaFranchiseSection mediaId={entry.mediaId} fallbackRelations={details?.relations?.edges as any} />
            {recommendations.length > 0 && <>
                <MediaSectionHeading icon={<LuThumbsUp />} title="Recommendations" count={recommendations.length} />
                <MediaCardGrid maxCol={maxCol} type="manga">
                    {recommendations.map(media => {
                        return <div key={media.id} className="col-span-1">
                            <MediaEntryCard
                                media={media!}
                                type="manga"
                            />
                        </div>
                    })}
                </MediaCardGrid>
            </>}
        </div>
    )
}

