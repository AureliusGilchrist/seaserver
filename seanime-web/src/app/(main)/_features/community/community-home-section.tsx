import { useGetCommunityProfiles } from "@/api/hooks/community.hooks"
import { LevelRingAvatar } from "@/app/(main)/community/page"
import { SeaLink } from "@/components/shared/sea-link"
import * as React from "react"
import { LuStar, LuTrophy, LuUsers, LuZap } from "react-icons/lu"

const MAX_PROFILES = 8

/** Community stats and top profiles, shown on the landing page. */
export function CommunityHomeSection() {
    const { data } = useGetCommunityProfiles()

    const profiles = React.useMemo(
        () => [...(data?.profiles ?? [])].sort((a: any, b: any) => b.totalXP - a.totalXP).slice(0, MAX_PROFILES),
        [data?.profiles],
    )
    const stats = data?.aggregateStats

    if (profiles.length === 0) return null

    return (
        <div data-community-home-section className="px-4 md:px-6 lg:px-8 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                    <LuUsers className="text-brand-300" />
                    Community
                </h2>
                <SeaLink href="/community" className="text-sm text-[--muted] hover:text-white">View all</SeaLink>
            </div>

            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat icon={<LuUsers className="size-4" />} label="Profiles" value={stats.totalProfiles} />
                    <Stat icon={<LuStar className="size-4" />} label="Total XP" value={stats.totalXP.toLocaleString()} />
                    <Stat icon={<LuTrophy className="size-4" />} label="Achievements" value={stats.totalAchievements} />
                    <Stat icon={<LuZap className="size-4" />} label="Highest Level" value={stats.highestLevel} />
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {profiles.map((profile: any) => (
                    <SeaLink key={profile.id} href={`/profile/user?id=${profile.id}`}>
                        <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-[--subtle] hover:bg-[--subtle-highlight] transition-colors">
                            <LevelRingAvatar
                                profile={profile}
                                size={56}
                                xpBarFillOverride={profile.xpBarFillCss || undefined}
                            />
                            <div className="text-center min-w-0 w-full">
                                <p className="text-sm font-semibold truncate">{profile.name}</p>
                                <p className="text-xs text-[--muted]">Lv. {profile.currentLevel} · {profile.totalXP.toLocaleString()} XP</p>
                            </div>
                        </div>
                    </SeaLink>
                ))}
            </div>
        </div>
    )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="bg-[--subtle] rounded-lg p-3 flex items-center gap-3">
            <div className="text-brand-300">{icon}</div>
            <div>
                <p className="text-lg font-bold">{value}</p>
                <p className="text-xs text-[--muted]">{label}</p>
            </div>
        </div>
    )
}
