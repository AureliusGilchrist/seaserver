"use client"

import { Fact, PILL, timeAgo, timeUntil, UpdateState } from "@/app/(main)/settings/_containers/server-update-card"
import { MAX_LOG_LINES, readProgress, stamp, updateSettingsLogAtom } from "@/app/(main)/settings/_containers/update-settings"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Switch } from "@/components/ui/switch"
import { useAtom } from "jotai"
import React from "react"
import { BiLinkExternal } from "react-icons/bi"
import { LuCheck, LuChevronDown, LuCircleAlert, LuCircleArrowUp, LuGitCommitHorizontal, LuLoaderCircle, LuMonitor, LuPackage, LuRefreshCw, LuX } from "react-icons/lu"
import { toast } from "sonner"

// The Frontend card on Settings → Updates, the sibling of the Server card: what this device shows,
// whether a newer bundle is on GitHub and what it brings. The app downloads the prebuilt bundle the
// CI publishes, swaps it in and reloads — no git, no Node and no account needed on this machine.
// Settings live on the Electron side (denshiSettings), per machine.

const CHECK_INTERVAL_SECONDS = 5 * 60
const GITHUB_API = "https://api.github.com/repos/AureliusGilchrist/seaserver"

// Matches the percentages github-frontend-update.js reports.
const INSTALL_STEPS = [
    { percent: 5, label: "Find release" },
    { percent: 15, label: "Download" },
    { percent: 55, label: "Unpack" },
    { percent: 80, label: "Swap in" },
    { percent: 100, label: "Reload" },
]

const SOURCE: Record<NonNullable<LiveUpdateGitHubCheck["currentSource"]>, { label: string, sub: string }> = {
    github: { label: "GitHub release", sub: "installed from here" },
    bundled: { label: "Bundled", sub: "shipped with Denshi" },
    local: { label: "Local build", sub: "built from source" },
}

type FrontendInfo = Awaited<ReturnType<NonNullable<NonNullable<NonNullable<Window["electron"]>["liveUpdate"]>["getGitHubInfo"]>>>

type FrontendRelease = {
    version: string
    tag: string
    releaseUrl: string
    publishedAt: number
    assetName: string
    assetSize: number
    commit: string | null
    installerUrl: string | null
}

type FrontendChanges = {
    url: string
    total: number
    commits: { hash: string, subject: string, author: string, date: number, url: string }[]
    files: { path: string, insertions: number, deletions: number }[]
}

/** Dotted versions like "5.3.5-14.auto.154.1", segment by segment (the same rule Denshi uses). */
function compareFrontendVersions(a: string, b: string) {
    const pa = a.toLowerCase().split(/[.\-_+]/)
    const pb = b.toLowerCase().split(/[.\-_+]/)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i], y = pb[i]
        if (x === undefined) return -1
        if (y === undefined) return 1
        const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y)
        if (nx && ny) {
            if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
        } else if (nx !== ny) {
            return nx ? -1 : 1
        } else if (x !== y) {
            return x < y ? -1 : 1
        }
    }
    return 0
}

