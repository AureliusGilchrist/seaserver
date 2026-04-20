import { AchievementShowcase } from "@/app/(main)/_features/achievement/achievement-showcase"
import { useGetTimeline } from "@/api/hooks/community.hooks"
import * as React from "react"
import { cn } from "@/components/ui/core/styling"
import { LuCalendar, LuBookOpen, LuTv, LuClock, LuActivity, LuScan, LuFileCheck, LuFileX, LuPencil, LuTrash } from "react-icons/lu"
import { ActivityHeatmap } from "@/app/(main)/_features/profile/activity-heatmap"
import { StreakCard, ShowcaseCard, RecentAchievementRow } from "./shared-cards"
import { ActivityFeed } from "./activity-feed"

import type {
  ProfileStats_StreakInfo,
  ProfileStats_ActivityDay,
  Handlers_ShowcaseEntry,
  Handlers_RecentAchievementEntry,
  Handlers_TimelineEvent,
} from "@/api/generated/types"

export interface ActivityTabContentProps {
  animeStreak?: ProfileStats_StreakInfo
  mangaStreak?: ProfileStats_StreakInfo
  activityHeatmap?: ProfileStats_ActivityDay[]
  showcase?: Handlers_ShowcaseEntry[]
  recentAchievements?: Handlers_RecentAchievementEntry[]
  editable?: boolean
  anilistProfile?: {
    avatar?: string
    banner?: string
    bio?: string
    name?: string
  }
}

// ────────────────────────── Event rendering helpers ──────────────────────────

const EVENT_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bgColor: string }> = {
  episode_watched:      { icon: LuTv,        label: "Watched",        color: "text-blue-300",    bgColor: "bg-blue-500/10" },
  manga_chapter_read:   { icon: LuBookOpen,  label: "Read",           color: "text-emerald-300", bgColor: "bg-emerald-500/10" },
  library_scanned:      { icon: LuScan,      label: "Library scan",   color: "text-yellow-300",  bgColor: "bg-yellow-500/10" },
  file_matched:         { icon: LuFileCheck, label: "File matched",   color: "text-cyan-300",    bgColor: "bg-cyan-500/10" },
  file_unmatched:       { icon: LuFileX,     label: "File unmatched", color: "text-orange-300",  bgColor: "bg-orange-500/10" },
  anilist_entry_edited: { icon: LuPencil,    label: "Entry edited",   color: "text-violet-300",  bgColor: "bg-violet-500/10" },
  anilist_entry_deleted:{ icon: LuTrash,     label: "Entry deleted",  color: "text-red-300",     bgColor: "bg-red-500/10" },
}

function parseMetadata(raw: string): Record<string, any> | null {
  try { return JSON.parse(raw) } catch { return null }
}

function formatEventDescription(event: Handlers_TimelineEvent): string {
  const meta = parseMetadata(event.metadata)
  const cfg = EVENT_CONFIG[event.eventType]
  const title = event.mediaTitle || (event.mediaId > 0 ? `Media #${event.mediaId}` : "")

  switch (event.eventType) {
    case "episode_watched": {
      const ep = meta?.episode
      return ep != null ? `Watched Episode ${ep}${title ? ` of ${title}` : ""}` : `Watched${title ? ` ${title}` : ""}`
    }
    case "manga_chapter_read": {
      const ch = meta?.chapter
      return ch != null ? `Read Chapter ${ch}${title ? ` of ${title}` : ""}` : `Read${title ? ` ${title}` : ""}`
    }
    case "file_matched":
    case "file_unmatched": {
      const filepath = meta?.filepath || meta?.filename || ""
      return filepath ? `${cfg?.label}: ${filepath}` : cfg?.label || event.eventType
    }
    default:
      return cfg?.label || event.eventType
  }
}

// ────────────────────────── Timeline event card ──────────────────────────

