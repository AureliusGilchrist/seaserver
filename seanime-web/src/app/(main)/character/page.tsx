"use client"

import { CharacterMediaNode, CharacterVoiceActor, useGetAnilistCharacterDetails } from "@/api/hooks/anilist.hooks"
import { useGetCharacterFavorites, useToggleCharacterFavorite } from "@/api/hooks/favorites.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { MediaPageHeader, MediaPageHeaderDetailsContainer } from "@/app/(main)/_features/media/_components/media-page-header-components"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip } from "@/components/ui/tooltip"
import { AnilistMarkdown, extractAnilistFacts, Spoiler } from "@/lib/helpers/anilist-markdown"
import { formatNumber } from "@/lib/helpers/number"
import { usePathname, useRouter, useSearchParams } from "@/lib/navigation"
import React, { useMemo } from "react"
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai"
import {
    LuArrowLeft,
    LuBookOpen,
    LuCake,
    LuChevronDown,
    LuCrown,
    LuDroplet,
    LuExternalLink,
    LuHeart,
    LuHourglass,
    LuInfo,
    LuMic,
    LuTv,
    LuUser,
} from "react-icons/lu"

type Role = "MAIN" | "SUPPORTING" | "BACKGROUND"
type Appearance = CharacterMediaNode & { _role?: Role, _voiceActors: CharacterVoiceActor[] }
type VoiceActorEntry = {
    actor: CharacterVoiceActor
    language: string
    notes: string[]
    shows: { id: number, title: string, type?: string }[]
}

