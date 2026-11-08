"use client"

import { formatCount } from "@/lib/helpers/number"
import { __frontendUpdate_revealAtom } from "@/app/(main)/_features/stale-frontend-banner"
import { Fact, PILL, timeAgo, timeUntil, UpdateState } from "@/app/(main)/settings/_containers/server-update-card"
import { MAX_LOG_LINES, readProgress, stamp, updateSettingsLogAtom } from "@/app/(main)/settings/_containers/update-settings"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Switch } from "@/components/ui/switch"
import { useAtom } from "jotai"
import React from "react"
import { BiLinkExternal } from "react-icons/bi"
import { LuCheck, LuChevronDown, LuCircleAlert, LuCircleArrowUp, LuGitCommitHorizontal, LuLoaderCircle, LuMonitor, LuRefreshCw, LuX } from "react-icons/lu"
import { toast } from "sonner"

// The Frontend card on Settings → Updates, the sibling of the Server card: what this device shows,
// whether a newer build is on GitHub and what it brings. CI pushes every frontend build to the
// "frontend-live" branch; Denshi watches it once a minute, swaps the new build in and reloads as soon
// as nothing is playing — no git, no Node and no account needed on this machine.
// Settings live on the Electron side (denshiSettings), per machine.

const CHECK_INTERVAL_SECONDS = 60
const GITHUB_API = "https://api.github.com/repos/AureliusGilchrist/seaserver"

// Matches the percentages github-frontend-update.js reports.
const INSTALL_STEPS = [
    { percent: 5, label: "Find build" },
    { percent: 15, label: "Download" },
    { percent: 55, label: "Unpack" },
    { percent: 80, label: "Swap in" },
    { percent: 100, label: "Reload" },
]

const SOURCE: Record<NonNullable<LiveUpdateGitHubCheck["currentSource"]>, { label: string, sub: string }> = {
    github: { label: "Live build", sub: "installed from GitHub" },
    bundled: { label: "Bundled", sub: "shipped with Denshi" },
    local: { label: "Local build", sub: "built from source" },
}

type FrontendInfo = Awaited<ReturnType<NonNullable<NonNullable<NonNullable<Window["electron"]>["liveUpdate"]>["getGitHubInfo"]>>>

type FrontendChanges = {
    url: string
    total: number
    commits: { hash: string, subject: string, author: string, date: number, url: string }[]
    files: { path: string, insertions: number, deletions: number }[]
}

async function fetchFrontendChanges(from: string, to: string): Promise<FrontendChanges | null> {
    try {
        const res = await fetch(`${GITHUB_API}/compare/${from}...${to}`, { headers: { Accept: "application/vnd.github+json" } })
        if (!res.ok) return null
        const data = await res.json() as {
            html_url: string
            total_commits: number
            commits?: { sha: string, html_url: string, commit: { message: string, author?: { name?: string, date?: string } } }[]
            files?: { filename: string, additions: number, deletions: number }[]
        }
        return {
            url: data.html_url,
            total: data.total_commits,
            commits: (data.commits ?? []).map(c => ({
                hash: c.sha.slice(0, 7),
                subject: c.commit.message.split("\n")[0],
                author: c.commit.author?.name ?? "",
                date: c.commit.author?.date ? Math.round(new Date(c.commit.author.date).getTime() / 1000) : 0,
                url: c.html_url,
            })).reverse(),
            files: (data.files ?? []).map(f => ({ path: f.filename, insertions: f.additions, deletions: f.deletions })),
        }
    }
    catch {
        return null
    }
}

