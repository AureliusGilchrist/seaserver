import { useNavigate, useLocation, useRouterState } from "@tanstack/react-router"
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
    // The search params of the page that is actually on screen.
    //
    // useLocation() switches to the *next* location the moment a navigation starts, while the old
    // page is still mounted (routes are lazy, so it stays up until the new chunk loads). Pages that
    // send you home when their ?id= is missing then saw no id and pushed "/" — overriding the link
    // you'd just clicked. That is how almost every sidebar click ended on the landing page, except
    // from the landing page itself, which has no such guard. The resolved location only changes
    // once the new page has actually taken over.
    const search = useRouterState({ select: s => (s.resolvedLocation ?? s.location).search })

    return useMemo(() => {
        const params = new URLSearchParams()

        Object.entries(search ?? {}).forEach(([key, value]) => {
            if (value === undefined || value === null) return
            params.set(key, String(value))
        })

        return params
    }, [search])
}
