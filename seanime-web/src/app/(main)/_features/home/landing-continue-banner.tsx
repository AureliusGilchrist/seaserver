"use client"

import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { getImageUrl } from "@/lib/server/assets"
import React from "react"

/** Shows the matching media banner while a continue-watching or continue-reading card is hovered. */
export function LandingContinueBanner({ hoverImage }: { hoverImage: string | null }) {
    const [lastImage, setLastImage] = React.useState<string | null>(null)
    React.useEffect(() => {
        if (hoverImage) setLastImage(hoverImage)
    }, [hoverImage])

    if (!lastImage) return null

    return (
        <CustomLibraryBanner
            isHomeScreen
            visible={!!hoverImage}
            override={{ image: getImageUrl(hoverImage || lastImage), position: "50% 50%", opacity: 100 }}
        />
    )
}
