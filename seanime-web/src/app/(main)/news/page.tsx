"use client"

import { formatNewsDate, useGetNewsFeed, type RssItem } from "@/api/hooks/news.hooks"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuExternalLink, LuRefreshCw, LuRss } from "react-icons/lu"

/**
 * The News page — the widget's "Show more" tab, opened up.
 *
 * The home widget keeps the rack short; this page holds the whole catch, as many of the
 * freshest entries as Personal settings asks for, filterable by feed. Entries open the source
 * in a new tab.
 */
export default function Page() {
    const { data, isLoading, isError, refetch, isRefetching } = useGetNewsFeed()
    const personal = usePersonalSettings()

    const items = React.useMemo(() => data?.items ?? [], [data?.items])
    const shown = React.useMemo(
        () => items.slice(0, Math.max(10, Math.min(200, personal.newsFeedShowMoreCount))),
        [items, personal.newsFeedShowMoreCount],
    )

    const feeds = React.useMemo(() => {
        const seen = new Map<string, number>()
        for (const item of shown) {
            const name = item.feedTitle || "Unknown feed"
            seen.set(name, (seen.get(name) ?? 0) + 1)
        }
        return [...seen.entries()].sort((a, b) => b[1] - a[1])
    }, [shown])

    const [activeFeed, setActiveFeed] = React.useState<string | null>(null)
    const filtered = React.useMemo(
        () => activeFeed ? shown.filter(item => (item.feedTitle || "Unknown feed") === activeFeed) : shown,
        [shown, activeFeed],
    )

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-6 pb-16">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="flex size-11 items-center justify-center rounded-xl bg-brand-500/15 ring-1 ring-brand-500/30">
                                <LuRss className="size-5 text-[--brand]" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">News</h1>
                                <p className="text-sm text-[--muted]">
                                    The freshest from your feeds
                                    {data?.updatedAt ? <> — updated {formatNewsDate(data.updatedAt)}</> : null}.
                                </p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 backdrop-blur-md transition hover:bg-white/10 hover:text-white"
                    >
                        <LuRefreshCw className={cn("size-4", isRefetching && "animate-spin")} />
                        Refresh
                    </button>
                </div>

                {isLoading && <LoadingSpinner />}

                {isError && (
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-8 text-center backdrop-blur-md">
                        <p className="text-[--muted]">Could not load the news feeds. Check your connection and try again.</p>
                    </div>
                )}

                {!isLoading && !isError && shown.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center backdrop-blur-md">
                        <LuRss className="mx-auto mb-3 size-8 text-[--muted]" />
                        <p className="text-sm text-[--muted]">
                            Nothing here yet — feeds refresh every 15 minutes. Add or change them under
                            Settings → App.
                        </p>
                    </div>
                )}

                {!isLoading && !isError && shown.length > 0 && (
                    <>
                        {feeds.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                                <FeedChip
                                    label="All feeds"
                                    count={shown.length}
                                    active={activeFeed === null}
                                    onClick={() => setActiveFeed(null)}
                                />
                                {feeds.map(([name, count]) => (
                                    <FeedChip
                                        key={name}
                                        label={name}
                                        count={count}
                                        active={activeFeed === name}
                                        onClick={() => setActiveFeed(current => current === name ? null : name)}
                                    />
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                            {filtered.map((item, idx) => (
                                <NewsCard key={`${item.link}-${idx}`} item={item} />
                            ))}
                        </div>
                    </>
                )}
            </PageWrapper>
        </>
    )
}

function FeedChip({ label, count, active, onClick }: {
    label: string
    count: number
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex max-w-[14rem] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                active
                    ? "border-[--brand]/60 bg-[--brand]/15 text-white"
                    : "border-white/10 bg-black/25 text-white/70 backdrop-blur-md hover:bg-black/40 hover:text-white",
            )}
        >
            <span className="truncate">{label}</span>
            <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                active ? "bg-[--brand]/30 text-white" : "bg-white/10 text-white/60",
            )}>
                {count}
            </span>
        </button>
    )
}

/** The full-page card: big image when the feed supplies one, title, snippet, feed, age. */
function NewsCard({ item }: { item: RssItem }) {
    return (
        <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/25 shadow-lg shadow-black/20 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[--brand]/60 hover:bg-black/40 hover:shadow-xl hover:shadow-[--brand]/10"
        >
            <div className="pointer-events-none absolute -right-8 -top-8 z-0 size-28 rounded-full bg-[--brand]/15 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
            {item.image && (
                <div className="relative z-[1] h-36 w-full overflow-hidden">
                    <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
            )}
            <div className={cn("relative z-[1] flex flex-1 flex-col p-4", item.image && "pt-3")}>
                <div className="flex items-center gap-2 text-xs text-[--muted]">
                    {!!item.feedTitle && (
                        <span className="max-w-[10rem] truncate rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            {item.feedTitle}
                        </span>
                    )}
                    {!!item.publishedAt && <span>{formatNewsDate(item.publishedAt)}</span>}
                    <LuExternalLink className="ml-auto size-3.5 text-white/30 transition-colors group-hover:text-[--brand]" />
                </div>
                <p className="mt-2 line-clamp-3 font-semibold leading-snug transition-colors group-hover:text-[--brand]">
                    {item.title}
                </p>
                {!!item.description && (
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-[--muted]">{item.description}</p>
                )}
                {!!item.categories?.length && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.categories.slice(0, 4).map(cat => (
                            <span
                                key={cat}
                                className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60"
                            >
                                {cat}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </a>
    )
}
