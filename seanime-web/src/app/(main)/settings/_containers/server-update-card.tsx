"use client"

import { BACKEND_UPDATE_STATUS_KEY, BackendUpdateStatus, useBackendUpdateStatus } from "@/api/hooks/update-notice.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"
import { LuCircleArrowUp, LuCheck, LuChevronDown, LuCircleAlert, LuGitCommitHorizontal, LuLoaderCircle, LuRefreshCw, LuServer } from "react-icons/lu"

// The Server card on Settings → Updates: what the server runs, whether an update is waiting and
// what it brings, read from the status the server refreshes every 5 minutes.

export type ServerUpdateProgress = { percent: number, step: string, failed: boolean } | null

export function timeAgo(unixSeconds?: number): string {
    if (!unixSeconds) return "never"
    const diff = Math.round(Date.now() / 1000 - unixSeconds)
    if (diff < 45) return "just now"
    if (diff < 3600) return `${Math.round(diff / 60)} min ago`
    if (diff < 86400) return `${Math.round(diff / 3600)} h ago`
    return `${Math.round(diff / 86400)} d ago`
}

export function timeUntil(unixSeconds?: number): string {
    if (!unixSeconds) return "—"
    const diff = Math.round(unixSeconds - Date.now() / 1000)
    if (diff <= 30) return "any moment"
    if (diff < 3600) return `in ${Math.max(1, Math.round(diff / 60))} min`
    return `in ${Math.round(diff / 3600)} h`
}

export type UpdateState = "updating" | "failed" | "available" | "checking" | "uptodate" | "unknown"

function stateOf(s: BackendUpdateStatus | undefined, running: boolean, progress: ServerUpdateProgress): UpdateState {
    // The server's own status decides whether an update is running. The progress read back from
    // the saved update log is only a fallback while the status hasn't loaded: its last line is often
    // the restart step (96%), and the page only marks an update done if it saw the server come back
    // — so it used to keep the card "updating", and the button disabled, for good.
    if (running || s?.updating) return "updating"
    if (!s && progress && !progress.failed && progress.percent < 100) return "updating"
    if (progress?.failed && (running || !s)) return "failed"
    if (!s) return "unknown"
    if (s.lastError) return "failed"
    if (s.behind) return "available"
    if (s.checking) return "checking"
    return "uptodate"
}

