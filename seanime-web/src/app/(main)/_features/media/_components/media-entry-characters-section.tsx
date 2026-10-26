"use client"
import { AL_AnimeDetailsById_Media, AL_MangaDetailsById_Media } from "@/api/generated/types"
import { MediaCharacterEdge, useGetMediaCharacters } from "@/api/hooks/anilist.hooks"
import { imageShimmer } from "@/components/shared/image-helpers"
import { SeaImage } from "@/components/shared/sea-image"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { Drawer } from "@/components/ui/drawer"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useThemeSettings } from "@/lib/theme/hooks"
import React from "react"
import { BiSolidHeart } from "react-icons/bi"
import { LuChevronRight, LuSearch, LuUsers } from "react-icons/lu"

type RelationsRecommendationsSectionProps = {
    details: AL_AnimeDetailsById_Media | AL_MangaDetailsById_Media | undefined
    isMangaPage?: boolean
}

type Role = "MAIN" | "SUPPORTING" | "BACKGROUND"
const ROLE_LABEL: Record<Role, string> = { MAIN: "Main", SUPPORTING: "Supporting", BACKGROUND: "Background" }
const ROLE_PILL: Record<Role, string> = {
    MAIN: "bg-amber-400/15 text-amber-200 ring-amber-400/30",
    SUPPORTING: "bg-sky-400/15 text-sky-200 ring-sky-400/30",
    BACKGROUND: "bg-white/[0.06] text-white/70 ring-white/10",
}

/** How many characters the section shows before "View all". */
const SECTION_LIMIT = 12

export function MediaEntryCharactersSection(props: RelationsRecommendationsSectionProps) {

    const {
        details,
        isMangaPage,
    } = props

    const ts = useThemeSettings()
    const [drawerOpen, setDrawerOpen] = React.useState(false)
    const allEdges = details?.characters?.edges ?? []
    const characters = React.useMemo(() => {
        return allEdges.filter(n => n.role === "MAIN" || n.role === "SUPPORTING")
    }, [allEdges])

    if (characters.length === 0) return null

    const solidTiles = !!ts.libraryScreenCustomBackgroundImage && ts.libraryScreenCustomBackgroundOpacity > 5

    return (
        <>
            <div className="flex items-center justify-between gap-3">
                <h2 data-media-entry-characters-section-title>Characters</h2>
                <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="group inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-sm font-medium text-white/85 ring-1 ring-white/10 transition hover:bg-white/[0.1] hover:text-white"
                >
                    <LuUsers className="size-4" />
                    View all
                    <LuChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </button>
            </div>

            <div
                data-media-entry-characters-section-grid
                className={cn(
                    "grid gap-2",
                    isMangaPage
                        ? "grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))]"
                        : "grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))]",
                )}
            >
                {characters.slice(0, SECTION_LIMIT).map(edge => (
                    <SeaLink
                        key={edge?.node?.id}
                        href={edge?.node?.id ? `/character?id=${edge.node.id}` : "#"}
                        data-media-entry-characters-section-grid-item
                        className={cn(
                            "group/char flex min-w-0 items-center gap-3 rounded-xl p-2 ring-1 transition duration-200 hover:-translate-y-0.5",
                            solidTiles
                                ? "bg-[--background] ring-white/10 hover:ring-white/20"
                                : "bg-white/[0.025] ring-white/[0.06] hover:bg-white/[0.06] hover:ring-white/15",
                        )}
                    >
                        <div
                            data-media-entry-characters-section-grid-item-image-container
                            className="relative aspect-[3/4] w-12 flex-none overflow-hidden rounded-lg bg-[--background]"
                        >
                            {edge?.node?.image?.large && <SeaImage
                                data-media-entry-characters-section-grid-item-image
                                src={edge.node.image.large}
                                alt="character image"
                                fill
                                quality={60}
                                placeholder={imageShimmer(700, 475)}
                                sizes="4rem"
                                className="select-none object-cover object-center transition duration-300 group-hover/char:scale-105"
                            />}
                        </div>
                        <div data-media-entry-characters-section-grid-item-content className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold leading-tight transition group-hover/char:text-brand-100">
                                {edge?.node?.name?.full}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                                {edge?.role && <RolePill role={edge.role as Role} />}
                                {edge?.node?.age && <span className="truncate text-xs text-[--muted]">{edge.node.age} y/o</span>}
                            </div>
                        </div>
                        {edge?.node?.isFavourite && <BiSolidHeart className="size-4 shrink-0 text-pink-500" />}
                    </SeaLink>
                ))}
            </div>

            <AllCharactersDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                mediaId={details?.id}
            />
        </>
    )
}

function RolePill({ role }: { role: Role }) {
    return (
        <span className={cn("shrink-0 rounded-md px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wider ring-1", ROLE_PILL[role] ?? ROLE_PILL.BACKGROUND)}>
            {ROLE_LABEL[role] ?? role}
        </span>
    )
}

