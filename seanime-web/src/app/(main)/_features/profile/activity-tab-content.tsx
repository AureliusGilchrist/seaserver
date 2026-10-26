import { AchievementShowcase } from "@/app/(main)/_features/achievement/achievement-showcase"
import { useGetTimeline } from "@/api/hooks/community.hooks"
import * as React from "react"
import { cn } from "@/components/ui/core/styling"
import { SeaLink } from "@/components/shared/sea-link"
import { useRewards } from "@/lib/rewards/reward-provider"
import { LuCalendar, LuBookOpen, LuTv, LuClock, LuActivity, LuScan, LuFileCheck, LuFileX, LuPencil, LuTrash, LuTrophy, LuCheck, LuFlag, LuPlay, LuFlagTriangleRight } from "react-icons/lu"
import { Tooltip } from "@/components/ui/tooltip"
import { TIMELINE_FEED_KEY, TimelineFeedItem, useTimelineFeed } from "@/api/hooks/profile-timeline.hooks"
import { TimelineCard, TimelineComposer } from "@/app/(main)/_features/profile/profile-timeline"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { ActivityHeatmap } from "@/app/(main)/_features/profile/activity-heatmap"
import { StreakCard, ShowcaseCard, RecentAchievementRow } from "./shared-cards"

import type {
  ProfileStats_StreakInfo,
  ProfileStats_ActivityDay,
} from "@/api/generated/types"
type Handlers_ShowcaseEntry = any
type Handlers_RecentAchievementEntry = any
/** One event from GET /api/v1/profile/timeline (internal/handlers/timeline.go). */
type Handlers_TimelineEvent = {
  id: number
  eventType: string
  mediaId: number
  metadata: string
  createdAt: string
  mediaTitle?: string
  mediaImage?: string
  mediaType: "anime" | "manga" | ""
  achievementIconSvg?: string
  achievementDesc?: string
  /** The AniList list entry: status and YYYY-MM-DD dates (empty when unset). */
  entryStatus?: string
  entryStartedAt?: string
  entryCompletedAt?: string
  /** The first watch/read of this media recorded here. */
  firstActivityAt?: string
}

export interface ActivityTabContentProps {
  animeStreak?: ProfileStats_StreakInfo
  mangaStreak?: ProfileStats_StreakInfo
  activityHeatmap?: ProfileStats_ActivityDay[]
  showcase?: Handlers_ShowcaseEntry[]
  recentAchievements?: Handlers_RecentAchievementEntry[]
  editable?: boolean
  /** When set, the timeline reads this profile's events instead of the signed-in user's. */
  userId?: number
  anilistProfile?: {
    avatar?: string
    banner?: string
    bio?: string
    name?: string
  }
}

// ────────────────────────── Event rendering helpers ──────────────────────────

const EVENT_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bgColor: string }> = {
  episode_watched:      { icon: LuTv,        label: "Watched",        color: "text-emerald-300", bgColor: "bg-emerald-500/10" },
  manga_chapter_read:   { icon: LuBookOpen,  label: "Read",           color: "text-emerald-300", bgColor: "bg-emerald-500/10" },
  library_scanned:      { icon: LuScan,      label: "Library scan",   color: "text-yellow-300",  bgColor: "bg-yellow-500/10" },
  file_matched:         { icon: LuFileCheck, label: "File matched",   color: "text-cyan-300",    bgColor: "bg-cyan-500/10" },
  file_unmatched:       { icon: LuFileX,     label: "File unmatched", color: "text-orange-300",  bgColor: "bg-orange-500/10" },
  anilist_entry_edited: { icon: LuPencil,    label: "Entry edited",   color: "text-violet-300",  bgColor: "bg-violet-500/10" },
  anilist_entry_deleted:{ icon: LuTrash,     label: "Entry deleted",  color: "text-red-300",     bgColor: "bg-red-500/10" },
  achievement_unlocked: { icon: LuTrophy,    label: "Achievement",    color: "text-yellow-300",  bgColor: "bg-yellow-500/10" },
  series_complete:      { icon: LuCheck,     label: "Series completed", color: "text-emerald-300", bgColor: "bg-emerald-500/10" },
}

