import { useAnilistListRecentAiringAnime } from "@/api/hooks/anilist.hooks"
import { SeaContextMenu } from "@/app/(main)/_features/context-menu/sea-context-menu"
import { useMediaPreviewModal } from "@/app/(main)/_features/media/_containers/media-preview-modal"
import { SeaImage } from "@/components/shared/sea-image"
import { SeaLink } from "@/components/shared/sea-link"
import { ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuTrigger } from "@/components/ui/context-menu"
import { cn } from "@/components/ui/core/styling"
import { format, isToday, subDays } from "date-fns"
import { addDays } from "date-fns/addDays"
import { isSameDay } from "date-fns/isSameDay"
import { displayTitle } from "@/lib/helpers/media"
import { useRouter } from "@/lib/navigation"
import React from "react"
import { LuCalendarDays, LuClock3, LuDock, LuEye, LuTv } from "react-icons/lu"


export function DiscoverAiringSchedule() {
    // The window is fixed once per hour. Computed from `new Date()` on every render, its bounds
    // changed every second, so each render asked for a new query key: the query restarted, the
    // server-side caches never matched, and the schedule could sit loading indefinitely.
    const hourBucket = Math.floor(Date.now() / 3_600_000)
    const airingWindow = React.useMemo(() => {
        const now = new Date(hourBucket * 3_600_000)
        return {
            airingAt_lesser: Math.floor(addDays(now, 14).getTime() / 1000),
            airingAt_greater: Math.floor(subDays(now, 2).getTime() / 1000),
        }
    }, [hourBucket])

    const { data, isLoading, isError } = useAnilistListRecentAiringAnime({
        page: 1,
        perPage: 50,
        ...airingWindow,
        notYetAired: true,
        sort: ["TIME"],
    })
    const { data: data2, isLoading: isLoading2 } = useAnilistListRecentAiringAnime({
        page: 2,
        perPage: 50,
        ...airingWindow,
        notYetAired: true,
        sort: ["TIME"],
    })

    const media = React.useMemo(() => [...(data?.Page?.airingSchedules?.filter(item => item?.media?.isAdult === false
        && item?.media?.type === "ANIME"
        && item?.media?.countryOfOrigin === "JP"
        && item?.media?.format !== "TV_SHORT",
    ).filter(Boolean) || []),
    ...(data2?.Page?.airingSchedules?.filter(item => item?.media?.isAdult === false
        && item?.media?.type === "ANIME"
        && item?.media?.countryOfOrigin === "JP"
        && item?.media?.format !== "TV_SHORT",
    ).filter(Boolean) || []),
    ], [data, data2])

    const router = useRouter()
    const { setPreviewModalMediaId } = useMediaPreviewModal()

    const days = React.useMemo(() => {

        // Ensure startOfWeek aligns with the correct day
        const start = subDays(new Date(), 1)

        const daysArray = []
        let day = new Date(start.setHours(0, 0, 0, 0))  // Ensure the day starts at midnight
        const endDate = addDays(day, 14)  // 14-day range from the current start

        while (day <= endDate) {
            const upcomingMedia = media.filter((item) => !!item?.airingAt && isSameDay(new Date(item.airingAt * 1000), day)).map((item) => {
                return {
                    id: item.id + item?.episode!,
                    name: displayTitle(item.media?.title),
                    time: format(new Date(item?.airingAt! * 1000), "h:mm a"),
                    datetime: format(new Date(item?.airingAt! * 1000), "yyyy-MM-dd'T'HH:mm"),
                    href: `/entry?id=${item.id}`,
                    media: item.media,
                    episode: item?.media?.nextAiringEpisode?.episode || 1,
                }
            })

            daysArray.push({
                date: format(day, "yyyy-MM-dd'T'HH:mm"),
                isToday: isToday(day),
                events: upcomingMedia,
            })
            day = addDays(day, 1)
        }
        return daysArray
    }, [media])

    if (isLoading || isLoading2) return (
        <div className="space-y-6" data-discover-airing-schedule-loading>
            <div className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" />
            <div className="grid gap-3 md:grid-cols-2">
                {[0, 1, 2, 3].map(item => (
                    <div key={item} className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />
                ))}
            </div>
        </div>
    )

    if (isError && !data) {
        return (
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] px-6 py-12 text-center shadow-[0_12px_28px_rgba(0,0,0,0.28)]" data-discover-airing-schedule-error>
                <LuCalendarDays className="mx-auto mb-3 size-8 text-[--muted]" />
                <h2 className="text-lg font-semibold">Schedule unavailable</h2>
                <p className="mt-2 text-sm text-[--muted]">AniList's airing calendar couldn't be reached. Try again in a moment.</p>
            </div>
        )
    }

    const releaseCount = days.reduce((total, day) => total + day.events.length, 0)
    const animeCount = new Set(days.flatMap(day => day.events.map(event => event.media?.id))).size
    const visibleDays = days.filter(day => day.events.length > 0)

    return (
        <div className="relative z-[5] space-y-7" data-discover-airing-schedule-container>
            <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(125deg,rgba(97,82,223,0.22),rgba(255,255,255,0.045)_48%,rgba(15,23,42,0.45))] p-6 shadow-[0_20px_55px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-8" data-discover-airing-schedule-hero>
                <div className="pointer-events-none absolute -right-16 -top-32 size-80 rounded-full bg-brand-500/15 blur-3xl" />
                <div className="relative flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
                    <div className="max-w-2xl">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-100">
                            <LuCalendarDays className="size-4" />
                            AniList schedule
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Airing calendar</h2>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-white/65 sm:text-base">
                            Keep up with what’s airing across the next two weeks.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:min-w-[17rem]">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-xs font-medium text-white/55"><LuClock3 className="size-4" /> Episodes</div>
                            <p className="mt-2 text-2xl font-bold tabular-nums text-white">{releaseCount}</p>
                            <p className="mt-1 text-xs text-white/45">scheduled to air</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-xs font-medium text-white/55"><LuTv className="size-4" /> Series</div>
                            <p className="mt-2 text-2xl font-bold tabular-nums text-white">{animeCount}</p>
                            <p className="mt-1 text-xs text-white/45">in this window</p>
                        </div>
                    </div>
                </div>
            </section>

            {visibleDays.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] px-6 py-14 text-center shadow-[0_12px_28px_rgba(0,0,0,0.24)]" data-discover-airing-schedule-empty>
                    <LuCalendarDays className="mx-auto mb-3 size-8 text-[--muted]" />
                    <h3 className="font-semibold text-white">Nothing on the calendar just yet</h3>
                    <p className="mt-2 text-sm text-[--muted]">Check back soon for upcoming episode airings.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {visibleDays.map(day => {
                        const date = new Date(day.date)
                        const sortedEvents = day.events.toSorted((a, b) => a.datetime.localeCompare(b.datetime))
                        return (
                            <section
                                key={day.date}
                                className={cn(
                                    "overflow-hidden rounded-3xl border bg-black/20 shadow-[0_14px_36px_rgba(0,0,0,0.24)] backdrop-blur-md",
                                    day.isToday ? "border-brand-300/30 ring-1 ring-brand-300/10" : "border-white/[0.08]",
                                )}
                                data-discover-airing-schedule-day
                            >
                                <header className="flex items-center justify-between gap-4 border-b border-white/[0.08] bg-white/[0.025] px-5 py-4 sm:px-6">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className={cn(
                                            "flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl border",
                                            day.isToday ? "border-brand-300/30 bg-brand-400/15 text-brand-100" : "border-white/10 bg-white/[0.04] text-white",
                                        )}>
                                            <span className="text-lg font-bold leading-none tabular-nums">{format(date, "d")}</span>
                                            <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider opacity-65">{format(date, "MMM")}</span>
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="truncate text-base font-semibold text-white sm:text-lg">{format(date, "EEEE, MMMM d")}</h3>
                                            <p className="mt-0.5 text-xs text-white/45">{format(date, "yyyy")}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {day.isToday && <span className="rounded-full border border-brand-300/20 bg-brand-400/10 px-2.5 py-1 text-[11px] font-semibold text-brand-100">Today</span>}
                                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/65">
                                            {day.events.length} {day.events.length === 1 ? "episode" : "episodes"}
                                        </span>
                                    </div>
                                </header>
                                <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 2xl:grid-cols-3">
                                    {sortedEvents.map(event => (
                                        <SeaContextMenu
                                            key={event.id}
                                            content={<ContextMenuGroup>
                                                <ContextMenuLabel className="my-2 line-clamp-2 py-0 text-[--muted]">
                                                    {displayTitle(event.media?.title)}
                                                </ContextMenuLabel>
                                                <ContextMenuItem onClick={() => setPreviewModalMediaId(event.media?.id || 0, "anime")}>
                                                    <LuEye /> Preview
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => router.push(`/entry?id=${event.media?.id}`)}>
                                                    <LuDock /> Open page
                                                </ContextMenuItem>
                                            </ContextMenuGroup>}
                                        >
                                            <ContextMenuTrigger>
                                                <article className="group relative flex min-h-32 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] transition duration-200 hover:-translate-y-0.5 hover:border-brand-300/25 hover:bg-white/[0.065] hover:shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
                                                    <div className="relative w-24 shrink-0 overflow-hidden sm:w-28">
                                                        <SeaImage
                                                            src={event.media?.coverImage?.large || event.media?.bannerImage || "/no-cover.png"}
                                                            alt={displayTitle(event.media?.title)}
                                                            fill
                                                            quality={80}
                                                            sizes="7rem"
                                                            className="object-cover transition duration-500 group-hover:scale-105"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/20" />
                                                        <span className="absolute bottom-2 left-2 rounded-lg border border-white/15 bg-black/65 px-2 py-1 text-[10px] font-semibold text-white shadow backdrop-blur-md">
                                                            EP {event.episode}
                                                        </span>
                                                    </div>
                                                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-3.5 sm:p-4">
                                                        <div className="min-w-0">
                                                            <SeaLink href={`/entry?id=${event.media?.id}`} className="line-clamp-2 text-sm font-semibold leading-5 text-white transition-colors group-hover:text-brand-100 sm:text-[15px]">
                                                                {displayTitle(event.media?.title)}
                                                            </SeaLink>
                                                            <p className="mt-1.5 text-xs text-white/45">New episode</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs font-medium text-white/70">
                                                            <LuClock3 className="size-3.5 text-brand-200/80" />
                                                            <time dateTime={event.datetime}>{event.time}</time>
                                                        </div>
                                                    </div>
                                                </article>
                                            </ContextMenuTrigger>
                                        </SeaContextMenu>
                                    ))}
                                </div>
                            </section>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