function AllCharactersDrawer({ open, onOpenChange, mediaId }: {
    open: boolean
    onOpenChange: (v: boolean) => void
    mediaId: number | undefined
}) {
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useGetMediaCharacters(mediaId, open)
    const [search, setSearch] = React.useState("")
    const [role, setRole] = React.useState<Role | "ALL">("ALL")

    const edges = React.useMemo(() => {
        const seen = new Set<number>()
        const out: MediaCharacterEdge[] = []
        for (const page of data?.pages ?? []) for (const e of page?.edges ?? []) {
            if (!e?.node?.id || seen.has(e.node.id)) continue
            seen.add(e.node.id)
            out.push(e)
        }
        return out
    }, [data])
    const total = data?.pages?.[0]?.total ?? edges.length

    const counts = React.useMemo(() => {
        const c: Record<Role | "ALL", number> = { ALL: edges.length, MAIN: 0, SUPPORTING: 0, BACKGROUND: 0 }
        for (const e of edges) if (e.role) c[e.role]++
        return c
    }, [edges])

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()
        return edges.filter(e => {
            if (role !== "ALL" && e.role !== role) return false
            if (!q) return true
            const n = e.node?.name
            return [n?.full, n?.native, n?.userPreferred, ...(e.voiceActors ?? []).map(v => v.name?.full)]
                .some(s => s?.toLowerCase().includes(q))
        })
    }, [edges, role, search])

    // Infinite scroll: load the next page when the sentinel comes into view. While searching, keep
    // loading so the search covers every character.
    const sentinelRef = React.useRef<HTMLDivElement>(null)
    React.useEffect(() => {
        const el = sentinelRef.current
        if (!el || !open) return
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting) && hasNextPage && !isFetchingNextPage) fetchNextPage()
        }, { rootMargin: "400px 0px" })
        io.observe(el)
        return () => io.disconnect()
    }, [open, hasNextPage, isFetchingNextPage, fetchNextPage, filtered.length])

    return (
        <Drawer
            open={open}
            onOpenChange={onOpenChange}
            side="right"
            size="xl"
            title={<span className="flex items-center gap-2"><LuUsers className="size-5 text-brand-300" /> Characters</span>}
            description={total ? `${total} ${total === 1 ? "character" : "characters"}` : undefined}
            contentClass="max-sm:max-w-full"
        >
            <div className="sticky top-0 z-[2] -mx-1 space-y-3 bg-[--background]/90 px-1 pb-3 pt-1 backdrop-blur">
                <div className="relative">
                    <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[--muted]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search characters or voice actors"
                        className="w-full rounded-xl border-0 bg-white/[0.05] py-2 pl-9 pr-3 text-sm ring-1 ring-white/10 placeholder:text-[--muted] focus:ring-brand-400/50"
                    />
                </div>
                <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                    {(["ALL", "MAIN", "SUPPORTING", "BACKGROUND"] as const).map(r => (
                        <button
                            key={r}
                            onClick={() => setRole(r)}
                            className={cn(
                                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
                                role === r ? "bg-white text-black" : "bg-white/[0.05] text-white/80 ring-1 ring-white/10 hover:bg-white/[0.09]",
                            )}
                        >
                            {r === "ALL" ? "All" : ROLE_LABEL[r]} <span className="opacity-60">{counts[r]}</span>
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="py-16"><LoadingSpinner /></div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 pb-6">
                    {filtered.map((e, i) => {
                        const va = e.voiceActors?.[0]
                        return (
                            <SeaLink
                                key={e.node!.id}
                                href={`/character?id=${e.node!.id}`}
                                onClick={() => onOpenChange(false)}
                                className="group/c relative block overflow-hidden rounded-xl bg-gray-900 ring-1 ring-white/10 transition duration-200 hover:-translate-y-0.5 hover:ring-white/25 animate-in fade-in fill-mode-both"
                                style={{ animationDelay: `${Math.min(i, 24) * 20}ms` }}
                            >
                                <div className="relative aspect-[2/3]">
                                    {(e.node?.image?.large || e.node?.image?.medium) && (
                                        <img
                                            src={e.node?.image?.large || e.node?.image?.medium}
                                            alt=""
                                            loading="lazy"
                                            className="absolute inset-0 size-full object-cover transition duration-500 group-hover/c:scale-105"
                                        />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                                    {e.role && <span className="absolute left-1.5 top-1.5"><RolePill role={e.role} /></span>}
                                    {e.node?.isFavourite && <BiSolidHeart className="absolute right-1.5 top-1.5 size-4 text-pink-500 drop-shadow" />}
                                    <div className="absolute inset-x-0 bottom-0 p-2">
                                        <p className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow">{e.node?.name?.full}</p>
                                        {va && (
                                            <div className="mt-1.5 flex items-center gap-1.5">
                                                {(va.image?.medium || va.image?.large) && (
                                                    <img src={va.image?.medium || va.image?.large} alt="" loading="lazy" className="size-5 rounded-full object-cover ring-1 ring-white/30" />
                                                )}
                                                <span className="truncate text-[0.7rem] text-white/70">{va.name?.full}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </SeaLink>
                        )
                    })}
                    {!filtered.length && !hasNextPage && (
                        <p className="col-span-full py-10 text-center text-sm text-[--muted]">No characters match.</p>
                    )}
                </div>
            )}
            <div ref={sentinelRef} className="h-px" />
            {isFetchingNextPage && <div className="pb-6"><LoadingSpinner /></div>}
        </Drawer>
    )
}
