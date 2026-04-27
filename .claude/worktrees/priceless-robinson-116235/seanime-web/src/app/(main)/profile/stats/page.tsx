"use client"

import { useGetAniListStats } from "@/api/hooks/anilist.hooks"
import { useGetProfileStats } from "@/api/hooks/profile-stats.hooks"
import {
    ProfileStats_ActivityDay,
    ProfileStats_PersonalityResult,
    ProfileStats_StreakInfo,
    AL_Stats,
} from "@/api/generated/types"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { BarChart, DonutChart, AreaChart } from "@/components/ui/charts"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Separator } from "@/components/ui/separator"
import { Stats } from "@/components/ui/stats"
import React from "react"
import { LuFlame, LuCalendar, LuBookOpen, LuTv, LuStar, LuGlobe, LuHourglass, LuTrophy, LuActivity } from "react-icons/lu"

const formatName: Record<string, string> = {
    TV: "TV",
    TV_SHORT: "TV Short",
    MOVIE: "Movie",
    SPECIAL: "Special",
    OVA: "OVA",
    ONA: "ONA",
    MUSIC: "Music",
}

export default function Page() {
    const [selectedYear, setSelectedYear] = React.useState<number | undefined>(undefined)
    const { data: profileStats, isLoading: profileLoading } = useGetProfileStats(selectedYear)
    const { data: anilistStats, isLoading: anilistLoading } = useGetAniListStats(true)

    const isLoading = profileLoading || anilistLoading

    const currentYear = new Date().getFullYear()
    const yearOptions = React.useMemo(() => {
        const years: (number | undefined)[] = [undefined]
        for (let y = currentYear; y >= currentYear - 5; y--) {
            years.push(y)
        }
        return years
    }, [currentYear])

    if (isLoading) {
        return (
            <PageWrapper className="p-4 sm:p-8 flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner />
            </PageWrapper>
        )
    }

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-8">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <LuActivity className="text-3xl text-brand-300" />
                    <h1 className="text-2xl font-bold">Profile Stats</h1>
                </div>

                {/* Hero Stats */}
                <HeroStats anilistStats={anilistStats} profileStats={profileStats} />

                <Separator />

                {/* Streak Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StreakCard
                        label="Anime Watching Streak"
                        icon={<LuTv className="text-lg" />}
                        streak={profileStats?.animeStreak}
                    />
                    <StreakCard
                        label="Manga Reading Streak"
                        icon={<LuBookOpen className="text-lg" />}
                        streak={profileStats?.mangaStreak}
                    />
                </div>

                <Separator />

                {/* Heatmap */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <LuCalendar className="text-blue-400" />
                            Activity
                        </h2>
                        <select
                            className="bg-gray-900 border border-[--border] rounded-md px-3 py-1.5 text-sm"
                            value={selectedYear ?? ""}
                            onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : undefined)}
                        >
                            {yearOptions.map((y) => (
                                <option key={y ?? "rolling"} value={y ?? ""}>
                                    {y ? `${y}` : "Last 365 days"}
                                </option>
                            ))}
                        </select>
                    </div>
                    <ActivityHeatmap days={profileStats?.activityHeatmap} />
                    <DayOfWeekChart patterns={profileStats?.watchPatterns?.byDayOfWeek} />
                </div>

                <Separator />

                {/* Personality Card */}
                {profileStats?.personality && (
                    <PersonalityCard personality={profileStats.personality} />
                )}

                <Separator />

                {/* AniList Charts - Genre */}
                <AniListCharts stats={anilistStats} />

            </PageWrapper>
        </>
    )
}

// ───────────────────────────── Hero Stats ─────────────────────────────

