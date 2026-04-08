// Shim: next/link → Tanstack Router Link
import { Link as TanstackLink } from "@tanstack/react-router"
import React from "react"

type LinkProps = React.ComponentPropsWithRef<"a"> & {
    href: string
    replace?: boolean
    scroll?: boolean
    prefetch?: boolean
    passHref?: boolean
    shallow?: boolean
    locale?: string | false
    legacyBehavior?: boolean
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
    ({ href, children, ...rest }, ref) => {
        const isExternal = href?.startsWith("http") || href?.startsWith("mailto")

        if (isExternal) {
            return (
                <a ref={ref} href={href} {...rest}>
                    {children}
                </a>
            )
        }

        const [pathname, searchString] = (href || "").split("?")
        const searchParams: Record<string, any> = {}
        if (searchString) {
            const urlSearchParams = new URLSearchParams(searchString)
            urlSearchParams.forEach((value, key) => {
                const numValue = Number(value)
                const isNumeric = !isNaN(numValue) && value.trim() !== ""
                searchParams[key] = isNumeric ? numValue : value
            })
        }

        return (
            <TanstackLink
                to={pathname}
                search={Object.keys(searchParams).length > 0 ? () => searchParams : undefined}
                {...rest}
            >
                {children}
            </TanstackLink>
        )
    },
)

Link.displayName = "Link"

export default Link
export type { LinkProps }