function parseMetadata(raw: string): Record<string, any> | null {
  try { return JSON.parse(raw) as Record<string, any> } catch { return null }
}

// ────────────────────────── Consecutive watch/read merging ──────────────────────────

// Two watch/read events of the same media merge into one timeline entry
// ("Watched Episodes 1-2 of X") when they happen within this window of each other.
const MERGE_DEAD_PERIOD_MS = 24 * 60 * 60 * 1000

type MergedTimelineEvent = Handlers_TimelineEvent & {
  __mergedEpisodes?: (number | string)[]
  __mergedChapters?: (number | string)[]
}

// Compresses a list of episode/chapter numbers into range notation: [1,2,3,5] → "1-3, 5".
// Non-numeric values (e.g. chapter "10.5") fall back to a plain sorted list.
function compressRanges(values: (number | string)[]): string {
  const nums = values.map(v => Number(v))
  if (nums.some(n => !Number.isFinite(n) || !Number.isInteger(n))) {
    return [...values].sort((a, b) => Number(a) - Number(b)).join(", ")
  }
  const unique = [...new Set(nums)].sort((a, b) => a - b)
  const parts: string[] = []
  let start = unique[0]
  let prev = unique[0]
  for (let i = 1; i <= unique.length; i++) {
    const cur = unique[i]
    if (cur != null && cur === prev + 1) {
      prev = cur
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    if (cur != null) {
      start = cur
      prev = cur
    }
  }
  return parts.join(", ")
}

// Collapses episode-watched / chapter-read events of the same media into one entry when
// each successive event is within MERGE_DEAD_PERIOD_MS of the previous one (events arrive
// newest-first). The merged entry keeps the newest event's position and timestamp.
function mergeConsecutiveWatchEvents(events: Handlers_TimelineEvent[]): MergedTimelineEvent[] {
  const out: MergedTimelineEvent[] = []
  const openGroups = new Map<string, { index: number; lastTime: number }>()

  for (const event of events) {
    const isEpisode = event.eventType === "episode_watched"
    const isChapter = event.eventType === "manga_chapter_read"
    const meta = (isEpisode || isChapter) ? parseMetadata(event.metadata) : null
    const value = isEpisode ? meta?.episode : isChapter ? meta?.chapter : null

    if ((!isEpisode && !isChapter) || !event.mediaId || value == null) {
      out.push(event)
      continue
    }

    const key = `${event.eventType}:${event.mediaId}`
    const time = new Date(event.createdAt).getTime()
    const group = openGroups.get(key)

    if (group && (group.lastTime - time) <= MERGE_DEAD_PERIOD_MS) {
      const target = out[group.index]
      if (isEpisode) (target.__mergedEpisodes ??= []).push(value)
      else (target.__mergedChapters ??= []).push(value)
      group.lastTime = time
      continue
    }

    const merged: MergedTimelineEvent = { ...event }
    if (isEpisode) merged.__mergedEpisodes = [value]
    else merged.__mergedChapters = [value]
    out.push(merged)
    openGroups.set(key, { index: out.length - 1, lastTime: time })
  }

  return out
}

function formatEventDescription(event: MergedTimelineEvent): string {
  const meta = parseMetadata(event.metadata)
  const cfg = EVENT_CONFIG[event.eventType]
  // Prefer the resolved title, then the title embedded in the event metadata at record
  // time, and only then the raw "Media #N" fallback.
  const metaTitle = typeof meta?.title === "string" ? meta.title : ""
  const title = event.mediaTitle || metaTitle || (event.mediaId > 0 ? `Media #${event.mediaId}` : "")

  switch (event.eventType) {
    case "episode_watched": {
      // Dedupe merged values — historical data contains double-recorded episodes
      const merged = event.__mergedEpisodes
        ? [...new Set<string>((event.__mergedEpisodes as (number | string)[]).map(String))]
        : undefined
      if (merged && merged.length > 1) {
        return `Watched Episodes ${compressRanges(merged)}${title ? ` of ${title}` : ""}`
      }
      const ep = merged?.[0] ?? meta?.episode
      return ep != null ? `Watched Episode ${ep}${title ? ` of ${title}` : ""}` : `Watched${title ? ` ${title}` : ""}`
    }
    case "manga_chapter_read": {
      const merged = event.__mergedChapters
        ? [...new Set<string>((event.__mergedChapters as (number | string)[]).map(String))]
        : undefined
      if (merged && merged.length > 1) {
        return `Read Chapters ${compressRanges(merged)}${title ? ` of ${title}` : ""}`
      }
      const ch = merged?.[0] ?? meta?.chapter
      return ch != null ? `Read Chapter ${ch}${title ? ` of ${title}` : ""}` : `Read${title ? ` ${title}` : ""}`
    }
    case "file_matched":
    case "file_unmatched": {
      const filepath = meta?.filepath || meta?.filename || ""
      return filepath ? `${cfg?.label}: ${filepath}` : cfg?.label || event.eventType
    }
    case "anilist_entry_edited": {
      const status = typeof meta?.status === "string" ? meta.status : ""
      const progress = typeof meta?.progress === "number" ? meta.progress : null
      const score = typeof meta?.score === "number" ? meta.score : null

      if (status === "CURRENT") return `Started${title ? ` ${title}` : ""}`
      if (status === "PLANNING") return `Planned${title ? ` ${title}` : ""}`
      if (status === "COMPLETED") return `Completed${title ? ` ${title}` : ""}`
      if (status === "PAUSED") return `Paused${title ? ` ${title}` : ""}`
      if (status === "DROPPED") return `Dropped${title ? ` ${title}` : ""}`

      if (progress != null) return `Updated progress to ${progress}${title ? ` for ${title}` : ""}`
      if (score != null) return `Rated ${score}${title ? ` for ${title}` : ""}`

      return `Updated entry${title ? ` for ${title}` : ""}`
    }
    case "achievement_unlocked": {
      const name = typeof meta?.name === "string" ? meta.name : ""
      const tierName = typeof meta?.tierName === "string" ? meta.tierName : ""
      const xp = typeof meta?.xp === "number" ? meta.xp : null
      const base = name ? `Unlocked “${name}”` : "Unlocked an achievement"
      const tierStr = tierName ? ` — ${tierName}` : ""
      const xpStr = xp != null ? ` (+${xp} XP)` : ""
      return base + tierStr + xpStr
    }
    case "series_complete": {
      if (!title) return "Finished a series"
      return meta?.type === "manga" ? `Finished reading ${title}` : `Finished watching ${title}`
    }
    default:
      return cfg?.label || event.eventType
  }
}

// ────────────────────────── Timeline event card ──────────────────────────

function getEventHref(event: Handlers_TimelineEvent): string | null {
  const mediaId = Number(event.mediaId) || 0
  if (mediaId > 0) {
    const meta = parseMetadata(event.metadata)
    const isManga = event.mediaType === "manga" || event.eventType === "manga_chapter_read" || meta?.type === "manga"
    return isManga ? `/manga/entry?id=${mediaId}` : `/entry?id=${mediaId}`
  }
  switch (event.eventType) {
    case "achievement_unlocked": return "/achievements"
    case "library_scanned":
    case "file_matched":
    case "file_unmatched": return "/scan-summaries"
    default: return null
  }
}

// ────────────────────────── Started → Latest journey ──────────────────────────

function parseDay(s: string | undefined | null): Date | null {
  if (!s) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function shortDate(d: Date) {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })
}