function HeroStats({ anilistStats, profileStats }: { anilistStats?: AL_Stats, profileStats?: any }) {
    return (
        <div className="space-y-2">
            <Stats
                className="w-full"
                size="lg"
                items={[
                    {
                        icon: <LuTv />,
                        name: "Total Anime",
                        value: anilistStats?.animeStats?.count ?? 0,
                    },
                    {
                        icon: <LuBookOpen />,
                        name: "Total Manga",
                        value: anilistStats?.mangaStats?.count ?? 0,
                    },
                    {
                        icon: <LuHourglass />,
                        name: "Watch Time",
                        value: Math.round((anilistStats?.animeStats?.minutesWatched ?? 0) / 60),
                        unit: "hours",
                    },
                    {
                        icon: <LuStar />,
                        name: "Mean Score",
                        value: ((anilistStats?.animeStats?.meanScore ?? 0) / 10).toFixed(1),
                    },
                ]}
            />
            <Stats
                className="w-full"
                size="md"
                items={[
                    {
                        icon: <LuTrophy />,
                        name: "Active Days",
                        value: profileStats?.totalActiveDays ?? 0,
                    },
                    {
                        icon: <LuTv />,
                        name: "Anime Days",
                        value: profileStats?.totalAnimeDays ?? 0,
                    },
                    {
                        icon: <LuBookOpen />,
                        name: "Manga Days",
                        value: profileStats?.totalMangaDays ?? 0,
                    },
                ]}
            />
        </div>
    )
}

// ───────────────────────────── Streak Cards ─────────────────────────────

function StreakCard({ label, icon, streak }: {
    label: string
    icon: React.ReactNode
    streak?: ProfileStats_StreakInfo
}) {
    return (
        <div className="bg-gray-900 border border-[--border] rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 text-[--muted]">
                {icon}
                <span className="text-sm font-medium">{label}</span>
            </div>
            <div className="flex items-end gap-6">
                <div>
                    <div className="flex items-center gap-2">
                        <LuFlame className={cn(
                            "text-2xl",
                            (streak?.current ?? 0) > 0 ? "text-orange-400" : "text-gray-600",
                        )} />
                        <span className="text-4xl font-bold">{streak?.current ?? 0}</span>
                    </div>
                    <span className="text-xs text-[--muted]">Current streak</span>
                </div>
                <div>
                    <span className="text-2xl font-semibold text-[--muted]">{streak?.longest ?? 0}</span>
                    <p className="text-xs text-[--muted]">Longest streak</p>
                </div>
            </div>
            {streak?.lastActive && (
                <p className="text-xs text-[--muted]">Last active: {streak.lastActive}</p>
            )}
        </div>
    )
}

// ───────────────────────────── Activity Heatmap ─────────────────────────────

function ActivityHeatmap({ days }: { days?: ProfileStats_ActivityDay[] }) {
    if (!days || days.length === 0) {
        return <p className="text-[--muted] text-sm">No activity data yet. Start watching or reading to build your heatmap!</p>
    }

    // Build week-column structure (columns = weeks, rows = Mon-Sun)
    const firstDate = new Date(days[0].date + "T00:00:00")
    const startDow = (firstDate.getDay() + 6) % 7 // 0=Monday

    const maxActivity = Math.max(1, ...days.map(d => d.totalActivity))

    // Pad start with empties
    const cells: (ProfileStats_ActivityDay | null)[] = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (const d of days) cells.push(d)

    // Split into columns of 7
    const columns: (ProfileStats_ActivityDay | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) {
        columns.push(cells.slice(i, i + 7))
    }

    // Pad last column
    const lastCol = columns[columns.length - 1]
    while (lastCol && lastCol.length < 7) lastCol.push(null)

    const cellSize = 12
    const gap = 2
    const dayLabelWidth = 20
    const dayLabels = ["M", "T", "W", "T", "F", "S", "S"]

    const width = dayLabelWidth + columns.length * (cellSize + gap)
    const height = 7 * (cellSize + gap)

    return (
        <div className="overflow-x-auto pb-2">
            <svg width={width} height={height + 20} className="block">
                {/* Day labels */}
                {dayLabels.map((label, i) => (
                    <text
                        key={`label-${i}`}
                        x={dayLabelWidth - 4}
                        y={i * (cellSize + gap) + cellSize - 1}
                        textAnchor="end"
                        className="fill-[--muted] text-[9px]"
                    >
                        {i % 2 === 0 ? label : ""}
                    </text>
                ))}

                {/* Month labels */}
                {columns.map((col, ci) => {
                    const firstDay = col.find(c => c !== null)
                    if (!firstDay) return null
                    const d = new Date(firstDay.date + "T00:00:00")
                    if (d.getDate() <= 7) {
                        const monthName = d.toLocaleString("default", { month: "short" })
                        return (
                            <text
                                key={`month-${ci}`}
                                x={dayLabelWidth + ci * (cellSize + gap)}
                                y={height + 14}
                                className="fill-[--muted] text-[9px]"
                            >
                                {monthName}
                            </text>
                        )
                    }
                    return null
                })}

                {/* Cells */}
                {columns.map((col, ci) =>
                    col.map((cell, ri) => {
                        if (!cell) {
                            return (
                                <rect
                                    key={`${ci}-${ri}`}
                                    x={dayLabelWidth + ci * (cellSize + gap)}
                                    y={ri * (cellSize + gap)}
                                    width={cellSize}
                                    height={cellSize}
                                    rx={2}
                                    className="fill-gray-800/50"
                                />
                            )
                        }
                        const intensity = cell.totalActivity / maxActivity
                        return (
                            <rect
                                key={`${ci}-${ri}`}
                                x={dayLabelWidth + ci * (cellSize + gap)}
                                y={ri * (cellSize + gap)}
                                width={cellSize}
                                height={cellSize}
                                rx={2}
                                className={getHeatmapColor(intensity)}
                            >
                                <title>
                                    {cell.date}: {cell.animeEpisodes} ep, {cell.mangaChapters} ch
                                </title>
                            </rect>
                        )
                    }),
                )}
            </svg>
            <div className="flex items-center gap-1 mt-1 text-xs text-[--muted]">
                <span>Less</span>
                {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                    <span key={i} className={cn("inline-block w-3 h-3 rounded-sm", getHeatmapColor(v))} />
                ))}
                <span>More</span>
            </div>
        </div>
    )
}

