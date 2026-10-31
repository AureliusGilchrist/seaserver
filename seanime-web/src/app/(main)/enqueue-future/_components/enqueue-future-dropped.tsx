import { EnqueueFuture_DroppedItem } from "@/api/generated/types"
import {
    useClearEnqueueFutureDropped,
    useDeleteEnqueueFutureDropped,
    useGetEnqueueFutureDropped,
    useRestoreEnqueueFutureDropped,
} from "@/api/hooks/enqueue_future.hooks"
import { SeaLink } from "@/components/shared/sea-link"
import { Button, IconButton } from "@/components/ui/button"
import React from "react"
import { LuChevronDown, LuUndo2, LuX } from "react-icons/lu"

/** How many rows are rendered at a time; a long walk can leave thousands. */
const DROPPED_PAGE = 50

/**
 * What runs took off the queue for having nothing downloadable.
 *
 * The queue stays a list of things you can act on, so these are folded away beneath it rather than
 * mixed in, but the search behind each one is kept: a show with three seeders is still a show you
 * might want, and putting it back costs one press.
 */
export function EnqueueFutureDropped({ isRunning }: { isRunning: boolean }) {
    const { data: dropped } = useGetEnqueueFutureDropped({ isRunning })
    const { mutate: clearDropped, isPending: isClearing } = useClearEnqueueFutureDropped()
    const [visible, setVisible] = React.useState(DROPPED_PAGE)

    if (!dropped?.length) return null

    return (
        <details className="group/dropped rounded-[--radius-md] border bg-gray-950 p-4" data-enqueue-future-dropped>
            <summary className="cursor-pointer select-none list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                <LuChevronDown className="transition-transform group-open/dropped:rotate-180 flex-none text-[--muted]" />
                <span className="font-semibold">Nothing downloadable</span>
                <span className="text-sm text-[--muted]">{dropped.length}</span>
            </summary>

            <div className="pt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-[--muted]">Taken off the queue when the search came back with too little to download.</p>
                    <Button
                        size="xs"
                        intent="alert-subtle"
                        onClick={() => clearDropped()}
                        loading={isClearing}
                        data-enqueue-future-clear-dropped
                    >
                        Clear
                    </Button>
                </div>

                <ul className="space-y-1">
                    {dropped.slice(0, visible).map(item => <DroppedRow key={item.mediaId} item={item} />)}
                </ul>

                {visible < dropped.length && (
                    <button
                        onClick={() => setVisible(n => n + DROPPED_PAGE)}
                        className="text-xs font-semibold text-[--muted] hover:text-white transition"
                        data-enqueue-future-show-more-dropped
                    >
                        Show {Math.min(DROPPED_PAGE, dropped.length - visible)} more
                    </button>
                )}
            </div>
        </details>
    )
}

function DroppedRow({ item }: { item: EnqueueFuture_DroppedItem }) {
    const { mutate: restore, isPending: isRestoring } = useRestoreEnqueueFutureDropped(item.mediaId)
    const { mutate: forget, isPending: isForgetting } = useDeleteEnqueueFutureDropped(item.mediaId)

    return (
        <li className="flex items-center gap-3 rounded-[--radius] border border-gray-800/80 bg-gray-950/40 px-2.5 py-1.5">
            {item.coverImage && <img src={item.coverImage} alt="" className="w-7 h-10 object-cover rounded-sm flex-none" />}
            <div className="min-w-0 flex-1">
                <SeaLink href={`/entry?id=${item.mediaId}`} className="block text-sm truncate hover:underline">
                    {item.title || `#${item.mediaId}`}
                </SeaLink>
                <p className="text-xs text-[--muted] truncate">
                    {item.reason}
                    {item.torrents > 0 ? ` · ${item.torrents} torrent${item.torrents === 1 ? "" : "s"}` : ""}
                    {item.providerId ? ` · ${item.providerId}` : ""}
                    {item.droppedAt ? ` · ${new Date(item.droppedAt).toLocaleDateString()}` : ""}
                </p>
            </div>
            <Button
                size="xs"
                intent="gray-subtle"
                leftIcon={<LuUndo2 />}
                onClick={() => restore()}
                loading={isRestoring}
                data-enqueue-future-restore-dropped
            >
                Back to queue
            </Button>
            <IconButton
                size="xs"
                intent="gray-basic"
                icon={<LuX />}
                onClick={() => forget()}
                loading={isForgetting}
                aria-label={`Forget ${item.title || item.mediaId}`}
                data-enqueue-future-forget-dropped
            />
        </li>
    )
}
