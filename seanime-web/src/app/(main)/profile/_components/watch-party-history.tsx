import { WatchParty_HistoryCompanion, WatchParty_HistoryItem } from "@/api/generated/types"
import { useWatchPartyHistory } from "@/api/hooks/watchparty.hooks"
import { WatchPartyAvatar, WatchPartyAvatarStack } from "@/app/(main)/watch-party/_components/watch-party-ui"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { SeaLink } from "@/components/shared/sea-link"
import React from "react"
import { LuClock, LuPopcorn, LuUsers } from "react-icons/lu"
import { MdOutlineSettingsRemote } from "react-icons/md"

/**
 * A profile's watch party history: which episodes they watched together, and with whom.
 * profileId 0 = the signed-in profile.
 */
export function WatchPartyHistory({ profileId, ownerName }: { profileId: number, ownerName?: string }) {
    const { data, isLoading } = useWatchPartyHistory(profileId)
    const items = Array.isArray(data) ? data : []

    const stats = React.useMemo(() => {
        const seconds = items.reduce((a, i) => a + (i.watchedSeconds || 0), 0)
        const shows = new Set(items.map(i => i.mediaId)).size
        const buddies = new Map<number, { c: WatchParty_HistoryCompanion, n: number }>()
        for (const i of items) {
            for (const c of i.companions ?? []) {
                const b = buddies.get(c.profileId)
                if (b) {
                    b.n++
                    b.c = c
                } else buddies.set(c.profileId, { c, n: 1 })
            }
        }
        const top = [...buddies.values()].sort((a, b) => b.n - a.n)
        return { seconds, shows, episodes: items.length, top }
    }, [items])

    // Group consecutive episodes of the same show in the same room into one card.
    const groups = React.useMemo(() => {
        const out: Array<{ key: string, items: WatchParty_HistoryItem[] }> = []
        for (const i of items) {
            const last = out[out.length - 1]
            if (last && last.items[0].sessionId === i.sessionId && last.items[0].mediaId === i.mediaId) {
                last.items.push(i)
            } else {
                out.push({ key: `${i.sessionId}-${i.mediaId}-${i.id}`, items: [i] })
            }
        }
        return out
    }, [items])

    if (isLoading) return <LoadingSpinner />

    if (!items.length) {
        return (
            <div className="relative overflow-hidden rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 flex flex-col items-center gap-4 text-center">
                <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-brand-500/30 blur-2xl" />
                    <div className="relative size-16 rounded-2xl bg-gradient-to-br from-brand-400/30 to-fuchsia-500/20 border border-white/10 flex items-center justify-center">
                        <LuPopcorn className="size-8 text-brand-200" />
                    </div>
                </div>
                <p className="text-lg font-semibold">No watch parties yet</p>
                <p className="text-sm text-gray-400 max-w-sm">
                    {profileId ? `Episodes ${ownerName ?? "they"} watch with others in a watch party show up here.` : "Episodes you watch with others in a watch party show up here, along with who you watched them with."}
                </p>
                {!profileId && (
                    <SeaLink href="/watch-party" className="rounded-full bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold px-5 py-2 shadow-lg shadow-brand-500/30">
                        Start a watch party
                    </SeaLink>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat icon={<LuPopcorn />} value={stats.episodes} label={stats.episodes === 1 ? "Episode together" : "Episodes together"} />
                <Stat icon={<LuClock />} value={formatHours(stats.seconds)} label="Watched together" />
                <Stat icon={<MdOutlineSettingsRemote />} value={stats.shows} label={stats.shows === 1 ? "Show" : "Shows"} />
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3 min-w-0">
                    {stats.top[0]
                        ? <>
                            <WatchPartyAvatar name={stats.top[0].c.username} avatar={stats.top[0].c.avatar} size="lg" />
                            <div className="min-w-0">
                                <p className="font-bold truncate">{stats.top[0].c.username}</p>
                                <p className="text-xs text-gray-400">Watch buddy · {stats.top[0].n} ep</p>
                            </div>
                        </>
                        : <span className="text-sm text-gray-400">No buddies yet</span>}
                </div>
            </div>

            {/* Everyone they've watched with */}
            {stats.top.length > 1 && (
                <div className="flex flex-col gap-2">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gray-400 flex items-center gap-2">
                        <LuUsers className="size-3.5" /> Watched with
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {stats.top.map(({ c, n }) => (
                            <SeaLink
                                key={c.profileId}
                                href={`/profile/user?id=${c.profileId}`}
                                className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] border border-white/10 hover:border-brand-400/50 pl-1 pr-3 py-1 transition-colors"
                            >
                                <WatchPartyAvatar name={c.username} avatar={c.avatar} size="xs" />
                                <span className="text-sm">{c.username}</span>
                                <span className="text-xs text-gray-500">{n}</span>
                            </SeaLink>
                        ))}
                    </div>
                </div>
            )}

            {/* Timeline */}
            <div className="flex flex-col gap-3">
                {groups.map(g => <HistoryCard key={g.key} items={g.items} />)}
            </div>
        </div>
    )
}

function Stat({ icon, value, label }: { icon: React.ReactNode, value: React.ReactNode, label: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <span className="size-10 rounded-xl bg-brand-500/15 text-brand-300 flex items-center justify-center text-lg shrink-0">{icon}</span>
            <div className="min-w-0">
                <p className="text-xl font-black leading-tight">{value}</p>
                <p className="text-xs text-gray-400 truncate">{label}</p>
            </div>
        </div>
    )
}

function HistoryCard({ items }: { items: WatchParty_HistoryItem[] }) {
    const first = items[0]
    // Everyone across the run of episodes.
    const people = React.useMemo(() => {
        const m = new Map<number, WatchParty_HistoryCompanion>()
        for (const i of items) for (const c of i.companions ?? []) m.set(c.profileId, c)
        return [...m.values()]
    }, [items])
    const episodes = [...items].map(i => i.episodeNumber).filter(n => n > 0).sort((a, b) => a - b)
    const hosted = items.some(i => i.wasHost)
    const seconds = items.reduce((a, i) => a + (i.watchedSeconds || 0), 0)

    return (
        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#111119]">
            {first.mediaImage && (
                <img src={first.mediaImage} alt="" className="absolute inset-0 size-full object-cover opacity-25 blur-md scale-110" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b12] via-[#0b0b12]/90 to-[#0b0b12]/50" />

            <div className="relative flex gap-4 p-4">
                <SeaLink href={`/entry?id=${first.mediaId}`} className="shrink-0">
                    <div className="w-16 sm:w-20 aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-xl">
                        {first.mediaImage
                            ? <img src={first.mediaImage} alt="" className="size-full object-cover transition-transform group-hover:scale-105" />
                            : <div className="size-full flex items-center justify-center"><LuPopcorn className="size-6 text-white/30" /></div>}
                    </div>
                </SeaLink>

                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <SeaLink href={`/entry?id=${first.mediaId}`} className="font-bold leading-tight hover:underline line-clamp-1">
                            {first.mediaTitle || "Unknown show"}
                        </SeaLink>
                        <span className="text-xs text-gray-500 shrink-0">{formatDate(first.watchedAt)}</span>
                    </div>
                    <p className="text-sm text-gray-300">
                        {episodes.length ? episodeLabel(episodes) : "Movie"}
                        <span className="text-gray-500"> · {formatHours(seconds)}</span>
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 min-w-0">
                        in <span className="text-gray-300 truncate">{first.roomName || "a watch party"}</span>
                        {hosted && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 text-brand-200 px-2 py-0.5 text-[0.65rem] font-semibold shrink-0">
                                <MdOutlineSettingsRemote className="size-3" /> Had the remote
                            </span>
                        )}
                    </p>

                    <div className="mt-auto pt-1 flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-400 shrink-0">With</span>
                        <WatchPartyAvatarStack participants={people.map(p => ({ clientId: String(p.profileId), profileId: p.profileId, username: p.username, avatar: p.avatar }) as any)} max={4} size="xs" />
                        <span className={cn("text-sm truncate")}>
                            {people.map((p, i) => (
                                <React.Fragment key={p.profileId}>
                                    {i > 0 && <span className="text-gray-500">{i === people.length - 1 ? " & " : ", "}</span>}
                                    <SeaLink href={`/profile/user?id=${p.profileId}`} className="hover:underline">{p.username}</SeaLink>
                                </React.Fragment>
                            ))}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

function episodeLabel(eps: number[]) {
    const uniq = [...new Set(eps)]
    if (uniq.length === 1) return `Episode ${uniq[0]}`
    const contiguous = uniq.every((n, i) => i === 0 || n === uniq[i - 1] + 1)
    if (contiguous) return `Episodes ${uniq[0]}–${uniq[uniq.length - 1]}`
    return `Episodes ${uniq.join(", ")}`
}

function formatHours(seconds: number) {
    const m = Math.round(seconds / 60)
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    const r = m % 60
    return r ? `${h}h ${r}m` : `${h}h`
}

function formatDate(ts: string | undefined) {
    if (!ts) return ""
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ""
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
    if (days === 0) return "Today"
    if (days === 1) return "Yesterday"
    if (days < 7) return `${days} days ago`
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
}
