"use client"
import { cn } from "@/components/ui/core/styling"
import { getAssetUrl } from "@/lib/server/assets"
import { useThemeSettings } from "@/lib/theme/hooks"
import { motion } from "motion/react"
import { usePathname } from "@/lib/navigation"
import React from "react"

type CustomBackgroundImageProps = React.ComponentPropsWithoutRef<"div"> & {}

export function CustomBackgroundImage(props: CustomBackgroundImageProps) {

    const {
        className,
        ...rest
    } = props

    const ts = useThemeSettings()
    const pathname = usePathname()
    
    // Exclude specific pages from background effects
    const isExcludedPage = React.useMemo(() => {
        return pathname.includes('/manga/entry') || 
               pathname.includes('/entry') || 
               pathname.includes('/manga/_containers/chapter-reader')
    }, [pathname])
    
    if (isExcludedPage) return null

    return (
        <>
            {!!ts.libraryScreenCustomBackgroundImage && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1, delay: 0.1 }}
                    className="fixed w-full h-full inset-0 pointer-events-none"
                    data-custom-background-image
                >

                    {/* Enhanced blur layer with 80% dim */}
                    <div
                        data-custom-background-image-blur
                        className="fixed w-full h-full inset-0 z-[0] backdrop-blur-2xl bg-black/80 transition-all duration-1000"
                    />

                    <div
                        data-custom-background-image-cover
                        className={cn(
                            "fixed w-full h-full inset-0 z-[-1] bg-no-repeat bg-cover bg-center transition-opacity duration-1000 scroll-locked-offset-fixed",
                            className,
                        )}
                        style={{
                            backgroundImage: `url(${getAssetUrl(ts.libraryScreenCustomBackgroundImage)})`,
                            opacity: ts.libraryScreenCustomBackgroundOpacity / 100,
                        }}
                        {...rest}
                    />
                </motion.div>
            )}
        </>
    )
}
