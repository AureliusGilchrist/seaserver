"use client"
import React from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { toast } from "sonner"
import {
    LuDownload,
    LuListMusic,
    LuLoader,
    LuMusic,
    LuPause,
    LuPlay,
    LuPlus,
    LuRepeat,
    LuRepeat1,
    LuSearch,
    LuShuffle,
    LuSkipBack,
    LuSkipForward,
    LuTrash2,
    LuVolume2,
    LuVolumeX,
    LuX,
} from "react-icons/lu"
import {
    type IAFile,
    type IASearchDoc,
    type SoundPlaylist,
    type SoundTrack,
    useCreateSoundPlaylist,
    useDeleteSoundPlaylist,
    useDeleteSoundTrack,
    useDownloadSoundTrack,
    useGetSoundFiles,
    useListSoundPlaylists,
    useListSoundTracks,
    useSearchSounds,
    useUpdateSoundPlaylist,
} from "@/api/hooks/sounds.hooks"
import {
    ambienceCommandAtom,
    ambienceCurrentTrackAtom,
    ambienceIsPlayingAtom,
    ambienceLiveDurationAtom,
    ambiencePositionAtom,
    ambienceQueueAtom,
    ambienceQueueIndexAtom,
    ambienceRepeatAtom,
    ambienceShuffleAtom,
    ambienceVolumeAtom,
    type AmbiencePlaybackTrack,
} from "@/app/(main)/ambience/_lib/ambience-atoms"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Button, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { TextInput } from "@/components/ui/text-input"

type TabKey = "browse" | "library" | "playlists"

function trackFromSoundTrack(t: SoundTrack): AmbiencePlaybackTrack {
    return {
        uuid: t.uuid,
        title: t.title || t.iaFilename,
        artist: t.artist || t.iaIdentifier,
        url: t.url || `/sounds-cache/${t.filename}`,
        durationSec: t.durationSec,
    }
}

