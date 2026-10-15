import { HIDE_IMAGES } from "@/types/constants"
import React, { forwardRef, useEffect, useState } from "react"

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean
    priority?: boolean
    overrideSrc?: string
    fallbackSrc?: string | string[]
    quality?: number | string
    placeholder?: string
    blurDataURL?: string
    sizes?: string
    allowGif?: boolean
}

export const SeaImage = forwardRef<HTMLImageElement, ImageProps & { isExternal?: boolean }>(
    ({ isExternal, fill, priority, quality, placeholder, sizes, allowGif, fallbackSrc, ...props }, ref) => {
        const [hasError, setHasError] = useState(false)
        const fallbackSources = (Array.isArray(fallbackSrc) ? fallbackSrc : [fallbackSrc]).filter((src): src is string => !!src)
        const fallbackKey = fallbackSources.join("\u0000")
        const [currentSrc, setCurrentSrc] = useState(props.src || fallbackSources[0] || "")

        useEffect(() => {
            setHasError(false)
            setCurrentSrc(props.src || fallbackSources[0] || "")
        }, [props.src, fallbackKey])

        if (HIDE_IMAGES) {
            return <Image
                ref={ref}
                {...props}
                src="/no-cover.png"
                className={props.className}
                alt={props.alt || "cover"}
                fill={fill}
            />
        }

        const blocked = isExternal && currentSrc && typeof currentSrc === "string" && !(
            currentSrc.endsWith(".png")
            || currentSrc.endsWith(".jpg")
            || currentSrc.endsWith(".jpeg")
            || currentSrc.endsWith(".avif")
            || currentSrc.endsWith(".webp")
            || currentSrc.endsWith(".ico")
            || (allowGif && currentSrc.endsWith(".gif"))
        )

        const fallbackIndex = fallbackSources.indexOf(currentSrc)
        const nextFallback = fallbackSources[fallbackIndex < 0 ? 0 : fallbackIndex + 1]
        const useFallback = !!nextFallback && (blocked || hasError)
        const displaySrc = useFallback ? nextFallback : currentSrc
        const effectiveOverride = ((blocked || hasError) && !useFallback) ? "/no-cover.png" : props.overrideSrc

        function handleError() {
            if (nextFallback) {
                setCurrentSrc(nextFallback)
                return
            }
            setHasError(true)
            console.warn(`Error loading image ${currentSrc}`)
        }

        return <Image
            ref={ref}
            {...props}
            src={displaySrc}
            alt={props.alt || ""}
            fill={fill}
            priority={priority}
            placeholder={placeholder}
            overrideSrc={effectiveOverride}
            onError={handleError}
        />
    },
)

SeaImage.displayName = "SeaImage"

interface _ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string | any
    alt: string
    width?: number | string
    height?: number | string
    fill?: boolean
    quality?: number | string
    priority?: boolean
    loader?: any
    placeholder?: string
    blurDataURL?: string
    unoptimized?: boolean
    onLoadingComplete?: (img: HTMLImageElement) => void
    layout?: string
    objectFit?: string
    overrideSrc?: string
}

const Image = forwardRef<HTMLImageElement, _ImageProps>((
    {
        src,
        alt,
        width,
        height,
        fill,
        style,
        className,
        quality,
        priority,
        loader,
        placeholder,
        blurDataURL,
        unoptimized,
        onLoadingComplete,
        layout,
        objectFit,
        overrideSrc,
        onLoad,
        ...props
    },
    ref,
) => {
    const [isLoaded, setIsLoaded] = useState(false)

    const isStaticImport = typeof src === "object" && src !== null && "src" in src
    const imageSrc = overrideSrc || (isStaticImport ? src.src : src)
    const staticBlur = isStaticImport ? src.blurDataURL : undefined

    useEffect(() => {
        setIsLoaded(false)
    }, [imageSrc])

    const blurUrl = (placeholder && placeholder !== "blur" && placeholder !== "empty")
        ? placeholder
        : (placeholder === "blur" ? (blurDataURL || staticBlur) : undefined)

    const fillStyle: React.CSSProperties = fill ? {
        position: "absolute",
        height: "100%",
        width: "100%",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        color: "transparent",
    } : {}

    const placeholderStyle: React.CSSProperties = (blurUrl && !isLoaded) ? {
        backgroundImage: `url("${blurUrl}")`,
        backgroundSize: objectFit === "contain" ? "contain" : "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
    } : {}

    const imageWidth = fill ? undefined : (width || (isStaticImport ? src.width : undefined))
    const imageHeight = fill ? undefined : (height || (isStaticImport ? src.height : undefined))

    return (
        <img
            ref={ref}
            src={imageSrc}
            alt={alt}
            width={imageWidth}
            height={imageHeight}
            decoding="async"
            loading={priority ? "eager" : "lazy"}
            className={className}
            style={{
                ...fillStyle,
                ...placeholderStyle,
                ...(objectFit ? { objectFit: objectFit as any } : {}),
                ...style,
            }}
            onLoad={(e) => {
                setIsLoaded(true)
                onLoad?.(e)
            }}
            {...props}
        />
    )
})

Image.displayName = "Image"
