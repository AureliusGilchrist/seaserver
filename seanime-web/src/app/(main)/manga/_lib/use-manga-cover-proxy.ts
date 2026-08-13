"use client"
import { getServerBaseUrl } from "@/api/client/server-url"
import { AL_BaseManga } from "@/api/generated/types"
import { useServerHMACAuth } from "@/app/(main)/_hooks/use-server-status"
import React from "react"

/**
 * Cover art for a downloaded manga does not always come from AniList.
 *
 * A series downloaded from a provider carries that provider's cover URL, and providers routinely
 * refuse to serve an image to a page that is not theirs — no referer, no image. From the browser that
 * is indistinguishable from having no cover at all: the request fails quietly and the card renders as
 * a grey rectangle, which is what a shelf of "downloaded but blank" cards actually is.
 *
 * The server already has an image proxy for exactly this, used for chapter pages. This routes cover
 * art through the same one, with the image's own origin as the referer, which is what the provider is
 * checking for.
 *
 * AniList's own CDN is left alone. It serves images to anyone, so proxying them would put every cover
 * in the library through the server for no reason at all.
 */

/** Hosts that serve their images without complaint, and so are never worth proxying. */
const directHostPatterns = [/(^|\.)anilist\.co$/i, /(^|\.)anili\.st$/i]

function shouldProxy(url: string): boolean {
    if (!url) return false
    // Local assets, data URIs and anything already pointed at this server.
    if (url.startsWith("data:") || url.startsWith("{{") || url.startsWith("/")) return false
    if (url.startsWith(getServerBaseUrl())) return false

    try {
        const host = new URL(url).hostname
        return !directHostPatterns.some(pattern => pattern.test(host))
    } catch {
        // Not a URL this can reason about — leave it exactly as it is.
        return false
    }
}

export function useMangaCoverProxy() {
    const { getHMACTokenQueryParam, password } = useServerHMACAuth()
    const [tokenQueryParam, setTokenQueryParam] = React.useState("")

    React.useLayoutEffect(() => {
        (async () => {
            setTokenQueryParam(await getHMACTokenQueryParam("/api/v1/image-proxy", "&"))
        })()
    }, [password])

    /** Rewrites one image URL to go through the proxy, or returns it untouched. */
    const proxiedImageUrl = React.useCallback((url: string | null | undefined): string | null | undefined => {
        if (!url || !shouldProxy(url)) return url

        let referer = ""
        try {
            referer = new URL(url).origin + "/"
        } catch {
            referer = ""
        }

        // The proxy requires a headers object, so there is always at least a referer in it.
        const headers = JSON.stringify({ Referer: referer })
        return `${getServerBaseUrl()}/api/v1/image-proxy?url=${encodeURIComponent(url)}&headers=${encodeURIComponent(headers)}` + tokenQueryParam
    }, [tokenQueryParam])

    /**
     * Returns the media with its cover and banner routed through the proxy where they need it.
     *
     * The same object is returned when nothing needs rewriting, which matters more than it looks:
     * a new object every render is a new identity for every card below, and that is its own kind of
     * broken library screen.
     */
    const withProxiedCover = React.useCallback(<T extends AL_BaseManga>(media: T | undefined | null): T | undefined | null => {
        if (!media) return media

        const large = media.coverImage?.large
        const extraLarge = media.coverImage?.extraLarge
        const medium = media.coverImage?.medium
        const banner = media.bannerImage

        if (!shouldProxy(large || "") && !shouldProxy(extraLarge || "") && !shouldProxy(medium || "") && !shouldProxy(banner || "")) {
            return media
        }

        return {
            ...media,
            coverImage: {
                ...media.coverImage,
                large: proxiedImageUrl(large),
                extraLarge: proxiedImageUrl(extraLarge),
                medium: proxiedImageUrl(medium),
            },
            bannerImage: proxiedImageUrl(banner),
        } as T
    }, [proxiedImageUrl])

    return { proxiedImageUrl, withProxiedCover }
}
