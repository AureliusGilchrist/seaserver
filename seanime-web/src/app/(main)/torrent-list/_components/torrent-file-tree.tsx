import { TorrentClient_TorrentFile } from "@/api/generated/types"
import { formatSize } from "@/app/(main)/torrent-list/_lib/torrent-format"
import { buildFileTree, FileTreeNode } from "@/components/shared/file-tree-selector"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuChevronRight, LuFile, LuFolder, LuFolderOpen } from "react-icons/lu"

/** Above this many files only the top folders start open, so a huge batch doesn't draw every row at once. */
const OPEN_ALL_FOLDERS_LIMIT = 200

type Totals = { size: number, done: number }

/** Adds each folder up from its files, weighting progress by size so one big file counts for what it is. */
function addUpFolders(node: FileTreeNode, totals: Map<string, Totals>): Totals {
    if (node.type === "file") {
        const file = node.filePreview as unknown as TorrentClient_TorrentFile
        const own = { size: file.size, done: file.size * file.progress }
        totals.set(node.path, own)
        return own
    }
    const sum = { size: 0, done: 0 }
    for (const child of node.children ?? []) {
        const childTotals = addUpFolders(child, totals)
        sum.size += childTotals.size
        sum.done += childTotals.done
    }
    totals.set(node.path, sum)
    return sum
}

function collectFolders(node: FileTreeNode, depth: number, closed: Set<string>, closeFrom: number) {
    for (const child of node.children ?? []) {
        if (child.type !== "directory") continue
        if (depth >= closeFrom) closed.add(child.path)
        collectFolders(child, depth + 1, closed, closeFrom)
    }
}

/** Every folder and file in a torrent, each with its size and how much of it has arrived. */
export function TorrentFileTree({ files }: { files: TorrentClient_TorrentFile[] }) {
    const paths = files.length ? files.map(f => f.path).join("\n") : ""

    const { root, totals, initiallyClosed } = React.useMemo(() => {
        const root = buildFileTree(files)
        const totals = new Map<string, Totals>()
        addUpFolders(root, totals)
        const initiallyClosed = new Set<string>()
        if (files.length > OPEN_ALL_FOLDERS_LIMIT) collectFolders(root, 0, initiallyClosed, 1)
        return { root, totals, initiallyClosed }
    }, [files])

    // Kept by path, so the refresh while the tree is open leaves folders the way they were put.
    const [closed, setClosed] = React.useState(initiallyClosed)
    const seenPaths = React.useRef(paths)
    React.useEffect(() => {
        if (seenPaths.current === paths) return
        seenPaths.current = paths
        setClosed(initiallyClosed)
    }, [paths, initiallyClosed])

    const toggle = React.useCallback((path: string) => {
        setClosed(prev => {
            const next = new Set(prev)
            if (!next.delete(path)) next.add(path)
            return next
        })
    }, [])

    return (
        <div data-torrent-file-tree className="max-h-[28rem] overflow-y-auto rounded-2xl bg-black/25 p-1.5 ring-1 ring-white/[0.06]">
            {root.children?.map(node => <TreeRow key={node.path} node={node} level={0} totals={totals} closed={closed} onToggle={toggle} />)}
        </div>
    )
}

function TreeRow({ node, level, totals, closed, onToggle }: {
    node: FileTreeNode
    level: number
    totals: Map<string, Totals>
    closed: Set<string>
    onToggle: (path: string) => void
}) {
    const isFolder = node.type === "directory"
    const isOpen = isFolder && !closed.has(node.path)
    const { size, done } = totals.get(node.path) ?? { size: 0, done: 0 }
    const percent = size > 0 ? Math.min(100, (done / size) * 100) : 0
    const skipped = !isFolder && !(node.filePreview as unknown as TorrentClient_TorrentFile).wanted
    const Icon = isFolder ? (isOpen ? LuFolderOpen : LuFolder) : LuFile

    const row = (
        <>
            <LuChevronRight className={cn("size-3.5 shrink-0 text-white/40 transition-transform", !isFolder && "invisible", isOpen && "rotate-90")} />
            <Icon className={cn("size-4 shrink-0", isFolder ? "text-brand-200" : "text-white/40")} />
            <span className={cn("min-w-0 flex-1 truncate text-left", isFolder ? "font-medium text-white/90" : "text-white/70")} title={node.name}>{node.name}</span>
            {skipped
                ? <span className="shrink-0 text-[11px] text-white/40">Skipped</span>
                : <span className="hidden h-1 w-20 shrink-0 overflow-hidden rounded-full bg-white/10 sm:block">
                    <span
                        className={cn("block h-full rounded-full", percent >= 100 ? "bg-emerald-400/80" : "sea-progress-fill bg-gradient-to-r from-brand-400 to-cyan-300")}
                        style={{ width: `${percent}%` }}
                    />
                </span>}
            {!skipped && <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/50">{Math.floor(percent)}%</span>}
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-[--muted]">{formatSize(size)}</span>
        </>
    )

    const style = { paddingLeft: `${level * 1.1 + 0.4}rem` }
    return (
        <>
            {isFolder
                ? <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => onToggle(node.path)}
                    className="flex w-full items-center gap-2 rounded-lg py-1 pr-2 text-sm transition-colors hover:bg-white/[0.05]"
                    style={style}
                >{row}</button>
                : <div className={cn("flex items-center gap-2 rounded-lg py-1 pr-2 text-sm", skipped && "opacity-50")} style={style}>{row}</div>}
            {isOpen && node.children?.map(child => (
                <TreeRow key={child.path} node={child} level={level + 1} totals={totals} closed={closed} onToggle={onToggle} />
            ))}
        </>
    )
}
