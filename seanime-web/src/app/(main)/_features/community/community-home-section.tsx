import { useGetCommunityProfiles } from "@/api/hooks/community.hooks"
import { LevelRingAvatar } from "@/app/(main)/community/page"
import { SeaLink } from "@/components/shared/sea-link"
import { formatNumber } from "@/lib/helpers/number"
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

    return (
        <div data-community-home-section className="relative z-[1] mx-4 md:mx-6 lg:mx-8 rounded-3xl border border-white/10 bg-black/25 backdrop-blur-2xl shadow-xl shadow-black/20 p-5 lg:p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                    <LuUsers className="text-brand-300" />
                    Community
                </h2>
                <SeaLink href="/community" className="text-sm text-white/70 hover:text-white">View all →</SeaLink>
            </div>

            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat icon={<LuUsers className="size-4" />} label="Profiles" value={formatNumber(stats.totalProfiles)} />
                    <Stat icon={<LuStar className="size-4" />} label="Total XP" value={formatNumber(stats.totalXP)} />
                    <Stat icon={<LuTrophy className="size-4" />} label="Achievements" value={formatNumber(stats.totalAchievements)} />
                    <Stat icon={<LuZap className="size-4" />} label="Highest Level" value={formatNumber(stats.highestLevel)} />
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {profiles.length === 0 && (
                    <p className="col-span-full text-sm text-white/60">No community profiles yet.</p>
                )}
                {profiles.map((profile: any) => (
                    <SeaLink key={profile.id} href={`/profile/user?id=${profile.id}`}>
                        <div className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-2xl hover:bg-white/10 hover:border-[--brand]/50 hover:-translate-y-0.5 transition-all">
                            <LevelRingAvatar
                                profile={profile}
                                size={56}
                                xpBarFillOverride={profile.xpBarFillCss || undefined}
                            />
                            <div className="text-center min-w-0 w-full">
                                <p className="text-sm font-semibold truncate">{profile.name}</p>
                                <p className="text-xs text-white/60">Lv. {formatNumber(profile.currentLevel)} · {formatNumber(profile.totalXP)} XP</p>
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
        <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex items-center gap-3 backdrop-blur-md">
            <div className="flex items-center justify-center size-9 rounded-xl bg-gradient-to-br from-brand-400/40 to-brand-600/30 text-white">{icon}</div>
            <div>
                <p className="text-xl font-extrabold leading-none">{value}</p>
                <p className="text-[11px] uppercase tracking-wider text-white/60 mt-1">{label}</p>
            </div>
        </div>
    )
}