/** Every release carrying a frontend bundle, newest first. Empty when GitHub can't be reached. */
async function fetchFrontendReleases(): Promise<FrontendRelease[]> {
    try {
        const res = await fetch(`${GITHUB_API}/releases?per_page=100`, { headers: { Accept: "application/vnd.github+json" } })
        if (!res.ok) return []
        const releases = await res.json() as {
            tag_name: string
            draft?: boolean
            html_url: string
            published_at: string
            body?: string
            assets?: { name: string, size: number, browser_download_url: string }[]
        }[]
        const out: FrontendRelease[] = []
        for (const r of releases) {
            const asset = r.assets?.find(a => /^denshi-frontend-.*\.zip$/i.test(a.name))
            if (r.draft || !asset) continue
            out.push({
                version: r.tag_name.replace(/^v/, ""),
                tag: r.tag_name,
                releaseUrl: r.html_url,
                publishedAt: Math.round(new Date(r.published_at).getTime() / 1000),
                assetName: asset.name,
                assetSize: asset.size,
                // The workflow writes "…build from commit <sha>." into each release.
                commit: r.body?.match(/\bcommit ([0-9a-f]{40})\b/)?.[1] ?? null,
                installerUrl: r.assets?.find(a => /^seanime-denshi-.*windows.*\.exe$/i.test(a.name))?.browser_download_url ?? null,
            })
        }
        return out.sort((a, b) => compareFrontendVersions(b.version, a.version))
    }
    catch {
        return []
    }
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
    const [releases, setReleases] = React.useState<FrontendRelease[]>([])
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
            const [res, found] = await Promise.all([liveUpdate.checkGitHub(), fetchFrontendReleases()])
            const elapsed = Date.now() - started
            if (elapsed < 900) await new Promise(r => setTimeout(r, 900 - elapsed))
            setResult(res)
            setReleases(found)
            setCheckedAt(Math.round(Date.now() / 1000))
            refreshInfo()

            // What the update brings, from the commits the two releases were built from. The answer
            // never changes for a pair, so it isn't asked for again on every 5-minute check.
            const from = found.find(r => r.version === res.current)?.commit
            const to = res.updateAvailable ? found.find(r => r.version === res.latest)?.commit : null
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

    // Checked on open and every 5 minutes while shown, like the server. Only checks: installing
    // reloads the app, so it waits for a click (or the next launch, with auto-update on).
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
    const currentRelease = releases.find(r => r.version === current)
    const latestRelease = releases.find(r => r.version === result?.latest) ?? releases[0]
    const latest = (result?.ok ? result.latest : null) ?? latestRelease?.version
    const available = !!result?.ok && !!result.updateAvailable
    // What GitHub itself says is newest. Denshi builds before 5.3.5-15 took the first frontend in
    // GitHub's release list, which is in tag-name order ("…-9…" before "…-14…"), and so reported
    // "up to date" on an old version. When that happens the card says so and links the Denshi
    // installer that fixes it.
    const newest = releases[0]
    const missed = !!result?.ok && !available && !!current && !!newest && compareFrontendVersions(newest.version, current) > 0 ? newest : null
    const pending = available && current ? releases.filter(r => compareFrontendVersions(r.version, current) > 0) : []

    const progress = updating ? readProgress(lines) : null
    const percent = progress?.target === "frontend" ? progress.percent : 0
    const step = progress?.target === "frontend" ? progress.step : ""
    const failure = installError ?? (result && !result.ok ? result.error ?? "unknown error" : null)

    const state: UpdateState = updating ? "updating"
        : failure ? "failed"
            : available || missed ? "available"
                : checking ? "checking"
                    : result?.ok ? "uptodate"
                        : "unknown"
    const isLocal = source === "local" && state === "uptodate"
    const pill = isLocal ? { ...PILL.unknown, label: "Local build" } : PILL[state]

    const commits = changes?.commits ?? []
    const shownCommits = showAll ? commits : commits.slice(0, 6)
    const shownReleases = showAll ? pending : pending.slice(0, 6)
    const files = changes?.files ?? []
    const ins = files.reduce((n, f) => n + f.insertions, 0)
    const del = files.reduce((n, f) => n + f.deletions, 0)
    const releaseUrl = result?.releaseUrl ?? latestRelease?.releaseUrl
    const canInstall = !!result?.canInstall

    return (
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 p-5 shadow-xl shadow-black/20 backdrop-blur-md sm:p-6">
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
                        The interface on this device. It downloads the prebuilt bundle from GitHub releases and swaps it in live, with no git, Node or
                        GitHub account needed. If anything fails, the current version stays in place.
                    </p>
                </div>
            </div>

            {/* Facts */}
            <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Fact
                    label="Running"
                    value={current ?? (source === "local" ? "Unknown" : "—")}
                    sub={shortCommit(currentRelease?.commit) ?? (source === "local" ? "version unknown" : undefined)}
                />
                <Fact
                    label="Latest"
                    value={latest ?? "—"}
                    sub={latestRelease ? `published ${timeAgo(latestRelease.publishedAt)}` : undefined}
                />
                <Fact
                    label="Installed"
                    value={installedAt ? formatDate(new Date(installedAt)) : "—"}
                    sub={installedAt ? timeAgo(Math.round(new Date(installedAt).getTime() / 1000)) : source === "bundled" ? "with the app" : undefined}
                />
                <Fact label="Source" value={source ? SOURCE[source].label : "—"} sub={info?.marker?.tag ?? (source ? SOURCE[source].sub : undefined)} />
                <Fact label="Last checked" value={checking ? "Checking…" : timeAgo(checkedAt ?? undefined)} sub={checkedAt ? "from GitHub" : undefined} />
                <Fact label="Next check" value={checkedAt ? timeUntil(checkedAt + CHECK_INTERVAL_SECONDS) : "—"} sub="every 5 min" />
                <Fact
                    label="Download size"
                    value={latestRelease ? formatSize(latestRelease.assetSize) : "—"}
                    sub={result?.assetName ?? latestRelease?.assetName}
                />
                <Fact label="Auto-update" value={settings?.autoUpdateFrontend ? "On" : "Off"} sub="on launch" />
            </div>

            {/* Progress */}
            {state === "updating" && (
                <div className="relative mt-5 rounded-2xl bg-brand-500/[0.07] p-3.5 ring-1 ring-brand-400/20">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-brand-100">{step || "Starting the update…"}</span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-brand-100">{String(percent).padStart(2, "0")}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-cyan-300 transition-[width] duration-1000" style={{ width: `${Math.max(percent, 3)}%` }} />
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

            {/* Newer than this Denshi can see */}
            {missed && (
                <p className="relative mt-5 rounded-xl bg-amber-400/[0.08] px-3 py-2.5 text-xs text-amber-100/90 ring-1 ring-amber-300/20">
                    Version <span className="font-medium">{missed.version}</span> is on GitHub, but this copy of Denshi can't see it: its updater picks
                    releases in the wrong order. Install the new Denshi once and frontend updates work again.{" "}
                    <a
                        className="font-semibold text-amber-200 underline underline-offset-2 hover:text-white"
                        href={missed.installerUrl ?? missed.releaseUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {missed.installerUrl ? "Download the Denshi installer" : "Open the release"}
                    </a>
                </p>
            )}

            {/* A local build has no version to compare, so nothing says it's behind */}
            {isLocal && (
                <p className="relative mt-5 rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs text-[--muted] ring-1 ring-white/[0.06]">
                    This frontend was built on this machine, so its version can't be compared with GitHub. Installing replaces it with the latest release
                    {latest ? ` (${latest})` : ""}, and automatic updates apply from then on.
                </p>
            )}

            {/* What's waiting */}
            {available && (commits.length > 0 || pending.length > 0) && (
                <div className="relative mt-5 space-y-3">
                    <p className="text-sm font-semibold">
                        {changes
                            ? `${changes.total} new commit${changes.total === 1 ? "" : "s"}`
                            : `${pending.length} newer release${pending.length === 1 ? "" : "s"}`}
                        {files.length > 0 && (
                            <span className="ml-2 font-normal text-[--muted]">
                                {files.length} file{files.length === 1 ? "" : "s"} · <span className="text-emerald-400">+{ins}</span> <span className="text-red-400">−{del}</span>
                            </span>
                        )}
                    </p>
                    <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/[0.06]">
                        {changes
                            ? shownCommits.map(c => (
                                <li key={c.hash} className="flex items-start gap-3 px-3.5 py-2.5">
                                    <LuGitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-amber-300/80" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium" title={c.subject}>{c.subject}</p>
                                        <p className="text-[11px] text-[--muted]">{c.author} · {timeAgo(c.date)}</p>
                                    </div>
                                    <a href={c.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-fuchsia-300 hover:underline">{c.hash}</a>
                                </li>
                            ))
                            : shownReleases.map(r => (
                                <li key={r.tag} className="flex items-start gap-3 px-3.5 py-2.5">
                                    <LuPackage className="mt-0.5 size-4 shrink-0 text-amber-300/80" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium" title={r.version}>{r.version}</p>
                                        <p className="text-[11px] text-[--muted]">{formatSize(r.assetSize)} · {timeAgo(r.publishedAt)}</p>
                                    </div>
                                    <a href={r.releaseUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-fuchsia-300 hover:underline">{shortCommit(r.commit) ?? "release"}</a>
                                </li>
                            ))}
                    </ul>
                    {(changes ? commits.length : pending.length) > 6 && (
                        <button type="button" onClick={() => setShowAll(v => !v)} className="text-xs font-medium text-brand-300 hover:text-brand-200">
                            {showAll ? "Show fewer" : `Show all ${changes ? commits.length : pending.length}`}
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
                    help="When enabled, the app checks GitHub on launch and installs a newer frontend before you start watching. Only applies after the first update has been installed from here."
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
