"use client"

import { formatCount } from "@/lib/helpers/number"
import { cachedImageUrl } from "@/lib/server/assets"
import { AL_StaffDetails_Staff, AL_StaffDetails_Staff_StaffMedia_Edges_Node } from "@/api/generated/types"
import { StaffCareer, StaffCharacter, useGetAnilistStaffDetails, useGetStaffCareer } from "@/api/hooks/anilist.hooks"
import { useGetStaffFavorites, useToggleStaffFavorite } from "@/api/hooks/favorites.hooks"
import { GlassCard } from "@/app/(main)/_features/media/_components/media-info-panel"
import { compact, formatFuzzyDate, MEDIA_FORMAT_LABELS } from "@/app/(main)/_features/media/_components/media-meta-chips"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { MediaPageHeader } from "@/app/(main)/_features/media/_components/media-page-header-components"
import { MediaSectionHeading } from "@/app/(main)/_features/media/_components/media-section-heading"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Tooltip } from "@/components/ui/tooltip"
import { useSearchParams } from "@/lib/navigation"
import { getImageUrl } from "@/lib/server/assets"
import { capitalize } from "lodash"
import { motion, useScroll, useSpring, useTransform } from "motion/react"
import React from "react"
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai"
import {
    LuArrowLeft,
    LuBookOpen,
    LuBriefcase,
    LuCalendarRange,
    LuChartColumn,
    LuChevronDown,
    LuCrown,
    LuFilm,
    LuHeart,
    LuInfo,
    LuMic,
    LuSearch,
    LuSparkles,
    LuStar,
    LuTags,
} from "react-icons/lu"

// A person's page: who they are, what they do, and everything they have worked on. Everything past
// the name is worked out from their credits, so the page says something even when AniList has no bio.

type Node = AL_StaffDetails_Staff_StaffMedia_Edges_Node
type Work = { media: Node, roles: string[], voices: string[] }
type VoiceRole = { character: StaffCharacter, role?: string, works: Node[] }
type Kind = "all" | "anime" | "manga"
type Sort = "newest" | "oldest" | "score"

const PAGE_SIZE = 48
const VOICE_PAGE_SIZE = 24

const yearOf = (media: Node) => media.startDate?.year ?? undefined
const titleOf = (media: Node) => media.title?.userPreferred || media.title?.romaji || media.title?.english || ""
/** "Key Animation (ep 3)" and "Key Animation (OP)" are the same job. */
const roleName = (role: string) => role.replace(/\s*\(.*\)\s*$/, "").trim()

/** AniList bios open with lines like `__Birth:__ April 5` and use markdown and spoiler tags throughout. */
function parseBio(description: string | undefined) {
    const facts: [string, string][] = []
    const clean = (text: string) => text
        .replace(/~!.*?!~/gs, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/__|\*\*/g, "")
        .trim()

    const body: string[] = []
    for (const line of (description ?? "").split("\n")) {
        const fact = line.match(/^\s*(?:__|\*\*)(.+?)(?:__|\*\*)\s*:?\s*(.*)$/)
        const label = fact?.[1].replace(/:\s*$/, "").trim()
        const value = fact ? clean(fact[2]) : ""
        if (label && value && label.length <= 30) {
            if (!facts.some(([known]) => known === label)) facts.push([label, value])
        } else {
            body.push(line)
        }
    }
    return { facts, bio: clean(body.join("\n")).replace(/\n{3,}/g, "\n\n") }
}