export const PILL: Record<UpdateState, { label: string, className: string, icon: React.ReactNode }> = {
    updating: { label: "Updating", className: "bg-brand-500/15 text-brand-200 ring-brand-400/30", icon: <LuLoaderCircle className="size-3 animate-spin" /> },
    failed: { label: "Failed", className: "bg-red-500/15 text-red-300 ring-red-400/30", icon: <LuCircleAlert className="size-3" /> },
    available: { label: "Update available", className: "bg-amber-400/15 text-amber-200 ring-amber-300/30", icon: <LuCircleArrowUp className="size-3" /> },
    checking: { label: "Checking", className: "bg-white/10 text-white/80 ring-white/15", icon: <LuLoaderCircle className="size-3 animate-spin" /> },
    uptodate: { label: "Up to date", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30", icon: <LuCheck className="size-3" /> },
    unknown: { label: "Unknown", className: "bg-white/10 text-white/60 ring-white/10", icon: null },
}

export function ServerUpdateCard({ remote, running, checking, progress, errorText, onUpdate, onCheck }: {
    remote: boolean
    running: boolean
    checking: boolean
    progress: ServerUpdateProgress
    /** The last failure from Update now / Check now, in the server's words. */
    errorText: string | null
    onUpdate: () => void
    onCheck: () => void
}) {
    const qc = useQueryClient()
    const { data: status, isError, isLoading } = useBackendUpdateStatus()
    useWebsocketMessageListener({
        type: WSEvents.UPDATE_BACKEND_STATUS,
        onMessage: () => { void qc.invalidateQueries({ queryKey: BACKEND_UPDATE_STATUS_KEY }) },
    })
    const [showAllCommits, setShowAllCommits] = React.useState(false)
    const [showFiles, setShowFiles] = React.useState(false)
    // Re-render every 30 s so "2 min ago" / "in 3 min" stay true.
    const [, tick] = React.useReducer((n: number) => n + 1, 0)
    React.useEffect(() => {
        const id = window.setInterval(tick, 30_000)
        return () => window.clearInterval(id)
    }, [])

    // Live events when this page saw them; otherwise the server's own record of where it is (a page
    // opened mid-update has missed every event so far).
    const serverProgress = status?.updating ? status.progress : undefined
    if (serverProgress && !running) {
        progress = { percent: serverProgress.percent, step: serverProgress.step, failed: false }
    }
    const detail = status?.updating ? serverProgress?.detail : undefined
    const startedAt = status?.updating ? serverProgress?.startedAt : undefined
    const state = stateOf(status, running, progress)
    const pill = PILL[state]
    const failure = errorText || (progress?.failed ? progress.step : null) || status?.lastError || null
    const commits = status?.commits ?? []
    const shownCommits = showAllCommits ? commits : commits.slice(0, 6)
    const files = status?.files ?? []
    const ins = files.reduce((n, f) => n + f.insertions, 0)
    const del = files.reduce((n, f) => n + f.deletions, 0)
    const unsupported = isError && !status

    return (
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 p-5 shadow-xl shadow-black/20 backdrop-blur-md sm:p-6">
            {state === "available" && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-amber-400/10 blur-3xl" />}
            {state === "updating" && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand-500/15 blur-3xl" />}

            <div className="relative flex flex-wrap items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400/30 to-brand-700/20 text-brand-100 ring-1 ring-white/10">
                    <LuServer className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">Server</h3>
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", pill.className)}>
                            {pill.icon}{pill.label}
                        </span>
                    </div>
                    <p className="mt-0.5 text-sm text-[--muted]">
                        {remote
                            ? "The server this app is connected to. It updates itself from its own repository: pull, build, then restart into the new version. If the build fails, the running version keeps serving."
                            : "The server on this computer. It pulls the latest changes, builds, and swaps in the new version only if the build succeeds."}
                    </p>
                </div>
            </div>

            {/* Facts */}
            <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Fact label="Running" value={status ? status.version : "—"} sub={status?.commit ? status.commit : undefined} />
                <Fact label="Last checked" value={unsupported ? "—" : timeAgo(status?.lastChecked)} />
                <Fact label="Next check" value={unsupported ? "—" : timeUntil(status?.nextCheck)} sub="every 5 min" />
                <Fact label="Last updated" value={status?.lastUpdated ? new Date(status.lastUpdated).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"} />
            </div>

            {unsupported && !isLoading && (
                <p className="relative mt-4 rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs text-[--muted] ring-1 ring-white/[0.06]">
                    This server isn't running from a git checkout, so it can't report or install updates itself.
                </p>
            )}

            {/* Progress */}
            {state === "updating" && (
                <div className="relative mt-5 rounded-2xl bg-brand-500/[0.07] p-3.5 ring-1 ring-brand-400/20">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-brand-100">{progress?.step || "Starting the update…"}</span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-brand-100">{String(progress?.percent ?? 0).padStart(2, "0")}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-cyan-300 transition-[width] duration-1000" style={{ width: `${progress?.percent ?? 3}%` }} />
                    </div>
                    {!!detail && <p className="mt-2 truncate font-mono text-[11px] text-white/55" title={detail}>{detail}</p>}
                    <p className="mt-2 text-[11px] text-[--muted]">
                        {startedAt ? `Running for ${Math.max(1, Math.round((Date.now() / 1000 - startedAt) / 60))} min · ` : ""}
                        The server restarts when the build is done; this page reconnects by itself.
                    </p>
                </div>
            )}

            {/* Failure */}
            {state === "failed" && failure && (
                <div className="relative mt-5 flex gap-3 rounded-2xl bg-red-500/[0.08] p-3.5 ring-1 ring-red-400/25">
                    <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-red-300" />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-red-200">{progress?.failed || errorText ? "The update didn't go through" : "The last check failed"}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-red-100/80">{failure}</p>
                    </div>
                </div>
            )}

            {/* What's waiting */}
            {status?.behind && (
                <div className="relative mt-5 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold">
                            {status.commitsBehind} new commit{status.commitsBehind === 1 ? "" : "s"}
                            {files.length > 0 && (
                                <span className="ml-2 font-normal text-[--muted]">
                                    {files.length} file{files.length === 1 ? "" : "s"} · <span className="text-emerald-400">+{ins}</span> <span className="text-red-400">−{del}</span>
                                </span>
                            )}
                        </p>
                    </div>
                    <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/[0.06]">
                        {shownCommits.map(c => (
                            <li key={c.hash} className="flex items-start gap-3 px-3.5 py-2.5">
                                <LuGitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-amber-300/80" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium" title={c.subject}>{c.subject}</p>
                                    <p className="text-[11px] text-[--muted]">{c.author} · {timeAgo(c.date)}</p>
                                </div>
                                <code className="shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-fuchsia-300">{c.hash}</code>
                            </li>
                        ))}
                    </ul>
                    {commits.length > 6 && (
                        <button type="button" onClick={() => setShowAllCommits(v => !v)} className="text-xs font-medium text-brand-300 hover:text-brand-200">
                            {showAllCommits ? "Show fewer" : `Show all ${commits.length}${status.commitsBehind > commits.length ? ` (of ${status.commitsBehind})` : ""}`}
                        </button>
                    )}
                    {files.length > 0 && (
                        <div>
                            <button type="button" onClick={() => setShowFiles(v => !v)} className="flex items-center gap-1 text-xs font-medium text-[--muted] hover:text-white">
                                <LuChevronDown className={cn("size-3.5 transition-transform", showFiles && "rotate-180")} />
                                {showFiles ? "Hide changed files" : "Show changed files"}
                            </button>
                            {showFiles && (
                                <div className="mt-2 max-h-56 overflow-auto rounded-xl bg-black/30 p-2.5 font-mono text-[11px] ring-1 ring-white/[0.06]">
                                    {files.map(f => (
                                        <div key={f.path} className="flex justify-between gap-3 py-0.5">
                                            <span className="truncate text-cyan-200/90">{f.path}</span>
                                            <span className="shrink-0 tabular-nums"><span className="text-emerald-400">+{f.insertions}</span> <span className="text-red-400">−{f.deletions}</span></span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {status.blocked && (
                        <p className="rounded-xl bg-amber-400/[0.08] px-3 py-2 text-xs text-amber-100/90 ring-1 ring-amber-300/20">{status.blocked}</p>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="relative mt-5 flex flex-wrap gap-2">
                <Button
                    intent={status?.behind ? "primary" : "gray-outline"}
                    loading={running}
                    disabled={running || checking || state === "updating"}
                    leftIcon={<LuCircleArrowUp className="size-4" />}
                    onClick={onUpdate}
                >
                    {status?.behind ? "Update now" : "Update backend"}
                </Button>
                <Button
                    intent="gray-subtle"
                    loading={checking}
                    disabled={running || checking}
                    leftIcon={<LuRefreshCw className="size-4" />}
                    onClick={onCheck}
                >
                    Check now
                </Button>
            </div>
        </section>
    )
}

export function Fact({ label, value, sub }: { label: string, value: string, sub?: string }) {
    return (
        <div className="rounded-2xl bg-black/25 px-3 py-2.5 ring-1 ring-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[--muted]">{label}</p>
            <p className="mt-0.5 truncate text-sm font-semibold tabular-nums" title={value}>{value}</p>
            {sub && <p className="truncate font-mono text-[10px] text-[--muted]" title={sub}>{sub}</p>}
        </div>
    )
}
