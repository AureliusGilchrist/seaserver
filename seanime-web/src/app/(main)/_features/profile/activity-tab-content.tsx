import { AchievementShowcase } from "@/app/(main)/_features/achievement/achievement-showcase"
import * as React from "react"
import { cn } from "@/components/ui/core/styling"
import { LuCalendar, LuBookOpen, LuTv, LuClock, LuActivity } from "react-icons/lu"
import { ActivityHeatmap } from "@/app/(main)/_features/profile/activity-heatmap"
import { StreakCard, ShowcaseCard, RecentAchievementRow } from "./shared-cards"
import { ActivityFeed } from "./activity-feed"

import type { ProfileStats_StreakInfo, ProfileStats_ActivityDay, Handlers_ShowcaseEntry, Handlers_RecentAchievementEntry } from "@/api/generated/types"

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

function TimelineEntry({ day }: { day: ProfileStats_ActivityDay }) {
  const date = new Date(day.date + "T00:00:00")
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center shrink-0 pt-1">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-400 ring-2 ring-blue-400/30 shrink-0" />
        <div className="w-px flex-1 bg-[--border] mt-1 min-h-[1.5rem]" />
      </div>
      <div className="flex-1 min-w-0 pb-3">
        <p className="text-xs text-[--muted] mb-1.5 font-medium">{dateStr}</p>
        <div className="flex flex-wrap gap-3">
          {(day.animeEpisodes ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-full">
              <LuTv className="size-3.5 shrink-0" />
              {day.animeEpisodes} {day.animeEpisodes === 1 ? "episode" : "episodes"}
            </span>
          )}
          {(day.mangaChapters ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <LuBookOpen className="size-3.5 shrink-0" />
              {day.mangaChapters} {day.mangaChapters === 1 ? "chapter" : "chapters"}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ActivityTabContent({
  animeStreak,
  mangaStreak,
  activityHeatmap,
  showcase,
  recentAchievements,
  editable,
  anilistProfile
}: ActivityTabContentProps) {
  const activeDays = React.useMemo(
    () => [...(activityHeatmap ?? [])].filter(d => (d.totalActivity ?? 0) > 0).reverse(),
    [activityHeatmap],
  )

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

        {/* Center — scrollable timeline */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <LuActivity className="text-blue-400" />
            Timeline
          </h2>
          <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-0">
            {activeDays.length === 0 ? (
              <p className="text-[--muted] text-sm py-4">No activity recorded yet.</p>
            ) : activeDays.map(day => (
              <TimelineEntry key={day.date} day={day} />
            ))}
          </div>
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