function formatSize(bytes: number) {
    return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

function formatDate(date: Date) {
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function shortCommit(commit?: string | null) {
    return commit ? commit.slice(0, 7) : undefined
}

export function FrontendUpdateCard() {
    const cardRef = React.useRef<HTMLElement>(null)
    const [reveal, setReveal] = useAtom(__frontendUpdate_revealAtom)
    const [highlighted, setHighlighted] = React.useState(false)

    // Sent here by the update banner: wait for the tab to settle, then show the card.
    React.useEffect(() => {
        if (!reveal) return
        setReveal(false)
        setHighlighted(true)
        const scroll = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 350)
        const fade = setTimeout(() => setHighlighted(false), 2500)
        return () => {
            clearTimeout(scroll)
            clearTimeout(fade)
        }
    }, [reveal])

    const [settings, setSettings] = React.useState<DenshiSettings | null>(null)
    const [info, setInfo] = React.useState<FrontendInfo | null>(null)
    const [checking, setChecking] = React.useState(false)
    // Set by the Update button, and by an update this page didn't start (the one on launch).
    const [updating, setUpdatingState] = React.useState(false)
    const updatingRef = React.useRef(false)
    const setUpdating = React.useCallback((value: boolean) => {
        updatingRef.current = value
        setUpdatingState(value)
    }, [])
    const [installError, setInstallError] = React.useState<string | null>(null)
    const [result, setResult] = React.useState<LiveUpdateGitHubCheck | null>(null)
    const [checkedAt, setCheckedAt] = React.useState<number | null>(null)
    const [changes, setChanges] = React.useState<FrontendChanges | null>(null)
    const changesKeyRef = React.useRef<string | null>(null)
    const [showAll, setShowAll] = React.useState(false)
    const [showFiles, setShowFiles] = React.useState(false)
    const [lines, setLines] = useAtom(updateSettingsLogAtom)

    // Re-render every 30 s so "2 min ago" / "in 3 min" stay true.
    const [, tick] = React.useReducer((n: number) => n + 1, 0)
    React.useEffect(() => {
        const id = window.setInterval(tick, 30_000)
        return () => window.clearInterval(id)
    }, [])

    const appendLines = React.useCallback((next: string[]) => {
        if (!next.length) return
        setLines(prev => [...prev, ...next].slice(-MAX_LOG_LINES))
    }, [setLines])

    const refreshInfo = React.useCallback(() => {
        void window.electron?.liveUpdate?.getGitHubInfo?.().then((next) => {
            setInfo(next)
            if (next.busy) setUpdating(true)
        })
    }, [setUpdating])

    React.useEffect(() => {
        window.electron?.denshiSettings.get().then(setSettings)
        refreshInfo()
    }, [refreshInfo])

    // Surface progress here and in the shared update log (the Updates tab renders it in full).
    // Failed checks report through the same event, so a failure only counts during an update.
    React.useEffect(() => {
        const off = window.electron?.on("live-update:progress", (p: { target: string, line: string }) => {
            if (p.target !== "frontend") return
            appendLines([stamp(p.line)])
            const progress = readProgress([p.line])
            if (!progress) return
            const failure = progress.step.match(/^Failed(?:\s*-\s*(.*))?$/)
            if (failure) {
                if (!updatingRef.current) return
                setInstallError(failure[1] || "The update failed.")
                setUpdating(false)
            } else {
                setInstallError(null)
                setUpdating(true)
            }
        })
        return () => off?.()
    }, [appendLines, setUpdating])

    // `announce` is for a check the user asked for: it says how it went, even when nothing changed.
    // GitHub often answers in a few hundred milliseconds, and a result identical to the last one
    // replaced in that time looked like the button did nothing, so the check shows for at least a
    // moment.
    async function refresh(announce: boolean = false) {
        const liveUpdate = window.electron?.liveUpdate
        if (!liveUpdate?.checkGitHub) return
        setChecking(true)
        const started = Date.now()
        try {
            const res = await liveUpdate.checkGitHub()
            const elapsed = Date.now() - started
            if (elapsed < 900) await new Promise(r => setTimeout(r, 900 - elapsed))
            setResult(res)
            setCheckedAt(Math.round(Date.now() / 1000))
            refreshInfo()

            // What the update brings, from the commits the two builds came from. The answer never
            // changes for a pair, so it isn't asked for again on every check.
            const from = res.currentCommit
            const to = res.updateAvailable ? res.latestCommit : null
            const key = from && to ? `${from}...${to}` : null
            if (key !== changesKeyRef.current) {
                changesKeyRef.current = key
                setChanges(from && to ? await fetchFrontendChanges(from, to) : null)
            }

            if (res.ok) {
                const summary = res.updateAvailable
                    ? `Frontend: update available (${res.current ?? "unknown"} → ${res.latest})`
                    : `Frontend: up to date (${res.current ?? res.latest ?? "unknown"})`
                appendLines([stamp(summary)])
                if (announce) {
                    if (res.updateAvailable) toast.info(`Version ${res.latest} is available`)
                    else toast.success("You're on the latest frontend")
                }
            } else {
                appendLines([stamp(`Frontend check: Failed - ${res.error ?? "unknown error"}`)])
                if (announce) toast.error(`Could not reach GitHub: ${res.error ?? "unknown error"}`)
            }
        } catch (e: any) {
            toast.error(`Update check failed: ${e?.message ?? "unknown error"}`)
        } finally {
            setChecking(false)
        }
    }

    // Checked on open and every minute while shown. Only checks: with auto-update on, Denshi itself
    // installs new builds in the background.
    React.useEffect(() => {
        void refresh()
        const id = window.setInterval(() => refresh(), CHECK_INTERVAL_SECONDS * 1000)
        return () => window.clearInterval(id)
    }, [])

    async function handleInstall() {
        const liveUpdate = window.electron?.liveUpdate
        if (!liveUpdate?.updateGitHub) return
        setUpdating(true)
        setInstallError(null)
        setLines([stamp("Frontend update: [00%] Checking GitHub for the latest frontend")])
        try {
            const res = await liveUpdate.updateGitHub()
            if (res.ok) {
                toast.success(res.message ?? `Frontend updated to ${res.version}`)
                appendLines(["", stamp(`Frontend update: [100%] Succeeded (${res.version})`)])
                refreshInfo()
            } else {
                setInstallError(res.error ?? "unknown error")
                toast.error(`Frontend update failed: ${res.error ?? "unknown error"}`)
            }
        } catch (e: any) {
            setInstallError(e?.message ?? "unknown error")
            toast.error(`Frontend update failed: ${e?.message ?? "unknown error"}`)
            appendLines(["", stamp(`Frontend update: Failed - ${e?.message ?? "unknown error"}`)])
        } finally {
            setUpdating(false)
        }
    }

    function setAutoUpdate(value: boolean) {
        if (!window.electron?.denshiSettings) return
        const next = { ...(settings ?? ({} as DenshiSettings)), autoUpdateFrontend: value }
        setSettings(next)
        window.electron.denshiSettings.set(next)
    }

    if (!window.electron?.liveUpdate?.checkGitHub) return null

    const current = result?.ok ? result.current : (info?.version ?? result?.current)
    const source = (result?.ok ? result.currentSource : undefined) ?? info?.source ?? result?.currentSource
    const installedAt = info?.installedAt ?? result?.installedAt
    const latest = result?.ok ? result.latest : null
    const available = !!result?.ok && !!result.updateAvailable
    const progress = updating ? readProgress(lines) : null
    const percent = progress?.target === "frontend" ? progress.percent : 0
    const step = progress?.target === "frontend" ? progress.step : ""
    const failure = installError ?? (result && !result.ok ? result.error ?? "unknown error" : null)

    const state: UpdateState = updating ? "updating"
        : failure ? "failed"
            : available ? "available"
                : checking ? "checking"
                    : result?.ok ? "uptodate"
                        : "unknown"
    const isLocal = source === "local" && state === "uptodate"
    const pill = isLocal ? { ...PILL.unknown, label: "Local build" } : PILL[state]

    const commits = changes?.commits ?? []
    const shownCommits = showAll ? commits : commits.slice(0, 6)
    const files = changes?.files ?? []
    const ins = files.reduce((n, f) => n + f.insertions, 0)
    const del = files.reduce((n, f) => n + f.deletions, 0)
    const releaseUrl = result?.releaseUrl
    const canInstall = !!result?.canInstall

    return (
        <section
            ref={cardRef}
            className={cn("relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 p-5 shadow-xl shadow-black/20 backdrop-blur-md sm:p-6 scroll-mt-24 transition-shadow duration-500", highlighted && "ring-2 ring-brand-400/70")}>
            {state === "available" && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-amber-400/10 blur-3xl" />}
            {state === "updating" && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand-500/15 blur-3xl" />}

            <div className="relative flex flex-wrap items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400/30 to-brand-700/20 text-brand-100 ring-1 ring-white/10">
                    <LuMonitor className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                        <h3 className="text-lg font-semibold">Frontend</h3>
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", pill.className)}>
                            {pill.icon}{pill.label}
                        </span>
                    </div>
                    <p className="mt-0.5 text-sm text-[--muted]">
                        The interface on this device. New builds arrive within a minute of being pushed and swap in live (after any playing video stops),
                        with no git, Node or GitHub account needed. If anything fails, the current version stays in place.
                    </p>
                </div>
            </div>

            {/* Facts */}
            <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Fact
                    label="Running"
                    value={current ?? (source === "local" ? "Unknown" : "—")}
                    sub={shortCommit(result?.currentCommit ?? info?.commit) ?? (source === "local" ? "built on this machine" : undefined)}
                />
                <Fact
                    label="Latest"
                    value={latest ?? "—"}
                    sub={result?.latestBuiltAt ? `${shortCommit(result.latestCommit)} · built ${timeAgo(Math.round(new Date(result.latestBuiltAt).getTime() / 1000))}` : undefined}
                />
                <Fact
                    label="Installed"
                    value={installedAt ? formatDate(new Date(installedAt)) : "—"}
                    sub={installedAt ? timeAgo(Math.round(new Date(installedAt).getTime() / 1000)) : source === "bundled" ? "with the app" : undefined}
                />
                <Fact label="Source" value={source ? SOURCE[source].label : "—"} sub={info?.marker?.tag ?? (source ? SOURCE[source].sub : undefined)} />
                <Fact label="Last checked" value={checking ? "Checking…" : timeAgo(checkedAt ?? undefined)} sub={checkedAt ? "from GitHub" : undefined} />
                <Fact label="Next check" value={checkedAt ? timeUntil(checkedAt + CHECK_INTERVAL_SECONDS) : "—"} sub="every minute" />
                <Fact
                    label="Download size"
                    value={result?.assetSize ? formatSize(result.assetSize) : "—"}
                    sub={result?.assetName ?? undefined}
                />
                <Fact label="Auto-update" value={settings?.autoUpdateFrontend !== false ? "On" : "Off"} sub={result?.pendingReload ? "waiting for playback" : "live"} />
            </div>

            {/* Progress */}
            {state === "updating" && (
                <div className="relative mt-5 rounded-2xl bg-brand-500/[0.07] p-3.5 ring-1 ring-brand-400/20">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-brand-100">{step || "Starting the update…"}</span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-brand-100">{String(percent).padStart(2, "0")}%</span>
                    </div>
                    <div className="sea-progress-track h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="sea-progress-fill h-full rounded-full bg-gradient-to-r from-brand-400 to-cyan-300 transition-[width] duration-1000" style={{ width: `${Math.max(percent, 3)}%` }} />
                    </div>
                    <InstallSteps percent={percent} />
                    <p className="mt-3 text-[11px] text-[--muted]">The app reloads by itself when the new version is in place.</p>
                </div>
            )}

            {/* Failure */}
            {state === "failed" && failure && (
                <div className="relative mt-5 flex gap-3 rounded-2xl bg-red-500/[0.08] p-3.5 ring-1 ring-red-400/25">
                    <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-red-300" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-red-200">{installError ? "The update didn't go through" : "Could not reach GitHub"}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-red-100/80">{failure}</p>
                        {!!installError && <InstallSteps percent={readProgress(lines)?.percent ?? 0} failed />}
                    </div>
                </div>
            )}

            {/* A local build has no version to compare, so nothing says it's behind */}
            {isLocal && (
                <p className="relative mt-5 rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs text-[--muted] ring-1 ring-white/[0.06]">
                    This frontend was built on this machine after the newest GitHub build, so there is nothing newer to install. The next pushed
                    build replaces it automatically.
                </p>
            )}

            {/* What's waiting */}
            {available && commits.length > 0 && (
                <div className="relative mt-5 space-y-3">
                    <p className="text-sm font-semibold">
                        {`${formatCount(changes?.total ?? commits.length)} new commit${(changes?.total ?? commits.length) === 1 ? "" : "s"}`}
                        {files.length > 0 && (
                            <span className="ml-2 font-normal text-[--muted]">
                                {formatCount(files.length)} file{files.length === 1 ? "" : "s"} · <span className="text-emerald-400">+{ins}</span> <span className="text-red-400">−{del}</span>
                            </span>
                        )}
                    </p>
                    <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/[0.06]">
                        {shownCommits.map(c => (
                                <li key={c.hash} className="flex items-start gap-3 px-3.5 py-2.5">
                                    <LuGitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-amber-300/80" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium" title={c.subject}>{c.subject}</p>
                                        <p className="text-[11px] text-[--muted]">{c.author} · {timeAgo(c.date)}</p>
                                    </div>
                                    <a href={c.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-fuchsia-300 hover:underline">{c.hash}</a>
                                </li>
                            ))}
                    </ul>
                    {commits.length > 6 && (
                        <button type="button" onClick={() => setShowAll(v => !v)} className="text-xs font-medium text-brand-300 hover:text-brand-200">
                            {showAll ? "Show fewer" : `Show all ${commits.length}`}
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
                </div>
            )}

            <div className="relative mt-5">
                <Switch
                    side="right"
                    value={!!settings?.autoUpdateFrontend}
                    onValueChange={setAutoUpdate}
                    label="Update the frontend automatically"
                    help="When enabled, the app checks GitHub every minute and installs each new frontend build as it is pushed, reloading once nothing is playing."
                />
            </div>

            {/* Actions */}
            <div className="relative mt-3 flex flex-wrap gap-2">
                <Button
                    intent={canInstall ? "primary" : "gray-outline"}
                    loading={updating}
                    disabled={checking || updating || !canInstall}
                    leftIcon={<LuCircleArrowUp className="size-4" />}
                    onClick={handleInstall}
                >
                    {available ? "Update now" : isLocal ? "Install from GitHub" : "Update frontend"}
                </Button>
                <Button
                    intent="gray-subtle"
                    loading={checking}
                    disabled={checking || updating}
                    leftIcon={<LuRefreshCw className="size-4" />}
                    onClick={() => refresh(true)}
                >
                    Check now
                </Button>
                {!!(changes?.url ?? releaseUrl) && (
                    <a href={changes?.url ?? releaseUrl ?? undefined} target="_blank" rel="noreferrer">
                        <Button intent="gray-subtle" rightIcon={<BiLinkExternal className="size-4" />}>
                            {changes ? "Compare on GitHub" : "See on GitHub"}
                        </Button>
                    </a>
                )}
            </div>
        </section>
    )
}

function InstallSteps({ percent, failed }: { percent: number, failed?: boolean }) {
    const active = INSTALL_STEPS.reduce((at, s, i) => percent >= s.percent ? i : at, 0)
    return (
        <ol className="mt-3 grid grid-cols-5 gap-1.5">
            {INSTALL_STEPS.map((s, i) => {
                const done = i < active || (!failed && percent >= 100)
                const current = i === active && !done
                return (
                    <li key={s.label} className="flex min-w-0 flex-col items-center gap-1 text-center">
                        <span className={cn(
                            "flex size-5 items-center justify-center rounded-full ring-1",
                            done && "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
                            current && !failed && "bg-brand-500/20 text-brand-100 ring-brand-400/40",
                            current && failed && "bg-red-500/15 text-red-300 ring-red-400/30",
                            !done && !current && "bg-white/[0.04] text-white/30 ring-white/[0.08]",
                        )}>
                            {done && <LuCheck className="size-3" />}
                            {current && !failed && <LuLoaderCircle className="size-3 animate-spin" />}
                            {current && failed && <LuX className="size-3" />}
                        </span>
                        <span className={cn("max-w-full truncate text-[10px]", done || current ? "text-white/80" : "text-[--muted]")}>{s.label}</span>
                    </li>
                )
            })}
        </ol>
    )
}
