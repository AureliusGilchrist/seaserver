"use client"

import { Anime_Episode } from "@/api/generated/types"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { useMangaContinueReadingList } from "@/app/(main)/manga/_lib/use-manga-continue-reading"
import { getImageUrl } from "@/lib/server/assets"
import React from "react"

const SLIDE_MS = 8000

/**
 * The landing banner while continue reading is on: every anime in progress, then every manga, then
 * back to the anime. A cover has no wide crop, so it sits higher, on the faces.
 */
export function LandingContinueBanner({ episodes }: { episodes: Anime_Episode[] }) {
    const { entries } = useMangaContinueReadingList()

    const slides = React.useMemo(() => {
        const images = [
            ...episodes.map(episode => episode.baseAnime),
            ...entries.map(entry => entry.media),
        ].map(media => ({ banner: media?.bannerImage, cover: media?.coverImage?.extraLarge || media?.coverImage?.large }))
        return images.filter(image => !!image.banner || !!image.cover)
    }, [episodes, entries])

    const [index, setIndex] = React.useState(0)

    React.useEffect(() => {
        if (slides.length <= 1) return
        const interval = setInterval(() => setIndex(current => (current + 1) % slides.length), SLIDE_MS)
        return () => clearInterval(interval)
    }, [slides.length])

    const slide = slides[index % slides.length]
    if (!slide) return null

    return (
        <CustomLibraryBanner
            isHomeScreen
            override={{ image: getImageUrl((slide.banner || slide.cover)!), position: slide.banner ? "50% 50%" : "50% 25%", opacity: 100 }}
        />
    )
}
