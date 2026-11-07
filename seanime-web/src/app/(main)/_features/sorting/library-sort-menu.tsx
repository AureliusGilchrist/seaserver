"use client"

import { cn } from "@/components/ui/core/styling"
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { LibrarySortField } from "@/lib/helpers/filtering"
import { useAtom } from "jotai/react"
import { atomWithStorage } from "jotai/utils"
import React from "react"
import { LuArrowDownWideNarrow, LuArrowUpNarrowWide, LuCheck, LuChevronDown } from "react-icons/lu"

/**
 * The order each library view was last put in, keyed by view. Per viewer (this browser) on purpose:
 * how someone likes to browse their shelf is theirs, and nothing on the server reads it.
 */
const librarySortOrdersAtom = atomWithStorage<Record<string, string>>("sea-library-sort-orders", {}, undefined, { getOnInit: true })

export type LibrarySortView =
    | "anime-library"
    | "local-anime-library"
    | "local-manga-library"
    | "manga-library"
    | "missed-sequels"
    | "anilist-lists-anime"
    | "anilist-lists-manga"

const CATEGORY_VIEWS = new Set<LibrarySortView>(["anime-library", "manga-library", "anilist-lists-anime", "anilist-lists-manga"])

/**
 * The sort a view should use: the one picked in its menu, else `fallback` (usually the theme's default
 * sorting setting, so nothing changes for anyone until they pick an order themselves).
 */
export function useLibrarySort(view: LibrarySortView, fallback: string) {
    const [orders, setOrders] = useAtom(librarySortOrdersAtom)
    const stored = orders?.[view]
    // The category lists (Watching, Completed, Planning…) open newest release first until an order
    // is picked; once one is, it is remembered for that view and used from then on.
    if (CATEGORY_VIEWS.has(view)) fallback = "RELEASE_DATE_DESC"
    const setSorting = React.useCallback((value: string) => {
        setOrders(prev => ({ ...(prev ?? {}), [view]: value }))
    }, [setOrders, view])
    return { sorting: stored || fallback, isChosen: !!stored, setSorting }
}

/**
 * One compact control for ordering a list: the field in a menu, and the direction flipped in place.
 * Every library view uses this same control so it reads the same everywhere.
 */
export function LibrarySortMenu({ fields, value, onChange, className }: {
    fields: LibrarySortField[]
    value: string
    onChange: (value: string) => void
    className?: string
}) {
    const field = fields.find(f => f.asc === value || f.desc === value) ?? fields[0]
    const isDesc = field.asc === value ? false : field.desc === value ? true : !!field.defaultDesc
    const directionLabel = isDesc ? field.descLabel : field.ascLabel

    return (
        <div
            className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full bg-white/[0.04] p-0.5 text-sm ring-1 ring-white/10",
                "transition-colors hover:bg-white/[0.06]",
                className,
            )}
            data-library-sort-menu
        >
            <DropdownMenu
                className="min-w-[15rem]"
                align="end"
                trigger={<button
                    type="button"
                    className="flex h-full items-center gap-2 rounded-full pl-3 pr-2 font-medium text-white/85 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand-300/50"
                    aria-label={`Order by ${field.label}`}
                >
                    <span className="text-white/45">Sort</span>
                    <span className="max-w-[10rem] truncate">{field.label}</span>
                    <LuChevronDown className="size-3.5 text-white/45" />
                </button>}
            >
                <DropdownMenuLabel className="text-xs uppercase tracking-wider text-[--muted]">Order by</DropdownMenuLabel>
                {fields.map(f => {
                    const active = f === field
                    return (
                        <DropdownMenuItem
                            key={f.asc}
                            onClick={() => onChange(active ? value : (f.defaultDesc ? f.desc : f.asc))}
                            className={cn("flex items-center justify-between gap-3", active && "text-white")}
                        >
                            <span>{f.label}</span>
                            {active
                                ? <span className="flex items-center gap-1.5 text-xs text-brand-200">{directionLabel}<LuCheck className="size-3.5" /></span>
                                : <span className="text-xs text-[--muted]">{f.defaultDesc ? f.descLabel : f.ascLabel}</span>}
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenu>

            <span className="h-4 w-px bg-white/10" aria-hidden />

            <button
                type="button"
                onClick={() => onChange(isDesc ? field.asc : field.desc)}
                title={`${directionLabel} (click to reverse)`}
                aria-label={`${directionLabel}, click to reverse`}
                className="group flex h-full items-center gap-1.5 rounded-full pl-2 pr-3 text-white/60 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand-300/50"
            >
                <span className="relative size-4">
                    <LuArrowDownWideNarrow
                        className={cn("absolute inset-0 size-4 transition-all duration-200", isDesc ? "opacity-100 rotate-0" : "opacity-0 -rotate-90")}
                    />
                    <LuArrowUpNarrowWide
                        className={cn("absolute inset-0 size-4 transition-all duration-200", isDesc ? "opacity-0 rotate-90" : "opacity-100 rotate-0")}
                    />
                </span>
                <span className="hidden text-xs sm:inline">{directionLabel}</span>
            </button>
        </div>
    )
}
