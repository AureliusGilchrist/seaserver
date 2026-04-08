// Shim: next/image → native <img> with compatibility props
import React, { forwardRef, useState, useEffect } from "react"

export type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
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
    sizes?: string
}

const Image = forwardRef<HTMLImageElement, ImageProps>((
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
        sizes,
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

export default Image