const ROLE_LABEL: Record<Role, string> = { MAIN: "Main", SUPPORTING: "Supporting", BACKGROUND: "Background" }
const ROLE_STYLE: Record<Role, string> = {
    MAIN: "bg-amber-400/90 text-black",
    SUPPORTING: "bg-sky-400/90 text-black",
    BACKGROUND: "bg-white/80 text-black",
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export default function Page() {
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const router = useRouter()
    const idFromQuery = Number(searchParams.get("id"))
    const idFromPath = useMemo(() => {
        const match = pathname.match(/\/character\/(\d+)$/)
        if (!match) return 0
        return Number(match[1]) || 0
    }, [pathname])
    const id = idFromQuery || idFromPath || 0

    const { data, isLoading } = useGetAnilistCharacterDetails(id)
    const { data: favIds } = useGetCharacterFavorites()
    const { mutate: toggleFav, isPending: isTogglingFav } = useToggleCharacterFavorite()
    const isFav = !!favIds?.includes(id)

    // Every hook stays above the early returns below: a hook that only runs once data has loaded
    // changes the hook count between renders, and React crashes the page.
    const [tab, setTab] = React.useState<"anime" | "manga">("anime")
    const [roleFilter, setRoleFilter] = React.useState<Role | "ALL">("ALL")
    const [sort, setSort] = React.useState<"popularity" | "year" | "score">("popularity")
    const [vaLanguage, setVaLanguage] = React.useState<string | null>(null)
    const [descOpen, setDescOpen] = React.useState(false)

    const { animeAppearances, mangaAppearances } = useMemo(() => {
        const anime: Appearance[] = []
        const manga: Appearance[] = []
        const seen = new Set<number>()
        for (const edge of data?.media?.edges ?? []) {
            const node = edge?.node
            if (!node || seen.has(node.id)) continue
            seen.add(node.id)
            const item: Appearance = { ...node, _role: edge.characterRole, _voiceActors: edge.voiceActors ?? [] }
            if (node.type === "MANGA") manga.push(item)
            else anime.push(item)
        }
        return { animeAppearances: anime, mangaAppearances: manga }
    }, [data])

    // Voice actors, one entry per actor, grouped by language, with the shows they voice this role in.
    const voiceActorsByLanguage = useMemo(() => {
        const byId = new Map<number, VoiceActorEntry>()
        for (const edge of data?.media?.edges ?? []) {
            const title = edge?.node?.title?.userPreferred || edge?.node?.title?.romaji || ""
            const roles = edge?.voiceActorRoles?.length
                ? edge.voiceActorRoles
                : (edge?.voiceActors ?? []).map(voiceActor => ({ voiceActor, roleNotes: "", dubGroup: "" }))
            for (const role of roles) {
                const va = role?.voiceActor
                if (!va?.id) continue
                let entry = byId.get(va.id)
                if (!entry) {
                    entry = { actor: va, language: va.languageV2 || "Unknown", notes: [], shows: [] }
                    byId.set(va.id, entry)
                }
                for (const note of [role.roleNotes, role.dubGroup]) {
                    if (note && !entry.notes.includes(note)) entry.notes.push(note)
                }
                if (edge?.node?.id && !entry.shows.some(s => s.id === edge.node!.id)) {
                    entry.shows.push({ id: edge.node.id, title, type: edge.node.type })
                }
            }
        }
        const groups = new Map<string, VoiceActorEntry[]>()
        for (const entry of byId.values()) {
            const list = groups.get(entry.language) ?? []
            list.push(entry)
            groups.set(entry.language, list)
        }
        // Japanese first, then the rest by how many actors they have.
        return [...groups.entries()]
            .map(([language, entries]) => ({ language, entries: entries.sort((a, b) => b.shows.length - a.shows.length) }))
            .sort((a, b) => (a.language === "Japanese" ? -1 : b.language === "Japanese" ? 1 : b.entries.length - a.entries.length))
    }, [data])

    const { facts, body } = useMemo(() => extractAnilistFacts(data?.description), [data?.description])

    const heroImage = useMemo(() => {
        const withBanner = [...animeAppearances, ...mangaAppearances]
            .filter(m => !!m.bannerImage)
            .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        return withBanner[0]?.bannerImage || null
    }, [animeAppearances, mangaAppearances])

    // Land on whichever tab has something in it.
    React.useEffect(() => {
        if (!animeAppearances.length && mangaAppearances.length) setTab("manga")
    }, [animeAppearances.length, mangaAppearances.length])

    const activeLanguage = vaLanguage ?? voiceActorsByLanguage[0]?.language ?? null
    const activeVoiceActors = voiceActorsByLanguage.find(g => g.language === activeLanguage)?.entries ?? []

    const appearances = tab === "anime" ? animeAppearances : mangaAppearances
    const roleCounts = useMemo(() => {
        const counts: Record<Role | "ALL", number> = { ALL: appearances.length, MAIN: 0, SUPPORTING: 0, BACKGROUND: 0 }
        for (const a of appearances) if (a._role) counts[a._role]++
        return counts
    }, [appearances])
    const shownAppearances = useMemo(() => {
        const list = roleFilter === "ALL" ? [...appearances] : appearances.filter(a => a._role === roleFilter)
        const year = (m: Appearance) => m.startDate?.year ?? m.seasonYear ?? 0
        if (sort === "year") list.sort((a, b) => year(b) - year(a))
        else if (sort === "score") list.sort((a, b) => (b.averageScore ?? b.meanScore ?? 0) - (a.averageScore ?? a.meanScore ?? 0))
        else list.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        return list
    }, [appearances, roleFilter, sort])

    React.useEffect(() => {
        if (data?.name?.full) document.title = `${data.name.full} | Deus Ex Aeternae`
    }, [data?.name?.full])

    if (isLoading) return <CharacterPageSkeleton />

    if (!data) {
        return (
            <PageWrapper className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <LuUser className="size-10 text-[--muted]" />
                <p className="text-lg font-semibold">Character not found</p>
                <button onClick={() => router.back()} className="text-sm text-brand-300 hover:underline">Go back</button>
            </PageWrapper>
        )
    }

    const dob = data.dateOfBirth
    const today = new Date()
    const birthdayToday = !!dob?.month && !!dob?.day && dob.month === today.getMonth() + 1 && dob.day === today.getDate()
    const dobStr = dob && (dob.month || dob.day)
        ? [dob.month ? MONTHS[dob.month - 1] : null, dob.day, dob.year ? `, ${dob.year}` : null].filter(Boolean).join(" ").replace(" ,", ",")
        : null
    const mainRoles = [...animeAppearances, ...mangaAppearances].filter(a => a._role === "MAIN").length
    const altNames = (data.name?.alternative ?? []).filter(Boolean)
    const spoilerNames = (data.name?.alternativeSpoiler ?? []).filter(Boolean)
    const portrait = data.image?.large || data.image?.medium
    const longDescription = body.length > 700

    const stats: { icon: React.ElementType, label: string, value: React.ReactNode, accent?: string }[] = [
        data.gender && { icon: LuUser, label: "Gender", value: data.gender },
        data.age && { icon: LuHourglass, label: "Age", value: data.age },
        dobStr && {
            icon: LuCake,
            label: "Birthday",
            value: birthdayToday ? <span>{dobStr} <span className="ml-1 rounded-full bg-pink-500/20 px-2 py-0.5 text-xs text-pink-200">Today!</span></span> : dobStr,
            accent: birthdayToday ? "ring-pink-400/40" : undefined,
        },
        data.bloodType && { icon: LuDroplet, label: "Blood type", value: data.bloodType },
        { icon: LuHeart, label: "Favourites", value: formatNumber(data.favourites ?? 0) },
        animeAppearances.length > 0 && { icon: LuTv, label: "Anime", value: animeAppearances.length },
        mangaAppearances.length > 0 && { icon: LuBookOpen, label: "Manga", value: mangaAppearances.length },
        mainRoles > 0 && { icon: LuCrown, label: "Main roles", value: mainRoles },
        ...facts.map(f => ({ icon: LuInfo, label: f.label, value: f.value })),
    ].filter(Boolean) as any

    return (
        <div data-character-page>
            {/* The same hero as the anime and manga pages: full-width banner, black fades, and a
                fade as you scroll. It sits above the global effects layer (z-[5]), the content at z-[8]. */}
            <div className="relative z-[6]">
                <MediaPageHeader backgroundImage={heroImage ?? undefined} coverImage={portrait ?? undefined}>
                    <MediaPageHeaderDetailsContainer>
                        <button
                            onClick={() => router.back()}
                            className="flex size-10 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur transition hover:bg-black/60"
                            aria-label="Back"
                        >
                            <LuArrowLeft className="size-5" />
                        </button>
                        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end">
                            {portrait && (
                                <div className="w-40 shrink-0 animate-in fade-in zoom-in-95 duration-500 sm:w-52">
                                    <div className="aspect-[2/3] overflow-hidden rounded-2xl bg-gray-900 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/15">
                                        <img src={portrait} alt={data.name?.full ?? ""} className="size-full object-cover" />
                                    </div>
                                </div>
                            )}
                            <div className="min-w-0 flex-1 space-y-3 pb-1 text-center animate-in fade-in slide-in-from-bottom-3 duration-500 sm:text-left">
                                <div>
                                    <h1 className="text-3xl font-bold leading-tight tracking-tight drop-shadow sm:text-4xl lg:text-5xl">{data.name?.full}</h1>
                                    {data.name?.native && <p className="mt-1 text-lg text-white/70">{data.name.native}</p>}
                                </div>
                                {(altNames.length > 0 || spoilerNames.length > 0) && (
                                    <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                                        {altNames.map(alt => (
                                            <span key={alt} className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-xs text-white/80 ring-1 ring-white/10">{alt}</span>
                                        ))}
                                        {spoilerNames.map(alt => (
                                            <span key={alt} className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-xs text-white/80 ring-1 ring-white/10">
                                                <Spoiler>{alt}</Spoiler>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                                    <Tooltip
                                        trigger={
                                            <button
                                                disabled={isTogglingFav || !id}
                                                onClick={() => id && toggleFav({ characterId: id })}
                                                className={cn(
                                                    "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition active:scale-95",
                                                    isFav ? "bg-red-500/20 text-red-200 ring-1 ring-red-400/40" : "bg-white/[0.08] text-white ring-1 ring-white/10 hover:bg-white/[0.12]",
                                                )}
                                            >
                                                {isFav ? <AiFillHeart className="size-4 text-red-400" /> : <AiOutlineHeart className="size-4" />}
                                                {isFav ? "Favourited" : "Favourite"}
                                            </button>
                                        }
                                    >
                                        {isFav ? "Remove from favorites" : "Add to favorites"}
                                    </Tooltip>
                                    {data.siteUrl && (
                                        <a
                                            href={data.siteUrl}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-4 py-1.5 text-sm text-white/90 ring-1 ring-white/10 transition hover:bg-white/[0.12]"
                                        >
                                            AniList <LuExternalLink className="size-3.5" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </MediaPageHeaderDetailsContainer>
                </MediaPageHeader>
            </div>

            <div className="relative z-[8] px-4 md:px-8">
            <PageWrapper className="relative pb-16">
            <div className="mx-auto max-w-[110rem]">
                {/* Facts */}
                {stats.length > 0 && (
                    <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                        {stats.map((s, i) => {
                            const Icon = s.icon
                            return (
                                <div
                                    key={`${s.label}-${i}`}
                                    className={cn(
                                        "flex min-w-0 items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.07] animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
                                        s.accent,
                                    )}
                                    style={{ animationDelay: `${80 + i * 35}ms` }}
                                >
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                                        <Icon className="size-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[--muted]">{s.label}</p>
                                        <p className="truncate text-sm font-medium" title={typeof s.value === "string" ? s.value : undefined}>{s.value}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* About */}
                {body && (
                    <section className="mt-8 rounded-2xl bg-white/[0.02] p-5 ring-1 ring-white/[0.06] sm:p-6">
                        <h2 className="mb-3 text-lg font-semibold">About</h2>
                        <div className={cn("relative overflow-hidden text-[0.95rem] leading-relaxed text-white/75", longDescription && !descOpen && "max-h-56")}>
                            <AnilistMarkdown text={body} />
                            {longDescription && !descOpen && (
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[--background] to-transparent" />
                            )}
                        </div>
                        {longDescription && (
                            <button
                                onClick={() => setDescOpen(o => !o)}
                                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-300 hover:text-brand-200"
                            >
                                {descOpen ? "Show less" : "Read more"}
                                <LuChevronDown className={cn("size-4 transition-transform", descOpen && "rotate-180")} />
                            </button>
                        )}
                    </section>
                )}

                {/* Voice actors */}
                {voiceActorsByLanguage.length > 0 && (
                    <section className="mt-10 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="flex items-center gap-2 text-xl font-semibold"><LuMic className="size-5 text-brand-300" /> Voice actors</h2>
                            {voiceActorsByLanguage.length > 1 && (
                                <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
                                    {voiceActorsByLanguage.map(g => (
                                        <PillButton key={g.language} active={g.language === activeLanguage} onClick={() => setVaLanguage(g.language)}>
                                            {g.language} <span className="opacity-60">{g.entries.length}</span>
                                        </PillButton>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2.5">
                            {activeVoiceActors.map(({ actor, notes, shows }) => (
                                <Tooltip
                                    key={actor.id}
                                    side="bottom"
                                    trigger={
                                        <SeaLink
                                            href={`/staff?id=${actor.id}`}
                                            className="group flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/[0.07] transition hover:-translate-y-0.5 hover:bg-white/[0.06] hover:ring-white/15"
                                        >
                                            <div className="size-14 shrink-0 overflow-hidden rounded-full bg-gray-800 ring-2 ring-white/10 transition group-hover:ring-brand-400/50">
                                                {(actor.image?.large || actor.image?.medium) && (
                                                    <img src={actor.image?.large || actor.image?.medium} alt="" className="size-full object-cover" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold">{actor.name?.full}</p>
                                                {actor.name?.native && <p className="truncate text-xs text-[--muted]">{actor.name.native}</p>}
                                                <p className="truncate text-xs text-[--muted]">
                                                    {notes.length ? notes.join(" · ") : `${shows.length} ${shows.length === 1 ? "title" : "titles"}`}
                                                </p>
                                            </div>
                                        </SeaLink>
                                    }
                                >
                                    <div className="max-w-xs space-y-0.5 text-xs">
                                        {shows.slice(0, 8).map(s => <p key={s.id} className="truncate">{s.title}</p>)}
                                        {shows.length > 8 && <p className="opacity-70">and {shows.length - 8} more</p>}
                                    </div>
                                </Tooltip>
                            ))}
                        </div>
                    </section>
                )}

                {/* Appearances */}
                {(animeAppearances.length > 0 || mangaAppearances.length > 0) && (
                    <section className="mt-10 space-y-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.07] self-start">
                                {animeAppearances.length > 0 && (
                                    <TabButton active={tab === "anime"} onClick={() => { setTab("anime"); setRoleFilter("ALL") }}>
                                        <LuTv className="size-4" /> Anime <span className="opacity-60">{animeAppearances.length}</span>
                                    </TabButton>
                                )}
                                {mangaAppearances.length > 0 && (
                                    <TabButton active={tab === "manga"} onClick={() => { setTab("manga"); setRoleFilter("ALL") }}>
                                        <LuBookOpen className="size-4" /> Manga <span className="opacity-60">{mangaAppearances.length}</span>
                                    </TabButton>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
                                    {(["ALL", "MAIN", "SUPPORTING", "BACKGROUND"] as const).filter(r => r === "ALL" || roleCounts[r] > 0).map(r => (
                                        <PillButton key={r} active={roleFilter === r} onClick={() => setRoleFilter(r)}>
                                            {r === "ALL" ? "All roles" : ROLE_LABEL[r]} <span className="opacity-60">{roleCounts[r]}</span>
                                        </PillButton>
                                    ))}
                                </div>
                                <select
                                    value={sort}
                                    onChange={e => setSort(e.target.value as any)}
                                    className="rounded-lg border-0 bg-white/[0.05] py-1.5 pl-3 pr-8 text-sm ring-1 ring-white/10 focus:ring-brand-400/50"
                                    aria-label="Sort appearances"
                                >
                                    <option value="popularity">Most popular</option>
                                    <option value="year">Newest</option>
                                    <option value="score">Highest rated</option>
                                </select>
                            </div>
                        </div>

                        <div className={cn("sea-card-grid", tab === "manga" ? "sea-card-manga" : "sea-card-anime")}>
                            {shownAppearances.map(media => (
                                <div key={media.id} className="col-span-1">
                                    <MediaEntryCard
                                        media={media as any}
                                        type={tab}
                                        showLibraryBadge={tab === "anime"}
                                        overlay={media._role ? (
                                            <span className={cn("absolute left-2 top-2 z-[5] rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider shadow", ROLE_STYLE[media._role])}>
                                                {ROLE_LABEL[media._role]}
                                            </span>
                                        ) : undefined}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
            </PageWrapper>
            </div>
        </div>
    )
}

function TabButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
                active ? "bg-brand-500/20 text-white ring-1 ring-brand-400/40" : "text-[--muted] hover:text-white",
            )}
        >
            {children}
        </button>
    )
}

function PillButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
                active ? "bg-white text-black" : "bg-white/[0.05] text-white/80 ring-1 ring-white/10 hover:bg-white/[0.09]",
            )}
        >
            {children}
        </button>
    )
}

function CharacterPageSkeleton() {
    return (
        <PageWrapper className="relative pb-16">
            <Skeleton className="h-[16rem] w-full rounded-none sm:h-[20rem] lg:h-[22rem]" />
            <div className="relative z-[2] mx-auto -mt-36 max-w-[110rem] px-4 sm:-mt-44 sm:px-8">
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end">
                    <Skeleton className="aspect-[2/3] w-40 rounded-2xl sm:w-52" />
                    <div className="w-full flex-1 space-y-3">
                        <Skeleton className="mx-auto h-10 w-2/3 sm:mx-0 sm:w-1/3" />
                        <Skeleton className="mx-auto h-5 w-1/3 sm:mx-0 sm:w-1/5" />
                    </div>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
                </div>
                <Skeleton className="mt-8 h-40 rounded-2xl" />
            </div>
        </PageWrapper>
    )
}
