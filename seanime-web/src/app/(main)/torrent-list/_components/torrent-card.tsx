import { TorrentClientAction_Variables } from "@/api/generated/endpoint.types"
import { TorrentClient_Torrent } from "@/api/generated/types"
import { useGetTorrentClientFiles } from "@/api/hooks/torrent_client.hooks"
import { countFilesAndFolders } from "@/app/(main)/entry/_containers/torrent-search/torrent-download-file-selection"
import { TorrentFileTree } from "@/app/(main)/torrent-list/_components/torrent-file-tree"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Tooltip } from "@/components/ui/tooltip"
import { upath } from "@/lib/helpers/upath"
import capitalize from "lodash/capitalize"
import React from "react"
import { BiPause, BiPlay, BiStop, BiTrash } from "react-icons/bi"
import {
    LuArrowDown,
    LuArrowUp,
    LuChevronDown,
    LuCircleCheck,
    LuClock,
    LuHardDrive,
    LuHourglass,
    LuLoaderCircle,
    LuPause,
    LuRefreshCw,
    LuScale,
    LuSearch,
    LuSquare,
    LuTriangleAlert,
    LuUsers,
} from "react-icons/lu"

const STATE_PILL: Record<string, { label: string, className: string, icon: React.ReactNode }> = {
    downloading: { label: "Downloading", className: "bg-brand-500/15 text-brand-200 ring-brand-400/30", icon: <LuLoaderCircle className="size-3 animate-spin" /> },
    stalled: { label: "Stalled", className: "bg-amber-400/15 text-amber-200 ring-amber-300/30", icon: <LuTriangleAlert className="size-3" /> },
    metadata: { label: "Getting metadata", className: "bg-sky-500/15 text-sky-200 ring-sky-400/30", icon: <LuSearch className="size-3" /> },
    checking: { label: "Checking", className: "bg-sky-500/15 text-sky-200 ring-sky-400/30", icon: <LuRefreshCw className="size-3 animate-spin" /> },
    queued: { label: "Queued", className: "bg-white/10 text-white/80 ring-white/15", icon: <LuHourglass className="size-3" /> },
    seeding: { label: "Seeding", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30", icon: <LuCircleCheck className="size-3" /> },
    paused: { label: "Paused", className: "bg-white/10 text-white/60 ring-white/10", icon: <LuPause className="size-3" /> },
    stopped: { label: "Stopped", className: "bg-white/10 text-white/60 ring-white/10", icon: <LuSquare className="size-3" /> },
}

function Stat({ icon, children, title }: { icon: React.ReactNode, children: React.ReactNode, title?: string }) {
    return <span className="inline-flex items-center gap-1.5 tabular-nums [&>svg]:size-3.5 [&>svg]:text-white/40" title={title}>{icon}{children}</span>
}

type TorrentCardProps = {
    torrent: TorrentClient_Torrent
    onTorrentAction: (props: TorrentClientAction_Variables) => void
    isPending?: boolean
}

export const TorrentCard = React.memo(function TorrentCard({ torrent, onTorrentAction, isPending }: TorrentCardProps) {
    const [expanded, setExpanded] = React.useState(false)

    // A server older than this frontend sends no state, and answers no file list.
    const state = torrent.state || torrent.status
    const pill = STATE_PILL[state] ?? { label: capitalize(state), className: "bg-white/10 text-white/60 ring-white/10", icon: null }
    const isMoving = state === "downloading" || state === "stalled" || state === "metadata" || state === "checking"
    const isComplete = torrent.progress >= 1

    const { data: files, isLoading: filesLoading, isError: filesFailed } = useGetTorrentClientFiles(torrent.hash, expanded, isMoving)
    const counts = React.useMemo(() => countFilesAndFolders(files?.map(f => f.path)), [files])

    const action = (name: TorrentClientAction_Variables["action"]) => onTorrentAction({ hash: torrent.hash, action: name, dir: torrent.contentPath })

    const confirmDeleteTorrentProps = useConfirmationDialog({
        title: "Remove torrent",
        description: `"${torrent.name}" and its downloaded files will be deleted from disk. This action cannot be undone.`,
        onConfirm: () => action("remove"),
    })

    const contentsLabel = !counts.files
        ? "Show folders"
        : `${counts.files} file${counts.files === 1 ? "" : "s"}${counts.folders ? ` in ${counts.folders} folder${counts.folders === 1 ? "" : "s"}` : ""}`

    return (
        <article
            data-torrent-item-container
            className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 p-4 shadow-lg shadow-black/10 backdrop-blur-md transition-colors hover:border-white/[0.14]"
        >
            <div className="flex items-start gap-3">
                <div data-torrent-item-title-container className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", pill.className)}>
                            {pill.icon}{pill.label}
                        </span>
                    </div>
                    <button
                        type="button"
                        title={torrent.name}
                        className={cn(
                            "mt-1.5 block max-w-full truncate text-left text-sm font-semibold tracking-wide underline-offset-2 hover:underline",
                            state === "paused" && "opacity-60",
                        )}
                        onClick={() => onTorrentAction({
                            hash: torrent.hash,
                            action: "open",
                            dir: !upath.extname(torrent.contentPath) ? torrent.contentPath : upath.dirname(torrent.contentPath),
                        })}
                    >{torrent.name}</button>
                </div>

                <div data-torrent-item-actions className="flex flex-none items-center gap-2">
                    {torrent.status === "seeding"
                        ? <Tooltip trigger={<IconButton icon={<BiStop />} size="sm" intent="gray-subtle" onClick={() => action("pause")} disabled={isPending} />}>End</Tooltip>
                        : torrent.status === "paused"
                            ? <Tooltip trigger={<IconButton icon={<BiPlay />} size="sm" intent="white" onClick={() => action("resume")} disabled={isPending} />}>Resume</Tooltip>
                            : <Tooltip trigger={<IconButton icon={<BiPause />} size="sm" intent="gray-subtle" onClick={() => action("pause")} disabled={isPending} />}>Pause</Tooltip>}
                    <Tooltip
                        trigger={<IconButton icon={<BiTrash />} size="sm" intent="alert-subtle" onClick={() => confirmDeleteTorrentProps.open()} disabled={isPending} />}
                    >Remove</Tooltip>
                </div>
            </div>

            {!isComplete && (
                <div data-torrent-item-progress-bar className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                            className={cn(
                                "h-full rounded-full transition-[width] duration-1000",
                                state === "paused" ? "bg-white/30" : "bg-gradient-to-r from-brand-400 to-cyan-300",
                            )}
                            style={{ width: `${Math.floor(torrent.progress * 100)}%` }}
                        />
                    </div>
                    <span className="font-mono text-xs font-semibold tabular-nums text-white/80">{(torrent.progress * 100).toFixed(1)}%</span>
                </div>
            )}

            <div data-torrent-item-info className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[--muted]">
                <Stat icon={<LuHardDrive />} title="Size">{torrent.size}</Stat>
                <Stat icon={<LuArrowDown />} title="Download speed">{torrent.downSpeed}</Stat>
                <Stat icon={<LuArrowUp />} title="Upload speed">{torrent.upSpeed}</Stat>
                {torrent.status !== "seeding" && <Stat icon={<LuClock />} title="Time left">{torrent.eta}</Stat>}
                <Stat icon={<LuUsers />} title="Seeds and peers">{torrent.seeds} seed{torrent.seeds === 1 ? "" : "s"}{torrent.peers ? ` · ${torrent.peers} peer${torrent.peers === 1 ? "" : "s"}` : ""}</Stat>
                {torrent.ratio > 0 && <Stat icon={<LuScale />} title="Share ratio">{torrent.ratio.toFixed(2)}</Stat>}
                {torrent.addedOn > 0 && <span title="Added">{new Date(torrent.addedOn * 1000).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}

                <button
                    type="button"
                    aria-expanded={expanded}
                    className="ml-auto inline-flex items-center gap-1 font-medium text-[--muted] transition-colors hover:text-white"
                    onClick={() => setExpanded(e => !e)}
                >
                    {contentsLabel}
                    <LuChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
                </button>
            </div>

            {expanded && (
                <div className="mt-3">
                    {filesLoading && <LoadingSpinner className="h-5 w-5" />}
                    {filesFailed && <p className="text-xs text-[--muted]">Couldn't list this torrent's files. If the server hasn't been updated yet, this appears once it has.</p>}
                    {!filesLoading && !filesFailed && !files?.length && <p className="text-xs text-[--muted]">
                        {state === "metadata" ? "The file list arrives with the torrent's metadata." : "No file list is available for this torrent right now."}
                    </p>}
                    {!!files?.length && <TorrentFileTree files={files} />}
                </div>
            )}

            <ConfirmationDialog {...confirmDeleteTorrentProps} />
        </article>
    )
})