function TimelineEventCard({ event }: { event: Handlers_TimelineEvent }) {
  const cfg = EVENT_CONFIG[event.eventType] || { icon: LuActivity, label: event.eventType, color: "text-gray-300", bgColor: "bg-gray-500/10" }
  const Icon = cfg.icon
  const time = new Date(event.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

  return (
    <div className="flex items-start gap-3 group">
      <div className="flex flex-col items-center shrink-0 pt-1">
        <div className={cn("w-2.5 h-2.5 rounded-full ring-2 shrink-0",
          event.mediaType === "anime" ? "bg-blue-400 ring-blue-400/30" :
          event.mediaType === "manga" ? "bg-emerald-400 ring-emerald-400/30" :
          "bg-gray-400 ring-gray-400/30"
        )} />
        <div className="w-px flex-1 bg-[--border] mt-1 min-h-[1rem]" />
      </div>
      <div className="flex-1 min-w-0 pb-3">
        <div className="flex items-start gap-2.5">
          {event.mediaImage && (
            <img
              src={event.mediaImage}
              alt=""
              className="w-10 h-14 rounded object-cover shrink-0 border border-[--border]"
              loading="lazy"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">{formatEventDescription(event)}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full", cfg.color, cfg.bgColor)}>
                <Icon className="size-3 shrink-0" />
                {cfg.label}
              </span>
              <span className="text-xs text-[--muted]">{time}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────── Day separator ──────────────────────────

function DaySeparator({ date }: { date: string }) {
  const d = new Date(date + "T00:00:00")
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  let label: string
  if (d.toDateString() === today.toDateString()) {
    label = "Today"
  } else if (d.toDateString() === yesterday.toDateString()) {
    label = "Yesterday"
  } else {
    label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-[--border]" />
      <span className="text-xs font-semibold text-[--muted] uppercase tracking-wide whitespace-nowrap">{label}</span>
      <div className="h-px flex-1 bg-[--border]" />
    </div>
  )
}

// ────────────────────────── Infinite scroll timeline ──────────────────────────

function InfiniteTimeline() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useGetTimeline(50)
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const allEvents = React.useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((p) => p?.events ?? [])
  }, [data])

  const groupedByDay = React.useMemo(() => {
    const groups: { date: string; events: Handlers_TimelineEvent[] }[] = []
    let currentDate = ""
    for (const event of allEvents) {
      const day = event.createdAt.slice(0, 10)
      if (day !== currentDate) {
        currentDate = day
        groups.push({ date: day, events: [] })
      }
      groups[groups.length - 1].events.push(event)
    }
    return groups
  }, [allEvents])

  if (isLoading) {
    return <p className="text-[--muted] text-sm py-4">Loading timeline...</p>
  }

  if (allEvents.length === 0) {
    return <p className="text-[--muted] text-sm py-4">No activity recorded yet.</p>
  }

  return (
    <>
      {groupedByDay.map((group) => (
        <React.Fragment key={group.date}>
          <DaySeparator date={group.date} />
          {group.events.map((event) => (
            <TimelineEventCard key={event.id} event={event} />
          ))}
        </React.Fragment>
      ))}
      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && (
        <p className="text-[--muted] text-xs text-center py-2">Loading more...</p>
      )}
    </>
  )
}

// ────────────────────────── Main component ──────────────────────────

export function ActivityTabContent({
  animeStreak,
  mangaStreak,
  activityHeatmap,
  showcase,
  recentAchievements,
  editable,
  anilistProfile,
}: ActivityTabContentProps) {
  return (
    <>
      <ActivityFeed anilistProfile={anilistProfile} />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-6 mt-6 items-start">

        {/* Left column — streaks + compact heatmap */}
        <div className="space-y-4">
          <StreakCard label="Anime Streak" icon={<LuTv className="text-lg" />} streak={animeStreak} />
          <StreakCard label="Manga Streak" icon={<LuBookOpen className="text-lg" />} streak={mangaStreak} />
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-[--muted] uppercase tracking-wide flex items-center gap-1.5">
              <LuCalendar className="text-blue-400" />
              Activity (90 days)
            </h2>
            <ActivityHeatmap days={activityHeatmap} compact />
          </div>
        </div>

        {/* Center — infinite scroll timeline */}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <LuActivity className="text-blue-400" />
            Timeline
          </h2>
          <InfiniteTimeline />
        </div>

        {/* Right column — showcase + recent achievements */}
        <div className="space-y-4">
          {editable ? (
            <AchievementShowcase />
          ) : (showcase && showcase.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-[--muted] uppercase tracking-wide">Showcase</h2>
              <div className="grid grid-cols-2 gap-2">
                {showcase.map((entry: any) => (
                  <ShowcaseCard key={entry.slot} entry={entry} />
                ))}
              </div>
            </div>
          ))}
          {recentAchievements && recentAchievements.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-[--muted] uppercase tracking-wide flex items-center gap-1.5">
                <LuClock className="text-emerald-400" />
                Recent Achievements
              </h2>
              <div className="space-y-1.5">
                {recentAchievements.slice(0, 10).map((ach: any) => (
                  <RecentAchievementRow key={`${ach.key}-${ach.tier}`} entry={ach} />
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
