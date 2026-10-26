import { Skeleton } from "@/components/ui/skeleton"
import React from "react"

export const MediaEntryCardSkeleton = () => {
    return (
        <>
            <Skeleton
                data-media-entry-card-skeleton
                className="sea-card-item aspect-[6/8] bg-gray-900 rounded-[--radius-md] mt-8 mx-2"
            />
        </>
    )
}
