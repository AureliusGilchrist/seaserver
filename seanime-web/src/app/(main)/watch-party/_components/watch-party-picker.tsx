import { Anime_LibraryCollectionEntry } from "@/api/generated/types"
import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetAnimeEntry } from "@/api/hooks/anime_entries.hooks"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { TextInput } from "@/components/ui/text-input"
import React from "react"
import { LuArrowLeft, LuPlay, LuSearch } from "react-icons/lu"

/**
 * The remote holder's "what do we watch" picker: a show from the local library, then one
 * of its episodes.
 */
export function WatchPartyPicker(props: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onPick: (mediaId: number, path: string) => void
}) {
    const { open, onOpenChange, onPick } = props
    const [query, setQuery] = React.useState("")
    const [selected, setSelected] = React.useState<number | null>(null)

    React.useEffect(() => {
        if (!open) {
            setSelected(null)
        }
    }, [open])

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title={selected ? undefined : "What are we watching?"}
            contentClass="max-w-3xl bg-gray-950 sm:rounded-2xl"
            overlayClass="bg-black/80"
        >
            {selected
                ? <EpisodeList mediaId={selected} onBack={() => setSelected(null)} onPick={onPick} />
                : <ShowList query={query} setQuery={setQuery} onSelect={setSelected} enabled={open} />}
        </Modal>
    )
}

function ShowList(props: { query: string, setQuery: (q: string) => void, onSelect: (id: number) => void, enabled: boolean }) {
    const { query, setQuery, onSelect, enabled } = props
    const { data, isLoading } = useGetLibraryCollection({ enabled })

    const entries = React.useMemo(() => {
        const seen = new Set<number>()
        const out: Anime_LibraryCollectionEntry[] = []
        for (const list of data?.lists ?? []) {
            for (const e of list.entries ?? []) {
                if (!e.media || !e.libraryData || seen.has(e.mediaId)) continue
                seen.add(e.mediaId)
                out.push(e)
            }
        }
        const q = query.trim().toLowerCase()
        const filtered = !q ? out : out.filter(e => {
            const t = e.media?.title
            return [t?.userPreferred, t?.english, t?.romaji, t?.native, ...(e.media?.synonyms ?? [])]
                .some(s => s?.toLowerCase().includes(q))
        })
        return filtered.sort((a, b) => (a.media?.title?.userPreferred ?? "").localeCompare(b.media?.title?.userPreferred ?? ""))
    }, [data, query])

    return (
        <div className="flex flex-col gap-3">
            <TextInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search your library"
                leftIcon={<LuSearch />}
                autoFocus
            />
            {isLoading && <LoadingSpinner />}
            {!isLoading && entries.length === 0 && (
                <p className="text-sm text-[--muted] text-center py-8">No downloaded shows match.</p>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[60dvh] overflow-y-auto pr-1">
                {entries.map(e => (
                    <button
                        key={e.mediaId}
                        className="group flex flex-col gap-1 text-left"
                        onClick={() => onSelect(e.mediaId)}
                    >
                        <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-900">
                            {e.media?.coverImage?.large && (
                                <img
                                    src={e.media.coverImage.large}
                                    alt=""
                                    loading="lazy"
                                    className="size-full object-cover transition group-hover:scale-105"
                                />
                            )}
                        </div>
                        <span className="text-xs line-clamp-2">{e.media?.title?.userPreferred}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

function EpisodeList(props: { mediaId: number, onBack: () => void, onPick: (mediaId: number, path: string) => void }) {
    const { mediaId, onBack, onPick } = props
    const { data: entry, isLoading } = useGetAnimeEntry(mediaId)

    const episodes = React.useMemo(() => {
        return (entry?.episodes ?? []).filter(ep => !!ep.localFile?.path)
    }, [entry?.episodes])

    const progress = entry?.listData?.progress ?? 0

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <Button size="sm" intent="gray-basic" leftIcon={<LuArrowLeft />} onClick={onBack}>Back</Button>
                <p className="font-semibold truncate">{entry?.media?.title?.userPreferred}</p>
            </div>
            {isLoading && <LoadingSpinner />}
            {!isLoading && episodes.length === 0 && (
                <p className="text-sm text-[--muted] text-center py-8">No downloaded episodes.</p>
            )}
            <div className="flex flex-col gap-1 max-h-[60dvh] overflow-y-auto pr-1">
                {episodes.map(ep => (
                    <button
                        key={ep.localFile!.path}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-left group"
                        onClick={() => onPick(mediaId, ep.localFile!.path)}
                    >
                        <div className="relative w-28 aspect-video shrink-0 overflow-hidden rounded-md bg-gray-900">
                            {(ep.episodeMetadata?.image || entry?.media?.coverImage?.large) && (
                                <img
                                    src={ep.episodeMetadata?.image || entry?.media?.coverImage?.large}
                                    alt=""
                                    loading="lazy"
                                    className="size-full object-cover"
                                />
                            )}
                            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50">
                                <LuPlay className="size-6" />
                            </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium">
                                {ep.displayTitle}
                                {progress >= ep.progressNumber && ep.progressNumber > 0 && <span className="text-xs text-[--muted] font-normal"> · watched</span>}
                            </span>
                            {ep.episodeTitle && <span className="text-xs text-[--muted] truncate">{ep.episodeTitle}</span>}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}
