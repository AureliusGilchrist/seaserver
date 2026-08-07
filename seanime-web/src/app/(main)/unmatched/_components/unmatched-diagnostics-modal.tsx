"use client"

import {
    DiagnosticsStagingDir,
    DiagnosticsTorrent,
    UnmatchedDiagnostics,
    useGetUnmatchedDiagnostics,
} from "@/api/hooks/unmatched.hooks"
import { Alert } from "@/components/ui/alert/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import React, { useMemo } from "react"

/**
 * Answers "where did my download go".
 *
 * A download reaches the Unmatched screen only once its files are on disk inside the folder the
 * server watches, and there are several ways for that not to happen that look identical from the
 * screen: the torrent client saving somewhere else, the sidecar naming the anime never being
 * written, the download still being in progress, or the scanner having already matched and moved
 * it. This shows each link in that chain and calls out the ones that are broken.
 */
export function UnmatchedDiagnosticsModal({ open, onClose }: { open: boolean, onClose: () => void }) {
    const { data, isLoading, isFetching, refetch } = useGetUnmatchedDiagnostics({ enabled: open })

    const problems = useMemo(() => (data ? findProblems(data) : []), [data])

    return (
        <Modal
            open={open}
            onOpenChange={(o) => !o && onClose()}
            contentClass="max-w-4xl"
            title="Download diagnostics"
        >
            <div className="space-y-4">
                <p className="text-sm text-[--muted]">
                    A download shows up here once its files are inside the folder below and the download has finished.
                    This is every link in that chain, as the server sees it right now.
                </p>

                {isLoading ? (
                    <div className="flex justify-center py-10"><LoadingSpinner /></div>
                ) : !data ? (
                    <Alert intent="alert" title="Couldn't read diagnostics" description="The server didn't return a report." />
                ) : (
                    <>
                        {problems.length > 0 && (
                            <div className="space-y-2">
                                {problems.map((p, i) => (
                                    <Alert
                                        key={i}
                                        intent="warning"
                                        title={p.title}
                                        description={p.description}
                                        className="border border-amber-500/30 bg-amber-900/10 text-xs"
                                    />
                                ))}
                            </div>
                        )}

                        <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            <Fact label="Unmatched folder" value={data.unmatchedBasePath} tone={data.basePathExists ? "ok" : "bad"} />
                            <Fact
                                label="Folder access"
                                value={!data.basePathExists ? "Does not exist" : data.basePathWritable ? "Readable and writable" : "Read-only — matching will fail"}
                                tone={data.basePathExists && data.basePathWritable ? "ok" : "bad"}
                            />
                            <Fact label="Library folder" value={data.libraryPath || "Not set"} tone={data.libraryPath ? "ok" : "bad"} />
                            <Fact
                                label="Torrent client"
                                value={`${data.torrentClient || "none"}${data.torrentClientOk ? " — reachable" : ` — unreachable${data.torrentClientError ? `: ${data.torrentClientError}` : ""}`}`}
                                tone={data.torrentClientOk ? "ok" : "bad"}
                            />
                        </div>

                        <Section title={`Torrents in the client (${data.torrents.length})`}>
                            {data.torrents.length === 0 ? (
                                <Empty>
                                    {data.torrentClientOk
                                        ? "The torrent client has no torrents. A download that was queued but isn't here never reached the client."
                                        : "Couldn't reach the torrent client, so there is nothing to report."}
                                </Empty>
                            ) : data.torrents.map(t => <TorrentRow key={t.name + t.savePath} torrent={t} />)}
                        </Section>

                        <Section title={`Folders in the Unmatched directory (${data.stagingDirs.length})`}>
                            {data.stagingDirs.length === 0 ? (
                                <Empty>Nothing is in the Unmatched folder at all.</Empty>
                            ) : data.stagingDirs.map(d => <StagingRow key={d.name} dir={d} />)}
                        </Section>

                        <div className="flex justify-end">
                            <Button intent="gray-outline" size="sm" onClick={() => refetch()} loading={isFetching}>
                                Re-check
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    )
}

/** Reads the report and states, in plain terms, what is wrong. */
function findProblems(d: UnmatchedDiagnostics): { title: string, description: string }[] {
    const problems: { title: string, description: string }[] = []

    if (!d.basePathExists) {
        problems.push({
            title: "The Unmatched folder doesn't exist",
            description: `The server is looking in ${d.unmatchedBasePath}. Nothing can show up here until that folder exists and the server can write to it.`,
        })
    } else if (!d.basePathWritable) {
        problems.push({
            title: "The Unmatched folder is read-only for the server",
            description: `The server can see ${d.unmatchedBasePath} but can't write to it, so matching (which moves files out of it) will fail.`,
        })
    }

    const outside = d.torrents.filter(t => !t.insideUnmatched && t.savePath)
    if (outside.length > 0) {
        problems.push({
            title: `${outside.length} torrent${outside.length === 1 ? " is" : "s are"} being saved outside the Unmatched folder`,
            description: `The client is writing to ${outside[0].savePath}, which isn't under ${d.unmatchedBasePath}. The server never sees those files, so they can't appear here or be matched. This is what a path that means something different inside a container — or a client on another machine — looks like.`,
        })
    }

    const noSidecar = d.torrents.filter(t => t.insideUnmatched && !t.sidecarFound)
    if (noSidecar.length > 0) {
        problems.push({
            title: `${noSidecar.length} download${noSidecar.length === 1 ? " has" : "s have"} no anime attached`,
            description: "The file recording which anime the download is for is missing, so it can't be auto-matched and the Downloading badge won't show. It'll still appear here for matching by hand.",
        })
    }

    const unlisted = d.stagingDirs.filter(s => !s.listed && s.videoCount === 0 && s.fileCount > 0)
    if (unlisted.length > 0) {
        problems.push({
            title: `${unlisted.length} folder${unlisted.length === 1 ? " holds" : "s hold"} files but no video`,
            description: "Folders with no video file are hidden from the list. This is normal for a download that hasn't written any video data yet.",
        })
    }

    return problems
}

function TorrentRow({ torrent }: { torrent: DiagnosticsTorrent }) {
    const pct = Math.round((torrent.progress || 0) * 100)
    return (
        <div className="px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate text-gray-200" title={torrent.name}>{torrent.name}</span>
                <span className="flex-shrink-0 text-[--muted]">{torrent.status} · {pct}%</span>
            </div>
            <p className="text-[11px] text-[--muted] truncate" title={torrent.savePath}>{torrent.savePath || "no save path reported"}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
                <Chip tone={torrent.insideUnmatched ? "ok" : "bad"}>
                    {torrent.insideUnmatched ? "inside Unmatched folder" : "saving OUTSIDE the Unmatched folder"}
                </Chip>
                <Chip tone={torrent.sidecarFound ? "ok" : "warn"}>
                    {torrent.sidecarFound ? `anime #${torrent.animeId}` : "no anime attached"}
                </Chip>
                {torrent.autoMatch && <Chip tone="ok">auto-match on</Chip>}
            </div>
        </div>
    )
}

function StagingRow({ dir }: { dir: DiagnosticsStagingDir }) {
    return (
        <div className="px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate text-gray-200" title={dir.name}>{dir.name}</span>
                <span className="flex-shrink-0 text-[--muted]">{dir.videoCount} video / {dir.fileCount} files</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
                <Chip tone={dir.listed ? "ok" : "warn"}>{dir.listed ? "shown in the list" : "not shown in the list"}</Chip>
                <Chip tone={dir.completion === "finished" ? "ok" : dir.completion === "downloading" ? "warn" : "muted"}>
                    {dir.completion === "finished"
                        ? "client says finished"
                        : dir.completion === "downloading"
                            ? "client says still downloading"
                            : "client has no record of it"}
                </Chip>
                {dir.hasTempFile && <Chip tone="warn">partial files present</Chip>}
                <Chip tone={dir.sidecarFound ? "ok" : "warn"}>{dir.sidecarFound ? `anime #${dir.animeId}` : "no anime attached"}</Chip>
                {dir.autoMatch && <Chip tone="ok">auto-match on</Chip>}
                {dir.markedCompleted && <Chip tone="muted">marked complete</Chip>}
            </div>
        </div>
    )
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div className="border rounded-md overflow-hidden">
            <div className="px-3 py-2 border-b bg-gray-950/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-[--muted]">{title}</p>
            </div>
            <div className="max-h-[240px] overflow-y-auto divide-y divide-gray-800/60" style={{ scrollbarWidth: "thin" }}>
                {children}
            </div>
        </div>
    )
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="px-3 py-3 text-xs text-[--muted]">{children}</p>
}

function Fact({ label, value, tone }: { label: string, value: string, tone: "ok" | "bad" }) {
    return (
        <div className="p-2 border rounded-md bg-gray-950/30">
            <p className="text-[10px] uppercase tracking-wider text-[--muted]">{label}</p>
            <p className={cn("truncate", tone === "ok" ? "text-gray-200" : "text-amber-300")} title={value}>{value}</p>
        </div>
    )
}

function Chip({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted", children: React.ReactNode }) {
    return (
        <span className={cn(
            "px-1.5 py-0.5 rounded border text-[10px]",
            tone === "ok" && "border-brand-600/40 bg-brand-900/20 text-brand-200",
            tone === "warn" && "border-amber-600/40 bg-amber-900/20 text-amber-200",
            tone === "bad" && "border-red-600/40 bg-red-900/20 text-red-200",
            tone === "muted" && "border-gray-700 bg-gray-900/40 text-[--muted]",
        )}>
            {children}
        </span>
    )
}