function getHeatmapColor(intensity: number): string {
    if (intensity <= 0) return "fill-gray-800"
    if (intensity < 0.25) return "fill-emerald-900"
    if (intensity < 0.5) return "fill-emerald-700"
    if (intensity < 0.75) return "fill-emerald-500"
    return "fill-emerald-400"
}

// ───────────────────────────── Day of Week Chart ─────────────────────────────

function DayOfWeekChart({ patterns }: { patterns?: number[] }) {
    if (!patterns || patterns.every(v => v === 0)) return null

    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    const data = dayNames.map((name, i) => ({
        name,
        Activity: patterns[i] ?? 0,
    }))

    return (
        <div className="w-full max-w-md">
            <p className="text-sm text-[--muted] mb-2">Activity by day of week</p>
            <BarChart
                data={data}
                index="name"
                categories={["Activity"]}
                colors={["brand"]}
            />
        </div>
    )
}

// ───────────────────────────── Personality Card ─────────────────────────────

function PersonalityCard({ personality }: { personality: ProfileStats_PersonalityResult }) {
    return (
        <div className="space-y-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
                <LuGlobe className="text-purple-400" />
                Your Anime Personality
            </h2>
            <div className="bg-gradient-to-br from-purple-900/30 via-gray-900 to-indigo-900/30 border border-purple-500/20 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-4">
                    {personality.iconSvg && (
                        <div
                            className="w-12 h-12 text-purple-400"
                            dangerouslySetInnerHTML={{ __html: personality.iconSvg }}
                        />
                    )}
                    <div>
                        <h3 className="text-2xl font-bold text-purple-200">{personality.name}</h3>
                        <p className="text-sm text-[--muted]">{personality.description}</p>
                    </div>
                </div>
                {personality.traits && personality.traits.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {personality.traits.map((trait) => (
                            <span
                                key={trait}
                                className="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            >
                                {trait}
                            </span>
                        ))}
                    </div>
                )}
                {personality.topGenres && personality.topGenres.length > 0 && (
                    <p className="text-xs text-[--muted]">
                        Top genres: {personality.topGenres.join(", ")}
                    </p>
                )}
            </div>
        </div>
    )
}

// ───────────────────────────── AniList Charts ─────────────────────────────