function useStaffWorks(staff: AL_StaffDetails_Staff, career: StaffCareer | undefined) {
    return React.useMemo(() => {
        const byId = new Map<number, Work>()
        const workFor = (node: Node) => {
            const work = byId.get(node.id) ?? { media: node, roles: [], voices: [] }
            byId.set(node.id, work)
            return work
        }
        // The details are the first page of the career, so the career replaces them once it arrives.
        for (const edge of career?.credits ?? staff.staffMedia?.edges ?? []) {
            if (!edge?.node) continue
            const work = workFor(edge.node)
            if (edge.staffRole && !work.roles.includes(edge.staffRole)) work.roles.push(edge.staffRole)
        }
        const voices = new Map<number, VoiceRole>()
        for (const edge of career?.characters ?? []) {
            if (!edge?.node) continue
            const work = workFor(edge.node)
            for (const character of edge.characters ?? []) {
                const name = character.name?.full
                if (name && !work.voices.includes(name)) work.voices.push(name)
                const voice = voices.get(character.id) ?? { character, role: edge.characterRole, works: [] }
                // A main role anywhere makes it a main role.
                if (edge.characterRole === "MAIN") voice.role = "MAIN"
                if (!voice.works.some(node => node.id === edge.node!.id)) voice.works.push(edge.node)
                voices.set(character.id, voice)
            }
        }
        const works = [...byId.values()]
        const voiceRoles = [...voices.values()].sort((a, b) =>
            Number(b.role === "MAIN") - Number(a.role === "MAIN") || b.works.length - a.works.length)

        const count = (keys: string[]) => {
            const totals = new Map<string, number>()
            for (const key of keys) totals.set(key, (totals.get(key) ?? 0) + 1)
            return [...totals.entries()].map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount)
        }

        const scored = works.filter(w => !!w.media.meanScore)
        const years = works.map(w => yearOf(w.media)).filter(Boolean) as number[]
        const first = years.length ? Math.min(...years) : undefined
        const last = years.length ? Math.max(...years) : undefined
        const perYear = new Map<number, number>()
        for (const year of years) perYear.set(year, (perYear.get(year) ?? 0) + 1)

        return {
            works,
            voiceRoles,
            anime: works.filter(w => w.media.type !== "MANGA").length,
            manga: works.filter(w => w.media.type === "MANGA").length,
            meanScore: scored.length ? Math.round(scored.reduce((n, w) => n + w.media.meanScore!, 0) / scored.length) : undefined,
            first,
            last,
            timeline: first && last ? Array.from({ length: last - first + 1 }, (_, i) => ({ year: first + i, amount: perYear.get(first + i) ?? 0 })) : [],
            roles: count(works.flatMap(w => [...new Set([...w.roles.map(roleName), ...(w.voices.length ? ["Voice acting"] : [])])])),
            genres: count(works.flatMap(w => w.media.genres ?? [])),
            signature: [...scored].sort((a, b) => b.media.meanScore! - a.media.meanScore!).slice(0, 5),
        }
    }, [staff, career])
}

/** What AniList states outright, ahead of anything parsed out of the bio. */
function careerFacts(career: StaffCareer | undefined) {
    if (!career) return []
    const years = career.yearsActive ?? []
    const active = years.length ? `${years[0]} – ${years[1] ?? (career.dateOfDeath?.year ? "" : "now")}` : undefined
    return ([
        ["Born", formatFuzzyDate(career.dateOfBirth)],
        ["Died", formatFuzzyDate(career.dateOfDeath)],
        ["Age", career.age ? String(career.age) : undefined],
        ["Gender", career.gender],
        ["Hometown", career.homeTown],
        ["Language", career.languageV2],
        ["Years active", active],
    ] as [string, string | null | undefined][]).filter((fact): fact is [string, string] => !!fact[1])
}

export default function Page() {
    const searchParams = useSearchParams()
    const id = Number(searchParams.get("id")) || 0
    const { data, isLoading, isError, refetch, isFetching } = useGetAnilistStaffDetails(id)

    if (isLoading) {
        return <PageWrapper className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-[--muted]">
            <LoadingSpinner />
            <p className="text-sm">Gathering their credits…</p>
        </PageWrapper>
    }
    if (!data?.Staff) {
        // A failed request is not a missing person: say which it was, and offer to try again.
        return <PageWrapper className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center text-[--muted]">
            <p className="text-base font-semibold text-white">{isError ? "Couldn't load this person" : "Staff not found"}</p>
            <p className="max-w-sm text-sm">
                {isError
                    ? "AniList didn't answer in time, or is limiting requests right now. It usually works a moment later."
                    : "AniList has no staff entry with this ID."}
            </p>
            {isError && (
                <button
                    type="button"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
                >
                    {isFetching ? "Trying again…" : "Try again"}
                </button>
            )}
        </PageWrapper>
    }
    return <StaffView staff={data.Staff} />
}

