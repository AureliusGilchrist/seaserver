import { AchievementShowcase } from "@/app/(main)/_features/achievement/achievement-showcase"
import * as React from "react"
import { cn } from "@/components/ui/core/styling"
import { LuCalendar, LuBookOpen, LuTv, LuClock } from "react-icons/lu"
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

export function ActivityTabContent({
  animeStreak,
  mangaStreak,
  activityHeatmap,
  showcase,
  recentAchievements,
  editable,
  anilistProfile
}: ActivityTabContentProps) {
  return (
    <>
      <ActivityFeed anilistProfile={anilistProfile} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <StreakCard label="Anime Streak" icon={<LuTv className="text-lg" />} streak={animeStreak} />
        <StreakCard label="Manga Streak" icon={<LuBookOpen className="text-lg" />} streak={mangaStreak} />
      </div>
      <div className="space-y-2 mt-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <LuCalendar className="text-blue-400" />
          Activity (90 days)
        </h2>
        <ActivityHeatmap days={activityHeatmap} />
      </div>
      {editable ? (
        <div className="mt-6">
          <AchievementShowcase />
        </div>
      ) : (
        showcase && showcase.length > 0 && (
          <div className="space-y-3 mt-6">
            <h2 className="text-lg font-semibold">Showcase</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {showcase.map((entry: any) => (
                <ShowcaseCard key={entry.slot} entry={entry} />
              ))}
            </div>
          </div>
        )
      )}
      {recentAchievements && recentAchievements.length > 0 && (
        <div className="space-y-3 mt-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <LuClock className="text-emerald-400" />
            Recent Achievements
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {recentAchievements.map((ach: any) => (
              <RecentAchievementRow key={`${ach.key}-${ach.tier}`} entry={ach} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