function fmtTime(sec: number): string {
    if (!isFinite(sec) || sec < 0) sec = 0
    const s = Math.floor(sec)
    const m = Math.floor(s / 60)
    const ss = s % 60
    if (m >= 60) {
        const h = Math.floor(m / 60)
        const mm = m % 60
        return `${h}:${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
    }
    return `${m}:${ss.toString().padStart(2, "0")}`
}

function fmtCreator(c: IASearchDoc["creator"]): string {
    if (!c) return ""
    if (Array.isArray(c)) return c.join(", ")
    return c
}

export default function Page() {
    const [tab, setTab] = React.useState<TabKey>("browse")

    return (
        <PageWrapper className="p-4 sm:p-8 space-y-6 pb-32">
            <div className="flex items-center gap-4">
                <LuMusic className="size-8 text-pink-400" />
                <div>
                    <h1 className="text-2xl font-bold">Ambience</h1>
                    <p className="text-[--muted]">
                        Browse public-domain audio from the Internet Archive, build playlists, and listen as you browse.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <TabPill label="Browse" icon={<LuSearch className="size-3.5" />} active={tab === "browse"} onClick={() => setTab("browse")} />
                <TabPill label="Library" icon={<LuListMusic className="size-3.5" />} active={tab === "library"} onClick={() => setTab("library")} />
                <TabPill label="Playlists" icon={<LuMusic className="size-3.5" />} active={tab === "playlists"} onClick={() => setTab("playlists")} />
            </div>

            {tab === "browse" && <BrowseTab />}
            {tab === "library" && <LibraryTab />}
            {tab === "playlists" && <PlaylistsTab />}

            <PlayerBar />
        </PageWrapper>
    )
}

function TabPill({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
                active
                    ? "bg-pink-500/20 text-pink-300 border-pink-500/40"
                    : "bg-[--paper] text-[--muted] border-[--border] hover:bg-[--highlight]",
            )}
        >
            {icon}
            {label}
        </button>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Browse tab
// ─────────────────────────────────────────────────────────────────────────────

function BrowseTab() {
    const [query, setQuery] = React.useState("ambient music")
    const [committed, setCommitted] = React.useState("ambient music")
    const [page, setPage] = React.useState(1)
    const [docs, setDocs] = React.useState<IASearchDoc[]>([])
    const [selectedItem, setSelectedItem] = React.useState<IASearchDoc | null>(null)

    const { data, isFetching, isError } = useSearchSounds(committed, page, true)

    const prevRef = React.useRef<typeof data>(undefined)
    React.useEffect(() => {
        if (!data?.response?.docs || data === prevRef.current) return
        prevRef.current = data
        setDocs(prev => page === 1 ? data.response.docs : [...prev, ...data.response.docs])
    }, [data, page])

    const totalFound = data?.response?.numFound ?? 0
    const hasMore = docs.length < totalFound

    const handleSearch = () => {
        const trimmed = query.trim()
        if (!trimmed) return
        setPage(1)
        setDocs([])
        setCommitted(trimmed)
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <TextInput
                    value={query}
                    onValueChange={(v: string) => setQuery(v)}
                    placeholder="Search Internet Archive audio (e.g. 'rain', 'lofi', 'piano')"
                    onKeyDown={(e) => { if (e.key === "Enter") handleSearch() }}
                    leftIcon={<LuSearch className="size-4" />}
                    className="flex-1"
                />
                <Button intent="primary" onClick={handleSearch} disabled={isFetching && page === 1}>
                    Search
                </Button>
            </div>

            {isError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
                    Search failed. Try a different query.
                </div>
            )}

            {isFetching && page === 1 && docs.length === 0 ? (
                <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
            ) : (
                <>
                    <p className="text-xs text-[--muted]">
                        {totalFound > 0 ? `${docs.length.toLocaleString()} of ${totalFound.toLocaleString()} results` : "No results."}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {docs.map(d => (
                            <button
                                key={d.identifier}
                                onClick={() => setSelectedItem(d)}
                                className="group flex flex-col gap-1 p-3 rounded-lg border border-[--border] bg-[--paper] hover:bg-[--highlight] hover:border-pink-500/40 transition-colors text-left"
                            >
                                <div className="font-medium line-clamp-2 text-sm">{d.title || d.identifier}</div>
                                {fmtCreator(d.creator) && (
                                    <div className="text-xs text-[--muted] line-clamp-1">{fmtCreator(d.creator)}</div>
                                )}
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-[--muted]">
                                    {d.year && <span>{d.year}</span>}
                                    {d.downloads != null && <span>·</span>}
                                    {d.downloads != null && <span>{d.downloads.toLocaleString()} plays</span>}
                                </div>
                            </button>
                        ))}
                    </div>
                    {hasMore && (
                        <div className="flex justify-center pt-2">
                            <Button intent="white-outline" onClick={() => setPage(p => p + 1)} disabled={isFetching}>
                                {isFetching ? "Loading…" : "Load more"}
                            </Button>
                        </div>
                    )}
                </>
            )}

            {selectedItem && (
                <ItemFilesModal item={selectedItem} onClose={() => setSelectedItem(null)} />
            )}
        </div>
    )
}

function ItemFilesModal({ item, onClose }: { item: IASearchDoc; onClose: () => void }) {
    const { data, isFetching, isError } = useGetSoundFiles(item.identifier, true)
    const downloadMutation = useDownloadSoundTrack()
    const [downloadingFile, setDownloadingFile] = React.useState<string | null>(null)

    const handleDownload = async (file: IAFile) => {
        if (downloadingFile) return
        setDownloadingFile(file.name)
        try {
            const res = await downloadMutation.mutateAsync({
                identifier: item.identifier,
                filename: file.name,
                title: data?.title || item.title || file.name,
                artist: data?.creator || fmtCreator(item.creator) || "",
                format: file.format,
                durationSec: file.durationSec,
            })
            if (res) toast.success("Downloaded to Library")
        } catch (e: any) {
            toast.error("Download failed", { description: e?.message })
        } finally {
            setDownloadingFile(null)
        }
    }

    return (
        <Modal open onOpenChange={(o) => { if (!o) onClose() }} title={item.title || item.identifier}>
            {isFetching && <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>}
            {isError && <div className="text-sm text-red-300">Failed to load files for this item.</div>}
            {data && (
                <div className="space-y-3">
                    {data.creator && <p className="text-sm text-[--muted]">{data.creator}</p>}
                    {data.files.length === 0 ? (
                        <div className="text-sm text-[--muted]">No playable audio files in this item.</div>
                    ) : (
                        <div className="divide-y divide-[--border] rounded-lg border border-[--border] bg-[--paper] max-h-[60vh] overflow-y-auto">
                            {data.files.map(f => (
                                <div key={f.name} className="flex items-center gap-3 p-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{f.name}</div>
                                        <div className="text-[11px] text-[--muted] flex gap-3 mt-0.5">
                                            <span>{f.format || f.ext.toUpperCase()}</span>
                                            {f.durationSec > 0 && <span>{fmtTime(f.durationSec)}</span>}
                                            {f.sizeBytes > 0 && <span>{(f.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        intent="primary"
                                        leftIcon={downloadingFile === f.name
                                            ? <LuLoader className="size-3.5 animate-spin" />
                                            : <LuDownload className="size-3.5" />}
                                        disabled={!!downloadingFile}
                                        onClick={() => handleDownload(f)}
                                    >
                                        {downloadingFile === f.name ? "Saving…" : "Download"}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Library tab
// ─────────────────────────────────────────────────────────────────────────────

function LibraryTab() {
    const { data: tracks, isFetching } = useListSoundTracks()
    const deleteMutation = useDeleteSoundTrack()
    const setCommand = useSetAtom(ambienceCommandAtom)
    const [addToPlaylistFor, setAddToPlaylistFor] = React.useState<SoundTrack | null>(null)

    if (isFetching && !tracks) {
        return <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
    }
    if (!tracks || tracks.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-[--border] p-12 text-center text-[--muted]">
                Your Library is empty. Find tracks under <strong className="text-[--foreground]">Browse</strong>.
            </div>
        )
    }

    const playAll = (startIndex: number) => {
        const queue = tracks.map(trackFromSoundTrack)
        setCommand({ type: "play-queue", queue, startIndex })
    }

    const handleDelete = async (t: SoundTrack) => {
        if (!confirm(`Delete "${t.title || t.iaFilename}"? This will also remove it from any playlists.`)) return
        try {
            await deleteMutation.mutateAsync(t.uuid)
            toast.success("Track deleted")
        } catch (e: any) {
            toast.error("Delete failed", { description: e?.message })
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-[--muted]">{tracks.length} track{tracks.length === 1 ? "" : "s"} downloaded</p>
                <Button size="sm" intent="white-outline" leftIcon={<LuPlay className="size-3.5" />} onClick={() => playAll(0)}>
                    Play all
                </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {tracks.map((t, idx) => (
                    <div
                        key={t.uuid}
                        className="flex items-center gap-3 p-3 rounded-lg border border-[--border] bg-[--paper] hover:bg-[--highlight] transition-colors"
                    >
                        <IconButton
                            size="sm"
                            intent="primary"
                            icon={<LuPlay className="size-4" />}
                            onClick={() => playAll(idx)}
                        />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{t.title || t.iaFilename}</div>
                            <div className="text-xs text-[--muted] truncate">
                                {t.artist || t.iaIdentifier}
                                {t.durationSec > 0 && <> · {fmtTime(t.durationSec)}</>}
                                {t.format && <> · {t.format}</>}
                            </div>
                        </div>
                        <IconButton
                            size="sm"
                            intent="white-subtle"
                            icon={<LuPlus className="size-4" />}
                            onClick={() => setAddToPlaylistFor(t)}
                        />
                        <IconButton
                            size="sm"
                            intent="alert-subtle"
                            icon={<LuTrash2 className="size-4" />}
                            onClick={() => handleDelete(t)}
                        />
                    </div>
                ))}
            </div>

            {addToPlaylistFor && (
                <AddToPlaylistModal
                    track={addToPlaylistFor}
                    onClose={() => setAddToPlaylistFor(null)}
                />
            )}
        </div>
    )
}

function AddToPlaylistModal({ track, onClose }: { track: SoundTrack; onClose: () => void }) {
    const { data: playlists } = useListSoundPlaylists()
    const updateMutation = useUpdateSoundPlaylist()
    const createMutation = useCreateSoundPlaylist()
    const [newName, setNewName] = React.useState("")
    const [busyId, setBusyId] = React.useState<number | "new" | null>(null)

    const addToExisting = async (p: SoundPlaylist) => {
        if (busyId) return
        if (p.trackUuids.includes(track.uuid)) {
            toast.info("Already in playlist")
            return
        }
        setBusyId(p.id)
        try {
            await updateMutation.mutateAsync({
                id: p.id,
                name: p.name,
                trackUuids: [...p.trackUuids, track.uuid],
            })
            toast.success(`Added to "${p.name}"`)
            onClose()
        } catch (e: any) {
            toast.error("Failed to add", { description: e?.message })
        } finally {
            setBusyId(null)
        }
    }

    const createAndAdd = async () => {
        const name = newName.trim()
        if (!name) return
        if (busyId) return
        setBusyId("new")
        try {
            await createMutation.mutateAsync({ name, trackUuids: [track.uuid] })
            toast.success(`Created "${name}"`)
            onClose()
        } catch (e: any) {
            toast.error("Failed to create playlist", { description: e?.message })
        } finally {
            setBusyId(null)
        }
    }

    return (
        <Modal open onOpenChange={(o) => { if (!o) onClose() }} title="Add to playlist">
            <div className="space-y-4">
                <div className="text-sm text-[--muted] truncate">{track.title || track.iaFilename}</div>

                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {(playlists ?? []).length === 0 && (
                        <div className="text-sm text-[--muted]">No playlists yet — create one below.</div>
                    )}
                    {(playlists ?? []).map(p => (
                        <button
                            key={p.id}
                            onClick={() => addToExisting(p)}
                            disabled={busyId !== null}
                            className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-[--border] bg-[--paper] hover:bg-[--highlight] transition-colors text-left disabled:opacity-60"
                        >
                            <div>
                                <div className="text-sm font-medium">{p.name}</div>
                                <div className="text-xs text-[--muted]">{p.trackUuids.length} tracks</div>
                            </div>
                            {busyId === p.id ? <LuLoader className="size-4 animate-spin" /> : <LuPlus className="size-4" />}
                        </button>
                    ))}
                </div>

                <div className="border-t border-[--border] pt-4 space-y-2">
                    <div className="text-xs font-medium uppercase text-[--muted]">Or create new</div>
                    <div className="flex gap-2">
                        <TextInput
                            value={newName}
                            onValueChange={(v: string) => setNewName(v)}
                            placeholder="Playlist name"
                            className="flex-1"
                            onKeyDown={(e) => { if (e.key === "Enter") createAndAdd() }}
                        />
                        <Button
                            intent="primary"
                            disabled={!newName.trim() || busyId !== null}
                            onClick={createAndAdd}
                        >
                            {busyId === "new" ? "Creating…" : "Create"}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Playlists tab
// ─────────────────────────────────────────────────────────────────────────────

function PlaylistsTab() {
    const { data: playlists, isFetching } = useListSoundPlaylists()
    const { data: tracks } = useListSoundTracks()
    const createMutation = useCreateSoundPlaylist()
    const [newName, setNewName] = React.useState("")
    const [editing, setEditing] = React.useState<SoundPlaylist | null>(null)

    const trackByUuid = React.useMemo(() => {
        const m = new Map<string, SoundTrack>()
        for (const t of tracks ?? []) m.set(t.uuid, t)
        return m
    }, [tracks])

    const handleCreate = async () => {
        const name = newName.trim()
        if (!name) return
        try {
            await createMutation.mutateAsync({ name, trackUuids: [] })
            setNewName("")
            toast.success(`Created "${name}"`)
        } catch (e: any) {
            toast.error("Create failed", { description: e?.message })
        }
    }

    if (isFetching && !playlists) {
        return <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <TextInput
                    value={newName}
                    onValueChange={(v: string) => setNewName(v)}
                    placeholder="New playlist name…"
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
                />
                <Button intent="primary" leftIcon={<LuPlus className="size-4" />} onClick={handleCreate} disabled={!newName.trim()}>
                    Create
                </Button>
            </div>

            {(playlists ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-[--border] p-12 text-center text-[--muted]">
                    No playlists yet. Create one above or from the Library tab.
                </div>
            ) : (
                <div className="space-y-2">
                    {playlists!.map(p => (
                        <PlaylistRow
                            key={p.id}
                            playlist={p}
                            trackByUuid={trackByUuid}
                            onEdit={() => setEditing(p)}
                        />
                    ))}
                </div>
            )}

            {editing && (
                <PlaylistEditorModal
                    playlist={editing}
                    trackByUuid={trackByUuid}
                    allTracks={tracks ?? []}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    )
}

function PlaylistRow({
    playlist,
    trackByUuid,
    onEdit,
}: {
    playlist: SoundPlaylist
    trackByUuid: Map<string, SoundTrack>
    onEdit: () => void
}) {
    const setCommand = useSetAtom(ambienceCommandAtom)
    const deleteMutation = useDeleteSoundPlaylist()

    const validTracks = playlist.trackUuids
        .map(u => trackByUuid.get(u))
        .filter((t): t is SoundTrack => !!t)

    const playPlaylist = () => {
        if (validTracks.length === 0) {
            toast.info("Playlist is empty")
            return
        }
        setCommand({
            type: "play-queue",
            queue: validTracks.map(trackFromSoundTrack),
            startIndex: 0,
        })
    }

    const handleDelete = async () => {
        if (!confirm(`Delete playlist "${playlist.name}"? Tracks themselves are not removed.`)) return
        try {
            await deleteMutation.mutateAsync(playlist.id)
            toast.success("Playlist deleted")
        } catch (e: any) {
            toast.error("Delete failed", { description: e?.message })
        }
    }

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-[--border] bg-[--paper]">
            <IconButton size="sm" intent="primary" icon={<LuPlay className="size-4" />} onClick={playPlaylist} />
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{playlist.name}</div>
                <div className="text-xs text-[--muted]">
                    {validTracks.length} track{validTracks.length === 1 ? "" : "s"}
                    {validTracks.length !== playlist.trackUuids.length && (
                        <> ({playlist.trackUuids.length - validTracks.length} missing)</>
                    )}
                </div>
            </div>
            <Button size="sm" intent="white-outline" onClick={onEdit}>Edit</Button>
            <IconButton size="sm" intent="alert-subtle" icon={<LuTrash2 className="size-4" />} onClick={handleDelete} />
        </div>
    )
}

function PlaylistEditorModal({
    playlist,
    trackByUuid,
    allTracks,
    onClose,
}: {
    playlist: SoundPlaylist
    trackByUuid: Map<string, SoundTrack>
    allTracks: SoundTrack[]
    onClose: () => void
}) {
    const updateMutation = useUpdateSoundPlaylist()
    const [name, setName] = React.useState(playlist.name)
    const [uuids, setUuids] = React.useState<string[]>(playlist.trackUuids)
    const [saving, setSaving] = React.useState(false)

    const inPlaylist = new Set(uuids)
    const available = allTracks.filter(t => !inPlaylist.has(t.uuid))

    const moveUp = (i: number) => {
        if (i <= 0) return
        const next = [...uuids]
        ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
        setUuids(next)
    }
    const moveDown = (i: number) => {
        if (i >= uuids.length - 1) return
        const next = [...uuids]
        ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
        setUuids(next)
    }
    const remove = (i: number) => {
        setUuids(uuids.filter((_, idx) => idx !== i))
    }
    const add = (uuid: string) => {
        if (inPlaylist.has(uuid)) return
        setUuids([...uuids, uuid])
    }

    const save = async () => {
        const trimmed = name.trim()
        if (!trimmed) {
            toast.error("Name required")
            return
        }
        setSaving(true)
        try {
            await updateMutation.mutateAsync({ id: playlist.id, name: trimmed, trackUuids: uuids })
            toast.success("Playlist saved")
            onClose()
        } catch (e: any) {
            toast.error("Save failed", { description: e?.message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal open onOpenChange={(o) => { if (!o) onClose() }} title="Edit playlist">
            <div className="space-y-4">
                <TextInput
                    label="Name"
                    value={name}
                    onValueChange={(v: string) => setName(v)}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <div className="text-xs font-medium uppercase text-[--muted] mb-2">In playlist ({uuids.length})</div>
                        <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
                            {uuids.length === 0 && <div className="text-xs text-[--muted]">Empty.</div>}
                            {uuids.map((u, i) => {
                                const t = trackByUuid.get(u)
                                return (
                                    <div key={u + ":" + i} className="flex items-center gap-1 p-2 rounded border border-[--border] bg-[--paper]">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium truncate">{t?.title || u}</div>
                                            <div className="text-[10px] text-[--muted] truncate">{t?.artist || (t ? "" : "(missing track)")}</div>
                                        </div>
                                        <IconButton size="sm" intent="white-subtle" icon={<span className="text-[10px]">↑</span>} onClick={() => moveUp(i)} />
                                        <IconButton size="sm" intent="white-subtle" icon={<span className="text-[10px]">↓</span>} onClick={() => moveDown(i)} />
                                        <IconButton size="sm" intent="alert-subtle" icon={<LuX className="size-3.5" />} onClick={() => remove(i)} />
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-medium uppercase text-[--muted] mb-2">Available ({available.length})</div>
                        <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
                            {available.length === 0 && <div className="text-xs text-[--muted]">No more tracks. Download more from Browse.</div>}
                            {available.map(t => (
                                <button
                                    key={t.uuid}
                                    onClick={() => add(t.uuid)}
                                    className="w-full flex items-center gap-2 p-2 rounded border border-[--border] bg-[--paper] hover:bg-[--highlight] text-left"
                                >
                                    <LuPlus className="size-3.5 text-[--muted]" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium truncate">{t.title || t.iaFilename}</div>
                                        <div className="text-[10px] text-[--muted] truncate">{t.artist || t.iaIdentifier}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button intent="white-subtle" onClick={onClose}>Cancel</Button>
                    <Button intent="primary" onClick={save} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Player bar (visible only on /ambience — but audio element is global)
// ─────────────────────────────────────────────────────────────────────────────

function PlayerBar() {
    const currentTrack = useAtomValue(ambienceCurrentTrackAtom)
    const [isPlaying, setIsPlaying] = useAtom(ambienceIsPlayingAtom)
    const queue = useAtomValue(ambienceQueueAtom)
    const queueIndex = useAtomValue(ambienceQueueIndexAtom)
    const [volume, setVolume] = useAtom(ambienceVolumeAtom)
    const [repeat, setRepeat] = useAtom(ambienceRepeatAtom)
    const [shuffle, setShuffle] = useAtom(ambienceShuffleAtom)
    const position = useAtomValue(ambiencePositionAtom)
    const liveDuration = useAtomValue(ambienceLiveDurationAtom)
    const setCommand = useSetAtom(ambienceCommandAtom)

    const duration = liveDuration > 0 ? liveDuration : (currentTrack?.durationSec ?? 0)
    const progress = duration > 0 ? Math.min(1, position / duration) : 0

    const togglePlay = () => {
        if (!currentTrack) return
        setIsPlaying(p => !p)
    }

    const cycleRepeat = () => {
        setRepeat(r => r === "off" ? "all" : r === "all" ? "one" : "off")
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[--border] bg-[--background]/95 backdrop-blur-sm">
            <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                    {currentTrack ? (
                        <>
                            <div className="text-sm font-medium truncate">{currentTrack.title}</div>
                            <div className="text-xs text-[--muted] truncate">
                                {currentTrack.artist}
                                {queue.length > 0 && <> · {queueIndex + 1} / {queue.length}</>}
                            </div>
                        </>
                    ) : (
                        <div className="text-xs text-[--muted]">Nothing playing — pick a track from Library or Playlists.</div>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[--muted]">
                        <span className="tabular-nums">{fmtTime(position)}</span>
                        <input
                            type="range"
                            min={0}
                            max={duration > 0 ? duration : 1}
                            step={0.5}
                            value={Math.min(position, duration || position)}
                            disabled={!currentTrack || duration <= 0}
                            onChange={(e) => setCommand({ type: "seek", positionSec: parseFloat(e.target.value) })}
                            className="flex-1 accent-pink-500"
                            aria-label="Seek"
                        />
                        <span className="tabular-nums">{fmtTime(duration)}</span>
                    </div>
                    {/* Visual progress bar shown above the slider for clarity. */}
                    <div className="mt-1 h-0.5 w-full bg-[--border] rounded overflow-hidden">
                        <div className="h-full bg-pink-500 transition-[width]" style={{ width: `${progress * 100}%` }} />
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <IconButton
                        size="sm"
                        intent={shuffle ? "primary-subtle" : "white-subtle"}
                        icon={<LuShuffle className="size-4" />}
                        onClick={() => setShuffle(s => !s)}
                        aria-label="Shuffle"
                    />
                    <IconButton
                        size="sm"
                        intent="white-subtle"
                        icon={<LuSkipBack className="size-4" />}
                        onClick={() => setCommand({ type: "prev" })}
                        disabled={!currentTrack}
                        aria-label="Previous"
                    />
                    <IconButton
                        size="md"
                        intent="primary"
                        icon={isPlaying ? <LuPause className="size-5" /> : <LuPlay className="size-5" />}
                        onClick={togglePlay}
                        disabled={!currentTrack}
                        aria-label={isPlaying ? "Pause" : "Play"}
                    />
                    <IconButton
                        size="sm"
                        intent="white-subtle"
                        icon={<LuSkipForward className="size-4" />}
                        onClick={() => setCommand({ type: "next" })}
                        disabled={!currentTrack}
                        aria-label="Next"
                    />
                    <IconButton
                        size="sm"
                        intent={repeat !== "off" ? "primary-subtle" : "white-subtle"}
                        icon={repeat === "one" ? <LuRepeat1 className="size-4" /> : <LuRepeat className="size-4" />}
                        onClick={cycleRepeat}
                        aria-label="Repeat"
                    />
                </div>

                <div className="hidden sm:flex items-center gap-2 w-32">
                    <button
                        onClick={() => setVolume(volume > 0 ? 0 : 0.7)}
                        className="text-[--muted] hover:text-[--foreground]"
                        aria-label={volume > 0 ? "Mute" : "Unmute"}
                    >
                        {volume > 0 ? <LuVolume2 className="size-4" /> : <LuVolumeX className="size-4" />}
                    </button>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="flex-1 accent-pink-500"
                        aria-label="Volume"
                    />
                </div>
            </div>
        </div>
    )
}
