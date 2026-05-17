"use client"
import React from "react"
import { useAtomValue } from "jotai"
import { toast } from "sonner"
import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import {
    useSearchThemeMusic,
    useDownloadThemeMusic,
    useListThemeMusicTracks,
    useIsThemeMusicDownloading,
    type ThemeMusicTorrent,
} from "@/api/hooks/theme-music.hooks"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { cn } from "@/components/ui/core/styling"
import { LuMusic, LuSearch, LuDownload, LuLoader, LuExternalLink, LuX } from "react-icons/lu"

function formatSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return "—"
    const units = ["B", "KB", "MB", "GB", "TB"]
    let v = bytes
    let i = 0
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024
        i++
    }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(date?: string): string {
    if (!date) return ""
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleDateString()
}

/**
 * Build a small set of synonym queries from a base theme name so the OST
 * search can hit several phrasings at once. We strip common decorations
 * (season/part/year/(TV)/(Movie)) for the "base" stem, then append a few
 * standard music-release keywords. Returns variants in priority order,
 * de-duplicated case-insensitively, capped to 4 variants.
 */
function buildOstQueryVariants(rawName: string): { primary: string; variants: string[] } {
    const trimmed = (rawName || "").trim()
    if (!trimmed) return { primary: "", variants: [] }

    // Strip common decorations to get a cleaner stem for synonym generation.
    let stem = trimmed
        .replace(/\s*\((?:tv|movie|ova|ona|special)\)\s*$/i, "")
        .replace(/\s+season\s+\d+\s*$/i, "")
        .replace(/\s+part\s+\d+\s*$/i, "")
        .replace(/\s+\(\d{4}\)\s*$/, "")
        .replace(/\s+\d{4}\s*$/, "")
        .trim()
    if (!stem) stem = trimmed

    const alreadyHasMusic = /\b(ost|soundtrack|original\s+soundtrack)\b/i.test(trimmed)

    const ordered: string[] = []
    const seen = new Set<string>()
    const push = (s: string) => {
        const v = s.trim()
        if (!v) return
        const key = v.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        ordered.push(v)
    }

    if (alreadyHasMusic) {
        push(trimmed)
    } else {
        push(`${trimmed} OST`)
    }
    push(`${stem} Original Soundtrack`)
    push(`${stem} Soundtrack`)
    push(`${stem} OST FLAC`)

    const capped = ordered.slice(0, 4)
    return { primary: capped[0] || trimmed, variants: capped.slice(1) }
}

