"use client"

import React from "react"
import { toast } from "sonner"
import {
    useSearchThemeMusic,
    useDownloadThemeMusic,
    useListThemeMusicTracks,
    useIsThemeMusicDownloading,
    type ThemeMusicTorrent,
} from "@/api/hooks/theme-music.hooks"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { LuSearch, LuDownload, LuLoader, LuMusic, LuExternalLink } from "react-icons/lu"
import { cn } from "@/components/ui/core/styling"

type FindOstModalProps = {
    themeId: string
    themeDisplayName?: string
    open: boolean
    onOpenChange: (v: boolean) => void
}

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

export function FindOstModal(props: FindOstModalProps) {
    const { themeId, themeDisplayName, open, onOpenChange } = props

    const [query, setQuery] = React.useState<string>("")
    const [hasSearched, setHasSearched] = React.useState(false)
    const [confirmTarget, setConfirmTarget] = React.useState<ThemeMusicTorrent | null>(null)
    const [downloadingMagnet, setDownloadingMagnet] = React.useState<string | null>(null)

    const search = useSearchThemeMusic()
    const download = useDownloadThemeMusic()
    const existing = useListThemeMusicTracks(themeId, open)
    const isDownloading = useIsThemeMusicDownloading(themeId)

    // Reset/seed query when the modal is (re)opened for a new theme.
    React.useEffect(() => {
        if (open) {
            const base = (themeDisplayName ?? themeId).trim()
            setQuery(base ? `${base} OST` : "")
            setHasSearched(false)
            setConfirmTarget(null)
            setDownloadingMagnet(null)
            search.reset?.()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, themeId])

    const torrents: ThemeMusicTorrent[] = (search.data?.torrents ?? []) as any
    const hasExisting = (existing.data?.length ?? 0) > 0

    function runSearch() {
        const q = query.trim()
        if (!q) {
            toast.error("Enter a search query")
            return
        }
        setHasSearched(true)
        search.mutate({ themeId, query: q })
    }

    function pickMagnet(t: ThemeMusicTorrent): string | null {
        return t.magnetLink || t.downloadUrl || null
    }

    function requestDownload(t: ThemeMusicTorrent) {
        const magnet = pickMagnet(t)
        if (!magnet) {
            toast.error("No magnet/download URL on this torrent")
            return
        }
        if (hasExisting) {
            setConfirmTarget(t)
            return
        }
        performDownload(t, false)
    }

    function performDownload(t: ThemeMusicTorrent, replaceExisting: boolean) {
        const magnet = pickMagnet(t)
        if (!magnet) return
        setDownloadingMagnet(magnet)
        download.mutate(
            { themeId, magnetUrl: magnet, replaceExisting },
            {
                onSuccess: () => {
                    toast.success("Download started", { description: t.name })
                    setConfirmTarget(null)
                    onOpenChange(false)
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
            <Modal
                open={open}
                onOpenChange={onOpenChange}
                title="Find OST"
                description={`Search torrent providers for the OST of "${themeDisplayName ?? themeId}".`}
                contentClass="max-w-3xl"
            >
                <div className="flex flex-col gap-4">
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
                    </form>

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

                    {hasSearched && !search.isPending && torrents.length === 0 && !search.isError && (
                        <div className="rounded-md border border-[--border] bg-[--paper] p-6 text-center text-sm text-[--muted]">
                            <LuMusic className="size-6 mx-auto mb-2 opacity-60" />
                            No results. Try a different query or provider.
                        </div>
                    )}

                    {search.isError && (
                        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                            Search failed: {(search.error as any)?.message ?? "unknown error"}
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
                                        const isDownloading = !!magnet && downloadingMagnet === magnet
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
                                                        leftIcon={isDownloading ? <LuLoader className="size-3.5 animate-spin" /> : <LuDownload className="size-3.5" />}
                                                        disabled={!magnet || isDownloading || download.isPending}
                                                        onClick={() => requestDownload(t)}
                                                    >
                                                        {isDownloading ? "Sending…" : "Download"}
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
            </Modal>

            {/* Replace-existing confirmation */}
            <Modal
                open={!!confirmTarget}
                onOpenChange={(v) => { if (!v) setConfirmTarget(null) }}
                title="Replace existing OST?"
                description={`This theme already has ${existing.data?.length ?? 0} audio file${(existing.data?.length ?? 0) > 1 ? "s" : ""}. Choose how to proceed.`}
                contentClass="max-w-md"
            >
                <p className="text-sm text-[--muted] mb-4 break-words">
                    Adding: <span className="text-[--foreground]">{confirmTarget?.name}</span>
                </p>
                <div className={cn("flex flex-col sm:flex-row gap-2 justify-end")}>
                    <Button intent="white-subtle" onClick={() => setConfirmTarget(null)}>Cancel</Button>
                    <Button
                        intent="warning-subtle"
                        onClick={() => confirmTarget && performDownload(confirmTarget, false)}
                        loading={download.isPending && !!downloadingMagnet}
                    >
                        Keep existing & add new
                    </Button>
                    <Button
                        intent="alert"
                        onClick={() => confirmTarget && performDownload(confirmTarget, true)}
                        loading={download.isPending && !!downloadingMagnet}
                    >
                        Replace all
                    </Button>
                </div>
            </Modal>
        </>
    )
}