function AniListCharts({ stats }: { stats?: AL_Stats }) {
    const genreData = React.useMemo(() => {
        if (!stats?.animeStats?.genres) return []
        return stats.animeStats.genres
            .map((item) => ({
                name: item.genre,
                Count: item.count,
                "Avg Score": Number((item.meanScore / 10).toFixed(1)),
            }))
            .sort((a, b) => b.Count - a.Count)
            .slice(0, 15)
    }, [stats?.animeStats?.genres])

    const formatData = React.useMemo(() => {
        if (!stats?.animeStats?.formats) return []
        return stats.animeStats.formats.map((item) => ({
            name: formatName[item.format as string] ?? item.format,
            count: item.count,
            hours: Math.round(item.minutesWatched / 60),
        }))
    }, [stats?.animeStats?.formats])

    const studioData = React.useMemo(() => {
        if (!stats?.animeStats?.studios) return []
        return [...stats.animeStats.studios]
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map((item) => ({
                name: item.studio?.name ?? "Unknown",
                Count: item.count,
                "Avg Score": Number((item.meanScore / 10).toFixed(1)),
            }))
    }, [stats?.animeStats?.studios])

    const scoreData = React.useMemo(() => {
        if (!stats?.animeStats?.scores) return []
        return stats.animeStats.scores
            .map((item) => ({
                name: String((item.score ?? 0) / 10),
                Count: item.count,
            }))
            .sort((a, b) => Number(a.name) - Number(b.name))
    }, [stats?.animeStats?.scores])

    const yearData = React.useMemo(() => {
        if (!stats?.animeStats?.releaseYears) return []
        return stats.animeStats.releaseYears
            .sort((a, b) => a.releaseYear! - b.releaseYear!)
            .map((item) => ({
                name: item.releaseYear,
                Count: item.count,
            }))
    }, [stats?.animeStats?.releaseYears])

    // Manga data
    const mangaGenreData = React.useMemo(() => {
        if (!stats?.mangaStats?.genres) return []
        return stats.mangaStats.genres
            .map((item) => ({
                name: item.genre,
                Count: item.count,
                "Avg Score": Number((item.meanScore / 10).toFixed(1)),
            }))
            .sort((a, b) => b.Count - a.Count)
            .slice(0, 15)
    }, [stats?.mangaStats?.genres])

    return (
        <div className="space-y-10">
            {/* Anime Section */}
            <h2 className="text-xl font-semibold text-center">Anime Breakdown</h2>

            {genreData.length > 0 && (
                <ChartSection title="Genres">
                    <BarChart
                        data={genreData}
                        index="name"
                        categories={["Count", "Avg Score"]}
                        colors={["brand", "blue"]}
                    />
                </ChartSection>
            )}

            {formatData.length > 0 && (
                <ChartSection title="Formats">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="text-center space-y-2">
                            <DonutChart
                                data={formatData}
                                index="name"
                                category="count"
                                variant="pie"
                            />
                            <p className="text-sm font-medium">By count</p>
                        </div>
                        <div className="text-center space-y-2">
                            <DonutChart
                                data={formatData}
                                index="name"
                                category="hours"
                                variant="pie"
                            />
                            <p className="text-sm font-medium">By hours watched</p>
                        </div>
                    </div>
                </ChartSection>
            )}

            {studioData.length > 0 && (
                <ChartSection title="Top Studios">
                    <BarChart
                        data={studioData}
                        index="name"
                        categories={["Count", "Avg Score"]}
                        colors={["brand", "blue"]}
                    />
                </ChartSection>
            )}

            {scoreData.length > 0 && (
                <ChartSection title="Score Distribution">
                    <BarChart
                        data={scoreData}
                        index="name"
                        categories={["Count"]}
                        colors={["brand"]}
                    />
                </ChartSection>
            )}

            {yearData.length > 0 && (
                <ChartSection title="Anime by Release Year">
                    <AreaChart
                        data={yearData}
                        index="name"
                        categories={["Count"]}
                        angledLabels
                    />
                </ChartSection>
            )}

            <Separator />

            {/* Manga Section */}
            <h2 className="text-xl font-semibold text-center">Manga Breakdown</h2>

            <Stats
                className="w-full"
                size="lg"
                items={[
                    {
                        icon: <LuBookOpen />,
                        name: "Total Manga",
                        value: stats?.mangaStats?.count ?? 0,
                    },
                    {
                        icon: <LuHourglass />,
                        name: "Chapters Read",
                        value: stats?.mangaStats?.chaptersRead ?? 0,
                    },
                    {
                        icon: <LuStar />,
                        name: "Mean Score",
                        value: ((stats?.mangaStats?.meanScore ?? 0) / 10).toFixed(1),
                    },
                ]}
            />

            {mangaGenreData.length > 0 && (
                <ChartSection title="Manga Genres">
                    <BarChart
                        data={mangaGenreData}
                        index="name"
                        categories={["Count", "Avg Score"]}
                        colors={["brand", "blue"]}
                    />
                </ChartSection>
            )}
        </div>
    )
}

function ChartSection({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div className="space-y-4">
            <h3 className="text-center text-lg font-medium">{title}</h3>
            <div className="w-full">{children}</div>
        </div>
    )
}
