import { TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE } from "@/app/(main)/_features/custom-ui/styles"
import { useHeroScrollFade } from "@/app/(main)/_features/media/_lib/use-hero-scroll-fade"
import { SeaImage } from "@/components/shared/sea-image"
import { cn } from "@/components/ui/core/styling"
import { useThemeSettings } from "@/lib/theme/hooks"
import { __isDesktop__ } from "@/types/constants"
import { motion } from "motion/react"
import React from "react"

type MediaEntryPageSmallBannerProps = {
    bannerImage?: string
}

export function MediaEntryPageSmallBanner(props: MediaEntryPageSmallBannerProps) {

    const {
        bannerImage,
        ...rest
    } = props

    const ts = useThemeSettings()
    const heroFade = useHeroScrollFade()
    const isShortBanner = ts.hideTopNavbar || __isDesktop__

    return (
        <>
            <motion.div
                data-media-entry-page-small-banner
                className={cn(
                    "w-full flex-none object-cover object-center overflow-hidden bg-[--background]",
                    heroFade.containerClass,
                    // Fixed to the top of the window, or 5rem above the page when it scrolls away with it.
                    heroFade.hasWallpaper
                        ? cn("-top-[5rem]", isShortBanner ? "h-[27rem]" : "h-[30rem]")
                        : cn("top-0", isShortBanner ? "h-[22rem]" : "h-[25rem]"),
                    !ts.disableSidebarTransparency && TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE,
                )}
                style={heroFade.containerStyle}
            >
                <div
                    data-media-entry-page-small-banner-gradient
                    className="w-full absolute z-[2] top-0 h-[8rem] opacity-40 bg-gradient-to-b from-[--background] to-transparent via"
                />
                <motion.div data-media-entry-page-small-banner-image-container className="absolute w-full h-full" style={heroFade.imageStyle}>
                    {(!!bannerImage) && <SeaImage
                        data-media-entry-page-small-banner-image
                        src={bannerImage || ""}
                        alt="banner image"
                        fill
                        quality={100}
                        priority
                        sizes="100vw"
                        className="object-cover object-center z-[1]"
                    />}
                </motion.div>
                <div
                    data-media-entry-page-small-banner-bottom-gradient
                    className="w-full z-[3] absolute bottom-0 h-[32rem] bg-gradient-to-t from-[--background] via-[--background] via-50% to-transparent"
                />

            </motion.div>
        </>
    )
}