export function GlobalOstSearchButton() {
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const animeTheme = useAnimeThemeOrNull()
    const themeId = animeTheme?.themeId ?? ""
    const themeDisplayName = animeTheme?.config?.displayName ?? themeId

    const [open, setOpen] = React.useState(false)

    // Hide the floating button entirely while any player is fullscreen so it
    // doesn't sit on top of the video.
    if (isFullscreen) return null

    // Bottom-right corner. In fullscreen, lift above the player control bar.
    const bottomPosition = isFullscreen ? "bottom-[140px]" : "bottom-5"
    const disabled = !themeId

    return (
        <>
            <button
                onClick={() => { if (!disabled) setOpen(true) }}
                title={disabled ? "Select a theme to search OST" : `Find OST — ${themeDisplayName}`}
                disabled={disabled}
                className={cn(
                    "fixed right-5 z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl",
                    "border shadow-xl transition-all duration-300 ease-out",
                    "text-[--foreground] font-semibold group",
                    bottomPosition,
                    disabled
                        ? "opacity-40 cursor-not-allowed bg-white/[0.04] border-white/[0.06]"
                        : "bg-white/[0.08] border-white/[0.12] backdrop-blur-md hover:brightness-125 cursor-pointer",
                )}
                style={{
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                }}
            >
                <LuMusic className="w-3.5 h-3.5 text-white/80 group-hover:text-white" />
                <span className="text-[10px] uppercase tracking-wider text-white/80 group-hover:text-white">OST</span>
            </button>

            {open && (
                <OstSearchPanel
                    themeId={themeId}
                    themeDisplayName={themeDisplayName}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}

type OstSearchPanelProps = {
    themeId: string
    themeDisplayName: string
    onClose: () => void
}

function OstSearchPanel({ themeId, themeDisplayName, onClose }: OstSearchPanelProps) {
    const [query, setQuery] = React.useState<string>("")
    const [hasSearched, setHasSearched] = React.useState(false)
    const [confirmTarget, setConfirmTarget] = React.useState<ThemeMusicTorrent | null>(null)
    const [downloadingMagnet, setDownloadingMagnet] = React.useState<string | null>(null)
    // Local results buffer; we manage results explicitly instead of relying on
    // a possibly-missing search.reset(), so the panel never shows stale data.
    const [results, setResults] = React.useState<ThemeMusicTorrent[]>([])
    const [searchError, setSearchError] = React.useState<string | null>(null)

    const search = useSearchThemeMusic()
    const download = useDownloadThemeMusic()
    const existing = useListThemeMusicTracks(themeId, true)
    const isDownloading = useIsThemeMusicDownloading(themeId)

    // Seed the query with the theme display name plus an "OST" suffix unless the
    // name already references music — torrent providers won't return anything
    // useful for a bare title like "Cowboy Bebop", so this gives users a sane
    // starting point. They can still edit the query before searching.
    React.useEffect(() => {
        const base = (themeDisplayName ?? themeId).trim()
        const hasMusicHint = /\b(ost|soundtrack|original\s+soundtrack)\b/i.test(base)
        setQuery(base && !hasMusicHint ? `${base} OST` : base)
        setHasSearched(false)
        setConfirmTarget(null)
        setDownloadingMagnet(null)
        setResults([])
        setSearchError(null)
        // Best-effort reset of the underlying mutation cache.
        ;(search as any).reset?.()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themeId])

    const torrents = results
    const hasExisting = (existing.data?.length ?? 0) > 0

    function runSearch() {
        const q = query.trim()
        if (!q) {
            toast.error("Enter a search query")
            return
        }
        setHasSearched(true)
        setSearchError(null)
        // Build synonym variants on top of whatever the user typed so we hit
        // a few common OST naming patterns ("X OST", "X Original Soundtrack",
        // "X Soundtrack", "X OST FLAC"). The server merges/dedupes results
        // across all variants.
        const { primary, variants } = buildOstQueryVariants(q)
        // Always re-fire — never rely on mutation idempotency / cached data.
        search.mutate(
            { themeId, query: primary || q, queries: variants },
            {
                onSuccess: (data: any) => {
                    setResults((data?.torrents ?? []) as ThemeMusicTorrent[])
                },
                onError: (err: any) => {
                    setResults([])
                    setSearchError(err?.message ?? "Search failed")
                },
            },
        )
    }

    function clearResults() {
        setResults([])
        setHasSearched(false)
        setSearchError(null)
        ;(search as any).reset?.()
    }

    function pickMagnet(t: ThemeMusicTorrent): string | null {
        return t.magnetLink || t.downloadUrl || null
    }

    function torrentKey(t: ThemeMusicTorrent): string {
        return t.infoHash || t.magnetLink || t.downloadUrl || t.link || t.name
    }

    function requestDownload(t: ThemeMusicTorrent) {
        if (hasExisting) {
            setConfirmTarget(t)
            return
        }
        performDownload(t, false)
    }

    function performDownload(t: ThemeMusicTorrent, replaceExisting: boolean) {
        setDownloadingMagnet(torrentKey(t))
        download.mutate(
            {
                themeId,
                magnetUrl: pickMagnet(t) ?? "",
                provider: t.provider,
                torrent: t,
                replaceExisting,
            },
            {
                onSuccess: () => {
                    toast.success("Download started", { description: t.name })
                    setConfirmTarget(null)
                    onClose()
                },
                onError: (err: any) => {
                    toast.error("Download failed", { description: err?.message ?? String(err) })
                },
                onSettled: () => {
                    setDownloadingMagnet(null)
                },
            },
        )
    }

    return (
        <>
            <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                />
                <div className="relative z-10 w-full max-w-3xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[--background] border border-[--border] shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[--border] shrink-0">
                        <div className="flex items-center gap-3">
                            <LuMusic className="w-5 h-5 text-[--color-brand-400]" />
                            <div>
                                <h2 className="text-lg font-bold leading-tight">Find OST</h2>
                                <p className="text-xs text-[--muted]">Searching for: {themeDisplayName}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-[--muted] hover:text-[--foreground] hover:bg-white/5 transition-colors"
                        >
                            <LuX className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="overflow-y-auto p-6 flex flex-col gap-4">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                runSearch()
                            }}
                            className="flex items-center gap-2"
                        >
                            <TextInput
                                value={query}
                                onValueChange={(v: string) => setQuery(v)}
                                placeholder="e.g. Cowboy Bebop OST FLAC"
                                leftIcon={<LuSearch className="size-4" />}
                                fieldClass="flex-1"
                            />
                            <Button type="submit" intent="primary" loading={search.isPending} disabled={!query.trim()}>
                                Search
                            </Button>
                            {(hasSearched || results.length > 0) && (
                                <Button type="button" intent="white-subtle" onClick={clearResults}>
                                    Clear
                                </Button>
                            )}
                        </form>

                        {query.trim() && (() => {
                            const { variants } = buildOstQueryVariants(query)
                            if (variants.length === 0) return null
                            return (
                                <p className="text-[11px] text-[--muted] -mt-2" title={variants.join("  •  ")}>
                                    Also searching: <span className="text-[--foreground]/70">{variants.join(" · ")}</span>
                                </p>
                            )
                        })()}

                        {isDownloading && (
                            <div className="flex items-center gap-2 rounded-md border border-[--color-brand-700] bg-[--color-brand-900]/30 px-3 py-2 text-xs text-[--color-brand-200]">
                                <LuLoader className="size-3.5 animate-spin shrink-0" />
                                <span>A download is in progress for this theme — new tracks will appear automatically once the torrent finishes.</span>
                            </div>
                        )}

                        {hasExisting && (
                            <p className="text-xs text-[--muted]">
                                This theme already has {existing.data?.length} downloaded audio file
                                {(existing.data?.length ?? 0) > 1 ? "s" : ""}. Downloading a new OST will prompt to replace them.
                            </p>
                        )}

                        {searchError && (
                            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                                Search failed: {searchError}
                            </div>
                        )}

                        {hasSearched && !search.isPending && torrents.length === 0 && !searchError && (
                            <div className="rounded-md border border-[--border] bg-[--paper] p-6 text-center text-sm text-[--muted]">
                                <LuMusic className="size-6 mx-auto mb-2 opacity-60" />
                                No results. Try a different query or provider.
                            </div>
                        )}

                        {torrents.length > 0 && (
                            <div className="max-h-[60vh] overflow-y-auto rounded-md border border-[--border]">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-[--background] text-xs text-[--muted]">
                                        <tr>
                                            <th className="text-left font-medium px-3 py-2">Name</th>
                                            <th className="text-right font-medium px-2 py-2 whitespace-nowrap">Size</th>
                                            <th className="text-right font-medium px-2 py-2">S/L</th>
                                            <th className="text-left font-medium px-2 py-2 whitespace-nowrap">Date</th>
                                            <th className="px-2 py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {torrents.map((t, i) => {
                                            const magnet = pickMagnet(t)
                                            const tKey = torrentKey(t)
                                            const isRowDownloading = downloadingMagnet === tKey
                                            const canDownload = !!magnet || !!t.provider || !!t.link
                                            return (
                                                <tr key={(t.infoHash || t.link || t.name) + ":" + i} className="border-t border-[--border] hover:bg-white/[0.02]">
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-start gap-2">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-medium" title={t.name}>{t.name}</p>
                                                                <p className="text-xs text-[--muted]">
                                                                    {[t.provider, t.releaseGroup, t.resolution].filter(Boolean).join(" • ")}
                                                                </p>
                                                            </div>
                                                            {t.link && (
                                                                <a
                                                                    href={t.link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-[--muted] hover:text-[--foreground] shrink-0"
                                                                    title="Open torrent page"
                                                                >
                                                                    <LuExternalLink className="size-3.5" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2 text-right whitespace-nowrap text-[--muted]">
                                                        {t.formattedSize || formatSize(t.size)}
                                                    </td>
                                                    <td className="px-2 py-2 text-right whitespace-nowrap">
                                                        <span className="text-green-400">{t.seeders ?? 0}</span>
                                                        <span className="text-[--muted]"> / </span>
                                                        <span className="text-red-400">{t.leechers ?? 0}</span>
                                                    </td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-[--muted] text-xs">
                                                        {formatDate(t.date)}
                                                    </td>
                                                    <td className="px-2 py-2 text-right">
                                                        <Button
                                                            size="sm"
                                                            intent="primary-subtle"
                                                            leftIcon={isRowDownloading ? <LuLoader className="size-3.5 animate-spin" /> : <LuDownload className="size-3.5" />}
                                                            disabled={!canDownload || isRowDownloading || download.isPending}
                                                            onClick={() => requestDownload(t)}
                                                        >
                                                            {isRowDownloading ? "Sending…" : "Download"}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {confirmTarget && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmTarget(null)} />
                    <div className="relative z-10 w-full max-w-md rounded-2xl bg-[--background] border border-[--border] shadow-2xl p-6">
                        <h3 className="text-lg font-bold mb-1">Replace existing OST?</h3>
                        <p className="text-xs text-[--muted] mb-4">
                            This theme already has {existing.data?.length ?? 0} audio file
                            {(existing.data?.length ?? 0) > 1 ? "s" : ""}. Choose how to proceed.
                        </p>
                        <p className="text-sm text-[--muted] mb-4 break-words">
                            Adding: <span className="text-[--foreground]">{confirmTarget.name}</span>
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 justify-end">
                            <Button intent="white-subtle" onClick={() => setConfirmTarget(null)}>Cancel</Button>
                            <Button
                                intent="warning-subtle"
                                onClick={() => performDownload(confirmTarget, false)}
                                loading={download.isPending && !!downloadingMagnet}
                            >
                                Keep existing & add new
                            </Button>
                            <Button
                                intent="alert"
                                onClick={() => performDownload(confirmTarget, true)}
                                loading={download.isPending && !!downloadingMagnet}
                            >
                                Replace all
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
