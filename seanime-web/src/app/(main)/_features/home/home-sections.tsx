"use client"

import { Models_HomeItem } from "@/api/generated/types"
import { HOME_ITEMS } from "@/app/(main)/(library)/_home/home-items.utils"
import { cn } from "@/components/ui/core/styling"
import { motion } from "motion/react"
import React from "react"

// The body of the anime and manga home screens. What is on them and in what order is the home
// settings' business: this only frames whichever items it is given, and offers a way to jump to them.

/** Items that are not a shelf of things: they sit on the page itself and have no place in the jump bar. */
const UNFRAMED_ITEMS = new Set(["centered-title", "local-anime-library-stats", "local-manga-library-stats"])

function sectionName(item: Models_HomeItem): string {
    return item.options?.name || (HOME_ITEMS as Record<string, { name: string }>)[item.type]?.name || item.type
}

export function HomeSections({ items, renderItem }: {
    items: Models_HomeItem[]
    renderItem: (item: Models_HomeItem) => React.ReactNode
}) {
    const rootRef = React.useRef<HTMLDivElement>(null)
    const [activeId, setActiveId] = React.useState<string | null>(null)
    // An item can decide to render nothing, which only the DOM knows: nothing to show in the jump bar.
    const [emptyIds, setEmptyIds] = React.useState<string[]>([])

    React.useEffect(() => {
        const root = rootRef.current
        if (!root) return

        let timer: ReturnType<typeof setTimeout> | undefined
        const measure = () => {
            const empty = Array.from(root.querySelectorAll<HTMLElement>("[data-home-section-body]"))
                .filter(body => body.childElementCount === 0)
                .map(body => body.dataset.homeSectionBody!)
            setEmptyIds(prev => prev.join() === empty.join() ? prev : empty)
        }
        measure()
        const mutations = new MutationObserver(() => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(measure, 250)
        })
        mutations.observe(root, { childList: true, subtree: true })

        const visible = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) setActiveId((entry.target as HTMLElement).dataset.homeSection ?? null)
            }
        }, { rootMargin: "-25% 0px -65% 0px" })
        root.querySelectorAll("[data-home-section]").forEach(section => visible.observe(section))

        return () => {
            if (timer) clearTimeout(timer)
            mutations.disconnect()
            visible.disconnect()
        }
    }, [items])

    const nav = items.filter(item => !UNFRAMED_ITEMS.has(item.type) && !emptyIds.includes(item.id))

    return (
        <div ref={rootRef} className="space-y-6 px-3 md:px-5" data-home-sections>
            {nav.length > 1 && (
                <nav
                    className="sticky top-2 z-[30] mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/60 p-1 ring-1 ring-white/10 backdrop-blur-xl [scrollbar-width:none]"
                    aria-label="Sections"
                    data-home-section-nav
                >
                    {nav.map(item => {
                        const active = item.id === activeId
                        return (
                            <button
                                key={item.id}
                                type="button"
                                aria-current={active || undefined}
                                onClick={() => rootRef.current?.querySelector(`[data-home-section="${CSS.escape(item.id)}"]`)
                                    ?.scrollIntoView({ behavior: "smooth", block: "start" })}
                                className={cn(
                                    "relative shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                                    active ? "text-white" : "text-white/55 hover:text-white",
                                )}
                            >
                                {active && <motion.span
                                    layoutId="home-section-pill"
                                    className="absolute inset-0 rounded-full bg-white/[0.12] ring-1 ring-white/15"
                                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                />}
                                <span className="relative">{sectionName(item)}</span>
                            </button>
                        )
                    })}
                </nav>
            )}

            {items.map(item => {
                const framed = !UNFRAMED_ITEMS.has(item.type)
                return (
                    <motion.section
                        key={item.id}
                        data-home-section={item.id}
                        data-sea-home-item
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0, margin: "0px 0px -8% 0px" }}
                        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                        className={cn(
                            "scroll-mt-16 [&:not(:has(>[data-home-section-body]>*))]:hidden",
                            framed && "rounded-3xl border border-white/[0.08] bg-black/40 p-2 shadow-xl shadow-black/20 backdrop-blur-md md:p-3",
                        )}
                    >
                        <div data-home-section-body={item.id}>{renderItem(item)}</div>
                    </motion.section>
                )
            })}
        </div>
    )
}

function readTab(key: string) {
    try {
        return localStorage.getItem(key)
    }
    catch {
        return null
    }
}

/** Which of a library's lists is showing, remembered per library. Falls back to the first one. */
export function useHomeListTab(library: "anime" | "manga", ids: string[]) {
    const key = `sea-home-list-${library}`
    const [selected, setSelected] = React.useState<string | null>(() => readTab(key))
    const select = React.useCallback((id: string) => {
        setSelected(id)
        try {
            localStorage.setItem(key, id)
        }
        catch { /* the tab just won't be remembered */ }
    }, [key])
    return [selected && ids.includes(selected) ? selected : ids[0], select] as const
}

export function HomeListTabs({ tabs, value, onChange, trailing }: {
    /** `count` is left out while it is not known yet. */
    tabs: { id: string, label: string, count?: number }[]
    value: string | undefined
    onChange: (id: string) => void
    /** Drawn at the end of the row, e.g. the list's sort menu. Shown even when there is a single tab. */
    trailing?: React.ReactNode
}) {
    const groupId = React.useId()
    if (tabs.length < 2) {
        if (!trailing) return null
        return <div className="flex justify-end pb-1" data-home-list-tabs-trailing>{trailing}</div>
    }
    return (
        <div className="flex flex-wrap items-center gap-1.5 pb-1" data-home-list-tabs>
            <div className="flex flex-wrap gap-1.5" role="tablist">
            {tabs.map(tab => {
                const active = tab.id === value
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                            active ? "text-white" : "bg-white/[0.04] text-white/60 hover:text-white",
                        )}
                    >
                        {active && <motion.span
                            layoutId={`home-list-tab-${groupId}`}
                            className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-500/40 to-brand-400/20 ring-1 ring-brand-300/30"
                            transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />}
                        <span className="relative">{tab.label}</span>
                        {tab.count !== undefined &&
                            <span className="relative text-xs tabular-nums text-white/55">{tab.count.toLocaleString()}</span>}
                    </button>
                )
            })}
            </div>
            {trailing && <div className="ml-auto pl-2">{trailing}</div>}
        </div>
    )
}
