"use client"
import { useHeroScrollFade } from "@/app/(main)/_features/media/_lib/use-hero-scroll-fade"
import { TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE } from "@/app/(main)/_features/custom-ui/styles"
import { cn } from "@/components/ui/core/styling"
import { getAssetUrl } from "@/lib/server/assets"
import { ThemeLibraryScreenBannerType, useThemeSettings } from "@/lib/theme/hooks"
import { __isDesktop__, HIDE_IMAGES } from "@/types/constants"
import { AnimatePresence, motion } from "motion/react"
import React from "react"

type CustomLibraryBannerProps = {
    discrete?: boolean
    isHomeScreen?: boolean
    isLibraryScreen?: boolean // Anime library or manga library
    /** Draw this image rather than the app-wide banner. */
    override?: { image: string, position: string, opacity: number }
    /** Fade the banner image layer while keeping it mounted for an exit transition. */
    visible?: boolean
}

export function CustomLibraryBanner(props: CustomLibraryBannerProps) {
    /**
     * Library screens: Shows the custom banner IF theme settings are set to use a custom banner
     * Other pages: Shows the custom banner
     */
    const { discrete, isLibraryScreen, isHomeScreen, override, visible = true } = props
    const ts = useThemeSettings()
    const image = React.useMemo(() => override?.image || (ts.libraryScreenCustomBannerImage ? getAssetUrl(ts.libraryScreenCustomBannerImage) : ""),
        [override?.image, ts.libraryScreenCustomBannerImage])
    // Same scroll fade as the anime/manga page hero. A discrete banner starts faint and fades from there.
    const heroFade = useHeroScrollFade({ restOpacity: discrete ? 0.2 : 1 })

    if (isLibraryScreen && ts.libraryScreenBannerType !== ThemeLibraryScreenBannerType.Custom) return null
    if (discrete && !!ts.libraryScreenCustomBackgroundImage) return null
    if (!image) return null

    return (
        <>
            {(!discrete && !isHomeScreen) && <div
                data-custom-library-banner-top-spacer
                className={cn(
                    "py-20",
                    ts.hideTopNavbar && "py-28",
                )}
            ></div>}
            <motion.div
                data-custom-library-banner-container
                className={cn(
                    "__header h-[30rem] z-[1] top-0 w-full group/library-header",
                    // Same scroll fade as the anime/manga page hero.
                    heroFade.containerClass,
                    !ts.disableSidebarTransparency && TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE,
                    __isDesktop__ && "top-[-2rem]",
                    !ts.disableSidebarTransparency ? "scroll-locked-offset-width" : "scroll-locked-offset-fixed",
                )}
                style={heroFade.containerStyle}
            >
                {(!ts.disableSidebarTransparency && !discrete) && <motion.div
                    data-custom-library-banner-top-gradient
                    className="hidden lg:block h-full absolute z-[2] w-[20rem] left-0 top-0 bg-gradient bg-gradient-to-r from-[var(--background)] to-transparent"
                    initial={false}
                    animate={{ opacity: visible ? 0.7 : 0 }}
                    transition={{ duration: 1, delay: 0.2 }}
                />}

                <motion.div
                    data-custom-library-banner-bottom-gradient
                    className="w-full z-[3] absolute bottom-[-5rem] h-[5rem] bg-gradient-to-b from-[--background] via-transparent via-100% to-transparent"
                    initial={false}
                    animate={{ opacity: visible ? 1 : 0 }}
                    transition={{ duration: 1, delay: 0.2 }}
                />
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: visible ? 1 : 0, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1, delay: 0.2 }}
                    className={cn(
                        "h-[30rem] z-[0] w-full flex-none absolute top-0 overflow-hidden",
                        "scroll-locked-offset",
                    )}
                    data-custom-library-banner-inner-container
                >
                    <div
                        data-custom-library-banner-top-gradient
                        className={cn(
                            "CUSTOM_LIB_BANNER_TOP_FADE w-full absolute z-[2] top-0 h-[5rem] opacity-40 bg-gradient-to-b from-[--background] to-transparent via",
                            discrete && "opacity-70",
                        )}
                    />
                    {/* Keyed by image so a banner that changes crossfades. */}
                    <AnimatePresence initial={false}>
                        <motion.div
                            key={image}
                            data-custom-library-banner-image
                            className={cn(
                                "CUSTOM_LIB_BANNER_IMG z-[1] absolute inset-0 w-full h-full bg-cover bg-no-repeat",
                                "scroll-locked-offset",
                            )}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: ((override ? override.opacity : ts.libraryScreenCustomBannerOpacity) || 100) / 100 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1 }}
                            style={{
                                ...heroFade.imageStyle,
                                backgroundImage: `url(${HIDE_IMAGES ? "/no-cover.png" : image})`,
                                backgroundPosition: (override ? override.position : ts.libraryScreenCustomBannerPosition) || "50% 50%",
                                backgroundRepeat: "no-repeat",
                                backgroundSize: "cover",
                            }}
                        />
                    </AnimatePresence>
                    <div
                        data-custom-library-banner-bottom-gradient
                        className={cn(
                            "CUSTOM_LIB_BANNER_BOTTOM_FADE w-full z-[2] absolute bottom-0 h-[20rem] bg-gradient-to-t from-[--background] via-opacity-50 via-10% to-transparent via",
                            discrete && "via-50% via-opacity-100 h-[40rem]",
                        )}
                    />
                </motion.div>
            </motion.div>
        </>
    )

}
