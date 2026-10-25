import { useNavigate, useLocation } from "@tanstack/react-router"
import { useMemo } from "react"

function parseHref(href: string) {
    const [pathname, searchString] = href.split("?")
    const searchParams: Record<string, any> = {}

    if (searchString) {
        const urlSearchParams = new URLSearchParams(searchString)
        urlSearchParams.forEach((value, key) => {
            const numValue = Number(value)
            const isNumeric = !isNaN(numValue) && value.trim() !== ""
            searchParams[key] = isNumeric ? numValue : value
        })
    }

    return { pathname, searchParams }
}

export function useRouter() {
    const navigate = useNavigate()
    const location = useLocation()

    const handleNavigation = (
        href: string,
        method: "push" | "replace",
        options?: { resetScroll?: boolean; scroll?: boolean },
    ) => {
        const { pathname, searchParams } = parseHref(href)

        const targetPath = pathname || location.pathname

        const shouldScroll = options?.resetScroll ?? options?.scroll ?? true

        navigate({
            to: targetPath,
            search: () => searchParams,
            replace: method === "replace",
        }).then(() => {
            if (shouldScroll) {
                window.scrollTo(0, 0)
            }
        })
    }

    return {
        push: (href: string, options?: { resetScroll?: boolean; scroll?: boolean }) =>
            handleNavigation(href, "push", options),

        replace: (href: string, options?: { resetScroll?: boolean; scroll?: boolean }) =>
            handleNavigation(href, "replace", options),

        back: () => window.history.back(),
        forward: () => window.history.forward(),
        refresh: () => window.location.reload(),
    }
}

export function usePathname() {
    const location = useLocation()
    return location.pathname
}

export function useSearchParams() {
    const location = useLocation()

    return useMemo(() => {
        const params = new URLSearchParams()

        Object.entries(location.search).forEach(([key, value]) => {
            if (value === undefined || value === null) return
            params.set(key, String(value))
        })

        return params
    }, [location.search])
}

/**
 * Whether the browser is still on `path` right now.
 *
 * Routes are lazy, so a page stays mounted for a moment after you navigate away, and during that
 * moment useSearchParams() already reads the *next* location. A page that sends you home when its
 * `?id=` is missing must check this at the moment it redirects, or it hijacks the link you just
 * clicked (that's how sidebar clicks used to land on the landing page). The URL changes as soon as
 * a navigation starts, so this is also right inside timers.
 */
export function isStillOnPath(path: string): boolean {
    if (typeof window === "undefined") return true
    const current = window.location.pathname.replace(/\/+$/, "") || "/"
    return current === path
}