function elapsed(from: Date, to: Date) {
  const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000))
  if (days === 0) return "the same day"
  if (days < 45) return `${days} ${days === 1 ? "day" : "days"}`
  const months = Math.round(days / 30.4)
  if (months < 18) return `${months} ${months === 1 ? "month" : "months"}`
  const years = Math.round((days / 365) * 10) / 10
  return `${years} years`
}

/**
 * Two linked entries for a show's newest timeline item: when it was started and where it is now
 * (or when it was finished). Started comes from the AniList entry's start date, falling back to
 * the first watch/read recorded here.
 */
function MediaJourney({ event, accentColor }: { event: MergedTimelineEvent, accentColor: string | null }) {
  const isManga = event.eventType === "manga_chapter_read"
  const startFromList = parseDay(event.entryStartedAt)
  const startFromLocal = parseDay(event.firstActivityAt)
  const started = startFromList ?? startFromLocal
  if (!started) return null

  const latest = new Date(event.createdAt)
  const finished = event.entryStatus === "COMPLETED" ? (parseDay(event.entryCompletedAt) ?? null) : null
  const end = finished ?? latest

  const meta = parseMetadata(event.metadata)
  const values = (isManga ? event.__mergedChapters : event.__mergedEpisodes) ?? []
  const nums = values.map(Number).filter(Number.isFinite)
  const newest = nums.length ? Math.max(...nums) : null
  const total = isManga ? meta?.totalChapters : meta?.totalEpisodes
  const unit = isManga ? "Chapter" : "Episode"
  const latestDetail = newest != null ? `${unit} ${newest}${total ? ` of ${total}` : ""}` : null

  // A start after the end only happens with a wrong list date; show nothing rather than nonsense.
  if (started.getTime() - end.getTime() > 86_400_000) return null

  const accent = accentColor ?? "rgb(var(--color-brand-400))"
  const sameDay = started.toDateString() === end.toDateString()

  return (
    <Tooltip
      side="top"
      trigger={
        <div className="mt-2 flex items-stretch rounded-lg bg-white/[0.03] p-1.5 ring-1 ring-white/[0.06]">
          <JourneyNode icon={LuPlay} label="Started" date={started} detail={startFromList ? null : "first watched here"} accent={accent} muted />
          <div className="relative mx-1 flex min-w-6 flex-1 items-center" aria-hidden>
            <div className="h-px w-full" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 30%, transparent), ${accent})` }} />
            <div className="absolute right-0 size-1.5 rotate-45 border-r border-t" style={{ borderColor: accent }} />
          </div>
          {finished
            ? <JourneyNode icon={LuFlagTriangleRight} label="Finished" date={finished} detail={latestDetail} accent={accent} />
            : <JourneyNode icon={LuFlag} label="Latest" date={latest} detail={latestDetail} accent={accent} />}
        </div>
      }
    >
      <div className="space-y-0.5 text-xs">
        <p>Started {started.toLocaleDateString("en-US", { dateStyle: "long" })}{startFromList ? "" : " (first watch recorded here)"}</p>
        <p>{finished ? "Finished" : "Latest"} {end.toLocaleDateString("en-US", { dateStyle: "long" })}</p>
        <p className="opacity-70">{sameDay ? "Same day" : `${elapsed(started, end)} in`}</p>
      </div>
    </Tooltip>
  )
}

function JourneyNode({ icon: Icon, label, date, detail, accent, muted }: {
  icon: React.ElementType
  label: string
  date: Date
  detail: string | null
  accent: string
  muted?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full"
        style={muted ? { backgroundColor: "rgba(255,255,255,0.06)" } : { backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
      >
        <Icon className="size-3" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-[--muted]">{label}</p>
        <p className="truncate text-xs font-medium">
          {shortDate(date)}
          {detail && <span className="font-normal text-[--muted]"> · {detail}</span>}
        </p>
      </div>
    </div>
  )
}

function TimelineEventCard({ event, showJourney }: { event: MergedTimelineEvent, showJourney?: boolean }) {
  const cfg = EVENT_CONFIG[event.eventType] || { icon: LuActivity, label: event.eventType, color: "text-gray-300", bgColor: "bg-gray-500/10" }
  const Icon = cfg.icon
  const time = new Date(event.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const { activeXPBarSkin } = useRewards()

  // Extract a solid accent color from the XP bar fill gradient
  const accentColor = React.useMemo(() => {
    const fill = activeXPBarSkin?.fillCss
    if (!fill) return null
    if (fill.startsWith("linear-gradient")) {
      return fill.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g)?.[0] ?? null
    }
    return fill
  }, [activeXPBarSkin])

  const isMedia = event.mediaType === "anime" || event.mediaType === "manga"
  const dotStyle = accentColor && isMedia ? { backgroundColor: accentColor, boxShadow: `0 0 0 2px ${accentColor}40` } : undefined
  const badgeIsMedia = event.eventType === "episode_watched" || event.eventType === "manga_chapter_read"
  const badgeStyle = accentColor && badgeIsMedia ? { color: accentColor, backgroundColor: accentColor + "1a" } : undefined

  const isAchievement = event.eventType === "achievement_unlocked"
  const href = getEventHref(event)

  return (
    <div className="flex items-start gap-3 group">
      <div className="flex flex-col items-center shrink-0 pt-1">
        <div
          className={cn("w-2.5 h-2.5 rounded-full ring-2 shrink-0",
            !accentColor && (isMedia ? "bg-emerald-400 ring-emerald-400/30" : isAchievement ? "bg-yellow-400 ring-yellow-400/30" : "bg-gray-400 ring-gray-400/30"),
          )}
          style={dotStyle}
        />
        <div className="w-px flex-1 bg-[--border] mt-1 min-h-[1rem]" />
      </div>
      <div className="flex-1 min-w-0 pb-3">
        <EventWrapper href={href}>
          <div className="flex items-start gap-2.5">
          {isAchievement && event.achievementIconSvg ? (
            <div
              className="w-10 h-10 shrink-0 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-300 p-1.5"
              dangerouslySetInnerHTML={{ __html: event.achievementIconSvg }}
            />
          ) : event.mediaImage ? (
            <img
              src={event.mediaImage}
              alt=""
              className="w-10 h-14 rounded object-cover shrink-0 border border-[--border]"
              loading="lazy"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">{formatEventDescription(event)}</p>
            {isAchievement && event.achievementDesc && (
              <p className="text-xs text-[--muted] mt-0.5 leading-snug">{event.achievementDesc}</p>
            )}
            {showJourney && <MediaJourney event={event} accentColor={accentColor} />}
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={cn("inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full", !badgeStyle && cn(cfg.color, cfg.bgColor))}
                style={badgeStyle}
              >
                <Icon className="size-3 shrink-0" />
                {cfg.label}
              </span>
              <span className="text-xs text-[--muted]">{time}</span>
            </div>
          </div>
          </div>
        </EventWrapper>
      </div>
    </div>
  )
}

function EventWrapper({ href, children }: { href: string | null | undefined, children: React.ReactNode }) {
  if (!href) return <div>{children}</div>
  return <SeaLink href={href} className="block rounded-lg hover:bg-white/5 transition-colors -m-1 p-1">{children}</SeaLink>
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

type TimelineRow = { kind: "event", at: string, event: MergedTimelineEvent } | { kind: "post", at: string, item: TimelineFeedItem }

function InfiniteTimeline({ userId, wallProfileId }: { userId?: number, wallProfileId?: number }) {
  // When viewing someone else's profile, read their timeline — not the signed-in user's.
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useGetTimeline(50, userId)
  // The wall's posts (status posts and messages others left), mixed in by time.
  const posts = useTimelineFeed(wallProfileId, false)
  const qc = useQueryClient()
  useWebsocketMessageListener({
    type: "profile-timeline-updated",
    onMessage: () => qc.invalidateQueries({ queryKey: [TIMELINE_FEED_KEY] }),
  })
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        if (hasNextPage && !isFetchingNextPage) fetchNextPage()
        if (posts.hasNextPage && !posts.isFetchingNextPage) posts.fetchNextPage()
      },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, posts.hasNextPage, posts.isFetchingNextPage, posts.fetchNextPage])

  const allEvents = React.useMemo(() => {
    if (!data?.pages) return []
    // Collapse per-episode/per-chapter spam into "Episodes 1-3"-style entries
    return mergeConsecutiveWatchEvents(data.pages.flatMap((p) => p?.events ?? []))
  }, [data])

  // The newest watch/read item of each show carries its Started -> Latest pair; older ones stay compact.
  const journeyIds = React.useMemo(() => {
    const ids = new Set<number>()
    const seen = new Set<string>()
    for (const event of allEvents) {
      if (event.eventType !== "episode_watched" && event.eventType !== "manga_chapter_read") continue
      const key = `${event.eventType}:${event.mediaId}`
      if (!event.mediaId || seen.has(key)) continue
      seen.add(key)
      ids.add(event.id)
    }
    return ids
  }, [allEvents])

  const postItems = React.useMemo(
    () => (posts.data?.pages.flatMap(p => p.items ?? []) ?? []).filter(i => i.kind === "post"),
    [posts.data],
  )

  const groupedByDay = React.useMemo(() => {
    const rows: TimelineRow[] = [
      ...allEvents.map(event => ({ kind: "event" as const, at: event.createdAt, event })),
      ...postItems.map(item => ({ kind: "post" as const, at: item.createdAt, item })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    const groups: { date: string; rows: TimelineRow[] }[] = []
    let currentDate = ""
    for (const row of rows) {
      const d = new Date(row.at)
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      if (day !== currentDate) {
        currentDate = day
        groups.push({ date: day, rows: [] })
      }
      groups[groups.length - 1].rows.push(row)
    }
    return groups
  }, [allEvents, postItems])

  if (isLoading) {
    return <p className="text-[--muted] text-sm py-4">Loading timeline...</p>
  }

  if (allEvents.length === 0 && postItems.length === 0) {
    return <p className="text-[--muted] text-sm py-4">No activity recorded yet.</p>
  }

  return (
    <>
      {groupedByDay.map((group) => (
        <React.Fragment key={group.date}>
          <DaySeparator date={group.date} />
          {group.rows.map((row) => row.kind === "event"
            ? <TimelineEventCard key={`e-${row.event.id}`} event={row.event} showJourney={journeyIds.has(row.event.id)} />
            : <div key={row.item.key} className="pb-3 pl-5"><TimelineCard item={row.item} /></div>)}
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
  userId,
  anilistProfile,
}: ActivityTabContentProps) {
  const me = useAtomValue(currentProfileAtom)
  // Posts go on the profile being viewed: your own status, or a message on someone else's wall.
  const wallId = userId ?? me?.id
  const isOwn = !!me && wallId === me.id
  return (
    <>
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
        {/* Blurred/darkened panel so the timeline stays readable over decorative page backgrounds */}
        <div className="space-y-1 rounded-xl border border-[--border] bg-black/40 backdrop-blur-md p-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <LuActivity className="text-blue-400" />
            Timeline
          </h2>
          {!!me && !!wallId && (
            <div className="mb-3">
              <TimelineComposer
                wallProfileId={wallId}
                author={me}
                placeholder={isOwn ? "Post an update…" : `Write on ${anilistProfile?.name ?? "their"} wall…`}
              />
            </div>
          )}
          <InfiniteTimeline userId={userId} wallProfileId={wallId} />
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