export function StaffView({ staff }: { staff: AL_StaffDetails_Staff }) {
    const { data: favIds } = useGetStaffFavorites()
    const { mutate: toggleFav, isPending: isTogglingFav } = useToggleStaffFavorite()
    const isFav = !!favIds?.includes(staff.id)

    const { data: career, isLoading: careerLoading } = useGetStaffCareer(staff.id)
    const stats = useStaffWorks(staff, career)
    const { facts: bioFacts, bio } = React.useMemo(() => parseBio(staff.description), [staff.description])
    const facts = React.useMemo(() => {
        const known = careerFacts(career)
        const lower = known.map(([label]) => label.toLowerCase())
        return [...known, ...bioFacts.filter(([label]) => !lower.includes(label.toLowerCase()) && !/^(birth|death)$/i.test(label))]
    }, [career, bioFacts])

    const banner = stats.works.find(w => !!w.media.bannerImage)?.media.bannerImage
    const cover = stats.works[0]?.media.coverImage?.extraLarge

    return (
        <div className="relative" data-staff-page>
            <MediaPageHeader backgroundImage={banner || undefined} coverImage={cover || undefined} />

            <StaffHero
                staff={staff}
                stats={stats}
                bio={bio}
                isFav={isFav}
                favPending={isTogglingFav}
                onFav={() => toggleFav({ staffId: staff.id })}
            />

            <PageWrapper className="relative z-[5] space-y-12 px-4 pb-16 md:px-8">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-staff-stats>
                    <StatTile icon={<LuFilm />} label="Anime" value={String(stats.anime)} sub="credits" />
                    <StatTile icon={<LuBookOpen />} label="Manga" value={String(stats.manga)} sub="credits" />
                    <StatTile icon={<LuCalendarRange />} label="Active" value={stats.first ? `${stats.last! - stats.first + 1} yrs` : "—"} sub={stats.first ? `${stats.first} – ${stats.last}` : undefined} />
                    {!!stats.voiceRoles.length && <StatTile icon={<LuMic />} label="Characters" value={String(stats.voiceRoles.length)} sub="voiced" />}
                    {!!career?.favourites && <StatTile icon={<LuHeart />} label="Favourites" value={compact(career.favourites)} sub="on AniList" />}
                    <StatTile icon={<LuStar />} label="Avg score" value={stats.meanScore ? (stats.meanScore / 10).toFixed(1) : "—"} sub="across their work" accent />
                    <StatTile icon={<LuBriefcase />} label="Top role" value={stats.roles[0]?.key ?? "—"} sub={stats.roles[0] ? `${stats.roles[0].amount} titles` : undefined} small />
                </div>

                {stats.signature.length > 0 && <SignatureWorks works={stats.signature} />}

                <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr),minmax(17rem,21rem)]" data-staff-career>
                    <div className="min-w-0 space-y-5">
                        {stats.timeline.length > 1 && <GlassCard title="Career" icon={<LuChartColumn />}>
                            <Timeline years={stats.timeline} />
                        </GlassCard>}
                        {!!stats.roles.length && <GlassCard title="What they do" icon={<LuBriefcase />}>
                            <Bars items={stats.roles.slice(0, 10)} />
                        </GlassCard>}
                    </div>
                    <aside className="min-w-0 space-y-5 lg:sticky lg:top-4">
                        {!!facts.length && <GlassCard title="About" icon={<LuInfo />}>
                            <dl className="divide-y divide-white/[0.06]">
                                {facts.map(([label, value]) => (
                                    <div key={label} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                                        <dt className="shrink-0 text-[--muted]">{label}</dt>
                                        <dd className="min-w-0 break-words text-right font-medium text-white/90">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </GlassCard>}
                        {!!stats.genres.length && <GlassCard title="Genres they work in" icon={<LuTags />}>
                            <Bars items={stats.genres.slice(0, 8)} />
                        </GlassCard>}
                    </aside>
                </section>

                {!!stats.voiceRoles.length && <VoiceRoles roles={stats.voiceRoles} />}

                <Filmography
                    works={stats.works}
                    anime={stats.anime}
                    manga={stats.manga}
                    note={careerLoading
                        ? "Loading the full career…"
                        : career?.partial ? "AniList stopped answering, so some credits may be missing" : undefined}
                />
            </PageWrapper>
        </div>
    )
}

function StaffHero({ staff, stats, bio, isFav, favPending, onFav }: {
    staff: AL_StaffDetails_Staff
    stats: ReturnType<typeof useStaffWorks>
    bio: string
    isFav: boolean
    favPending: boolean
    onFav: () => void
}) {
    const { scrollY } = useScroll()
    const lift = useSpring(useTransform(scrollY, [0, 420], [0, -60]), { stiffness: 140, damping: 30, mass: 0.5, restDelta: 0.001 })
    const [expanded, setExpanded] = React.useState(false)
    const image = staff.image?.large

    return (
        <header className="relative z-[4]" data-staff-hero>
            <motion.div className="relative px-4 pb-10 pt-10 md:px-8 md:pt-14" style={{ y: lift }}>
                <SeaLink href="/" className="mb-6 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-sm text-white/75 ring-1 ring-white/10 backdrop-blur-md transition hover:text-white">
                    <LuArrowLeft /> Back
                </SeaLink>

                <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-10">
                    {image && <motion.img
                        src={getImageUrl(image)}
                        alt={staff.name?.full ?? ""}
                        initial={{ opacity: 0, y: 12, scale: 1.03 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                        className="aspect-[3/4] w-40 flex-none self-center rounded-3xl object-cover shadow-[0_20px_50px_-12px_rgb(0_0_0_/_0.8)] ring-1 ring-white/15 lg:w-56 lg:self-start"
                    />}

                    <div className="min-w-0 flex-1 space-y-4 text-center lg:text-left">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-200/90 [text-shadow:_0_1px_8px_rgb(0_0_0_/_80%)]">
                                {staff.primaryOccupations?.[0] ?? "Staff"}
                            </p>
                            <h1 className="mt-2 text-4xl font-black leading-[1] tracking-tight text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.7)] sm:text-5xl lg:text-6xl">
                                {staff.name?.full}
                            </h1>
                            {staff.name?.native && <p className="mt-2 text-lg text-white/70 [text-shadow:_0_1px_8px_rgb(0_0_0_/_80%)]" lang="ja">{staff.name.native}</p>}
                        </div>

                        <p className="text-sm text-white/80 [text-shadow:_0_1px_8px_rgb(0_0_0_/_85%)] sm:text-base">
                            {[
                                stats.first ? (stats.last !== stats.first ? `Credited ${stats.first}–${stats.last}` : `Credited ${stats.first}`) : null,
                                `${formatCount(stats.works.length)} title${stats.works.length === 1 ? "" : "s"}`,
                                stats.roles.length ? `${formatCount(stats.roles.length)} role${stats.roles.length === 1 ? "" : "s"}` : null,
                            ].filter(Boolean).join(" · ")}
                        </p>

                        <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                            {(staff.primaryOccupations ?? []).map(occupation => (
                                <span key={occupation} className="rounded-full bg-black/40 px-3 py-1 text-sm text-white/85 ring-1 ring-white/10 backdrop-blur-md">{occupation}</span>
                            ))}
                            <Tooltip trigger={<button
                                type="button"
                                onClick={onFav}
                                disabled={favPending}
                                aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                                className={cn(
                                    "flex items-center gap-2 rounded-full px-4 py-1 text-sm font-semibold ring-1 backdrop-blur-md transition-all hover:-translate-y-0.5",
                                    isFav ? "bg-rose-500/25 text-rose-100 ring-rose-400/40" : "bg-black/40 text-white ring-white/15 hover:bg-black/60",
                                )}
                            >
                                {isFav ? <AiFillHeart className="text-rose-400" /> : <AiOutlineHeart />}
                                Favourite
                            </button>}>
                                {isFav ? "Remove from favorites" : "Add to favorites"}
                            </Tooltip>
                        </div>

                        {!!bio && <div className="max-w-3xl rounded-2xl bg-black/35 p-4 text-left ring-1 ring-white/10 backdrop-blur-md" data-staff-bio>
                            <p className={cn("whitespace-pre-line text-sm leading-relaxed text-white/85", !expanded && "line-clamp-4")}>{bio}</p>
                            {bio.length > 320 && <button
                                type="button"
                                onClick={() => setExpanded(e => !e)}
                                className="mt-1.5 text-xs font-semibold text-brand-200 hover:text-white"
                            >
                                {expanded ? "Show less" : "Read more"}
                            </button>}
                        </div>}
                    </div>
                </div>
            </motion.div>
        </header>
    )
}

function StatTile({ icon, label, value, sub, accent, small }: { icon: React.ReactNode, label: string, value: string, sub?: string, accent?: boolean, small?: boolean }) {
    return (
        <div className={cn(
            "min-w-0 rounded-2xl border p-4 shadow-xl shadow-black/30 backdrop-blur-md transition-transform hover:-translate-y-0.5",
            accent ? "border-amber-300/20 bg-amber-300/[0.07]" : "border-white/10 bg-black/35",
        )}>
            <p className={cn("flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider [&>svg]:size-3.5", accent ? "text-amber-200/70" : "text-white/50")}>{icon}{label}</p>
            <p className={cn("mt-1.5 truncate font-bold tabular-nums tracking-tight text-white", small ? "text-xl leading-9" : "text-3xl")} title={value}>{value}</p>
            {sub && <p className="mt-0.5 truncate text-xs text-white/50">{sub}</p>}
        </div>
    )
}

function SignatureWorks({ works }: { works: Work[] }) {
    const [lead, ...rest] = works
    const href = (media: Node) => media.type === "MANGA" ? `/manga/entry?id=${media.id}` : `/entry?id=${media.id}`
    const art = (media: Node) => getImageUrl(media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large || "")
    return (
        <section className="space-y-4" data-staff-signature>
            <MediaSectionHeading icon={<LuCrown />} title="Best known for" />
            <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
                <SeaLink href={href(lead.media)} className="group relative block min-h-[18rem] overflow-hidden rounded-3xl ring-1 ring-white/10">
                    <img src={cachedImageUrl(art(lead.media))} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">Highest rated</p>
                        <p className="mt-1 line-clamp-2 text-2xl font-bold text-white sm:text-3xl">{titleOf(lead.media)}</p>
                        <p className="mt-1.5 line-clamp-1 text-sm text-white/70">{[...lead.voices.map(name => `as ${name}`), ...lead.roles].join(" · ")}</p>
                    </div>
                </SeaLink>
                <div className="grid grid-cols-2 gap-4">
                    {rest.map(work => (
                        <SeaLink key={work.media.id} href={href(work.media)} className="group relative block aspect-[16/11] overflow-hidden rounded-2xl ring-1 ring-white/10">
                            <img src={cachedImageUrl(art(work.media))} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 p-3">
                                <p className="line-clamp-1 text-sm font-semibold text-white">{titleOf(work.media)}</p>
                                <p className="line-clamp-1 text-[11px] text-white/60">{work.voices[0] ? `as ${work.voices[0]}` : work.roles[0]}</p>
                            </div>
                        </SeaLink>
                    ))}
                </div>
            </div>
        </section>
    )
}

function Timeline({ years }: { years: { year: number, amount: number }[] }) {
    const max = Math.max(1, ...years.map(y => y.amount))
    return <>
        <div className="flex h-36 items-end gap-[3px]">
            {years.map(y => (
                <Tooltip key={y.year} trigger={<div className="group flex h-full flex-1 items-end">
                    <div
                        className={cn("w-full rounded-t-md transition-colors", y.amount ? "bg-gradient-to-t from-brand-500/60 to-brand-300 group-hover:to-white" : "bg-white/[0.04]")}
                        style={{ height: `${y.amount ? Math.max(6, (y.amount / max) * 100) : 3}%` }}
                    />
                </div>}>{y.year}: {y.amount} title{y.amount === 1 ? "" : "s"}</Tooltip>
            ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] tabular-nums text-white/40">
            <span>{years[0].year}</span>
            {years.length > 8 && <span>{years[Math.floor(years.length / 2)].year}</span>}
            <span>{years[years.length - 1].year}</span>
        </div>
    </>
}

function Bars({ items }: { items: { key: string, amount: number }[] }) {
    const max = Math.max(1, ...items.map(i => i.amount))
    return <div className="space-y-2">
        {items.map(item => (
            <div key={item.key}>
                <div className="flex justify-between gap-3 text-xs"><span className="truncate text-white/80">{item.key}</span><span className="tabular-nums text-white/40">{item.amount}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-400/80 to-cyan-300/80" style={{ width: `${(item.amount / max) * 100}%` }} />
                </div>
            </div>
        ))}
    </div>
}

function VoiceRoles({ roles }: { roles: VoiceRole[] }) {
    const [limit, setLimit] = React.useState(VOICE_PAGE_SIZE)
    const [mainOnly, setMainOnly] = React.useState(false)
    const hasMain = roles.some(role => role.role === "MAIN")
    const filtered = mainOnly ? roles.filter(role => role.role === "MAIN") : roles

    return (
        <section className="space-y-4" data-staff-voice-roles>
            <MediaSectionHeading
                icon={<LuMic />}
                title="Voice roles"
                count={filtered.length}
                aside={hasMain ? <Segmented
                    value={mainOnly ? "main" : "all"}
                    onChange={value => setMainOnly(value === "main")}
                    options={[["all", "All"], ["main", "Main roles"]]}
                /> : undefined}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filtered.slice(0, limit).map(({ character, role, works }) => {
                    const media = works[0]
                    return (
                        <div key={character.id} className="flex overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/10 transition-transform hover:-translate-y-0.5" data-staff-voice-role>
                            <SeaLink href={`/character?id=${character.id}`} className="group flex min-w-0 flex-1 items-center gap-3 p-2">
                                <span className="h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.05]">
                                    {character.image?.large && <img src={getImageUrl(character.image.large)} alt="" loading="lazy" className="size-full object-cover" />}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-white group-hover:text-brand-100">{character.name?.full}</span>
                                    {!!role && <span className="mt-1 inline-block rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-white/65 ring-1 ring-white/10">{capitalize(role)}</span>}
                                    {works.length > 1 && <span className="ml-1.5 text-[11px] text-white/45">{formatCount(works.length)} titles</span>}
                                </span>
                            </SeaLink>
                            {!!media && <SeaLink href={`/entry?id=${media.id}`} className="group flex min-w-0 max-w-[45%] items-center justify-end gap-3 p-2 text-right">
                                <span className="line-clamp-3 min-w-0 text-xs text-white/60 group-hover:text-white">{titleOf(media)}</span>
                                <span className="h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.05]">
                                    {!!(media.coverImage?.large || media.coverImage?.medium) && <img src={getImageUrl(media.coverImage?.large || media.coverImage?.medium || "")} alt="" loading="lazy" className="size-full object-cover" />}
                                </span>
                            </SeaLink>}
                        </div>
                    )
                })}
            </div>
            {filtered.length > limit && <div className="flex justify-center">
                <button
                    type="button"
                    onClick={() => setLimit(l => l + VOICE_PAGE_SIZE)}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                    Show more ({filtered.length - limit}) <LuChevronDown />
                </button>
            </div>}
        </section>
    )
}

function Filmography({ works, anime, manga, note }: { works: Work[], anime: number, manga: number, note?: string }) {
    const [kind, setKind] = React.useState<Kind>("all")
    const [sort, setSort] = React.useState<Sort>("newest")
    const [query, setQuery] = React.useState("")
    const [limit, setLimit] = React.useState(PAGE_SIZE)

    React.useEffect(() => setLimit(PAGE_SIZE), [kind, sort, query])

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        const list = works.filter(({ media }) =>
            (kind === "all" || (kind === "manga") === (media.type === "MANGA")) &&
            (!q || [media.title?.userPreferred, media.title?.english, media.title?.romaji, media.title?.native].some(t => t?.toLowerCase().includes(q))),
        )
        const date = (w: Work) => (yearOf(w.media) ?? 9999) * 10000 + (w.media.startDate?.month ?? 12) * 100 + (w.media.startDate?.day ?? 28)
        switch (sort) {
            case "oldest": return list.sort((a, b) => date(a) - date(b))
            case "score": return list.sort((a, b) => (b.media.meanScore ?? 0) - (a.media.meanScore ?? 0))
            default: return list.sort((a, b) => date(b) - date(a))
        }
    }, [works, kind, sort, query])

    const shown = filtered.slice(0, limit)
    const groups = React.useMemo(() => {
        if (sort === "score") return [{ year: "", works: shown }]
        const out: { year: string, works: Work[] }[] = []
        for (const work of shown) {
            const year = String(yearOf(work.media) ?? "TBA")
            if (out[out.length - 1]?.year !== year) out.push({ year, works: [] })
            out[out.length - 1].works.push(work)
        }
        return out
    }, [shown, sort])

    return (
        <section className="space-y-5" data-staff-filmography>
            <MediaSectionHeading
                icon={<LuSparkles />}
                title="Filmography"
                count={filtered.length}
                aside={note ? <span className="text-xs text-[--muted]">{note}</span> : undefined}
            />

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
                <Segmented value={kind} onChange={setKind} options={[["all", `All ${works.length}`], ["anime", `Anime ${anime}`], ["manga", `Manga ${manga}`]]} />
                <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                        <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/40" />
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search titles"
                            className="w-48 rounded-full bg-white/[0.05] py-1.5 pl-8 pr-3 text-sm text-white ring-1 ring-white/10 placeholder:text-white/35 focus:outline-none focus:ring-white/25"
                        />
                    </label>
                    <Segmented value={sort} onChange={setSort} options={[["newest", "Newest"], ["oldest", "Oldest"], ["score", "Top rated"]]} />
                </div>
            </div>

            {filtered.length === 0 && <p className="py-10 text-center text-sm text-[--muted]">Nothing matches.</p>}

            <div className="space-y-8">
                {groups.map(group => (
                    <div key={group.year || "all"} className="space-y-3">
                        {group.year && <div className="flex items-center gap-3">
                            <span className="text-2xl font-black tabular-nums text-white/90">{group.year}</span>
                            <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                            <span className="text-xs text-white/40">{formatCount(group.works.length)}</span>
                        </div>}
                        <div className="sea-card-grid">
                            {group.works.map(({ media, roles, voices }) => (
                                <div key={media.id} className="min-w-0" data-staff-work>
                                    <MediaEntryCard media={media as any} type={media.type === "MANGA" ? "manga" : "anime"} showLibraryBadge={media.type !== "MANGA"} />
                                    <p className="mt-1 line-clamp-2 px-0.5 text-xs text-brand-200/80" title={[...roles, ...voices].join(", ")}>
                                        {[...voices.map(name => `as ${name}`), ...roles].join(" · ")}
                                    </p>
                                    {!!media.format && <p className="truncate px-0.5 text-[11px] text-white/40">{MEDIA_FORMAT_LABELS[media.format] ?? capitalize(media.format)}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length > limit && <div className="flex justify-center">
                <button
                    type="button"
                    onClick={() => setLimit(l => l + PAGE_SIZE)}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                    Show more ({filtered.length - limit}) <LuChevronDown />
                </button>
            </div>}
        </section>
    )
}

function Segmented<T extends string>({ value, onChange, options }: { value: T, onChange: (v: T) => void, options: [T, string][] }) {
    return (
        <div className="inline-flex w-fit rounded-full bg-white/[0.04] p-0.5 ring-1 ring-white/10">
            {options.map(([v, label]) => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onChange(v)}
                    className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-all",
                        value === v ? "bg-white/[0.14] text-white shadow-sm" : "text-white/55 hover:text-white",
                    )}
                >{label}</button>
            ))}
        </div>
    )
}
