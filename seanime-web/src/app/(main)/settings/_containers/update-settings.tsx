import { BACKEND_UPDATE_STATUS_KEY, serverErrorMessage, useCheckBackendUpdate, useUpdateBackend } from "@/api/hooks/update-notice.hooks"
import { ServerUpdateCard, timeAgo } from "@/app/(main)/settings/_containers/server-update-card"
import { FrontendUpdateCard } from "@/app/(main)/settings/_containers/frontend-update-card"
import { useQueryClient } from "@tanstack/react-query"
import { LuCheck, LuChevronDown, LuCircleAlert, LuClock3, LuFiles, LuHammer, LuLoaderCircle, LuRefreshCw, LuScrollText, LuSparkles, LuTerminal } from "react-icons/lu"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { SettingsCard } from "@/app/(main)/settings/_components/settings-card"
import { Button } from "@/components/ui/button"
import { websocketConnectedAtom } from "@/app/websocket-provider"
import { atom, useAtom, useAtomValue } from "jotai"
import { atomWithStorage } from "jotai/utils"
import React from "react"
import { toast } from "sonner"

type Target = "backend" | "frontend"
type DevChangedFile = { path: string, insertions: number, deletions: number }
type DevCheckResult = {
    at: number
    ok: boolean
    summary: string
    files: DevChangedFile[]
    insertions: number
    deletions: number
    baseline: boolean | null
}
type DevBuildResult = {
    at: number
    ok: boolean
    files: number
    insertions: number
    deletions: number
    lines: number
    message?: string
}

const UPDATE_LOG_STORAGE_KEY = "sea-settings-update-log"
export const MAX_LOG_LINES = 500
export const updateSettingsLogAtom = atomWithStorage<string[]>(UPDATE_LOG_STORAGE_KEY, [], undefined, { getOnInit: true })

// True while the "Dev update" (build the frontend from local files) is running, so the GitHub
// card stays out of the way: both updaters share the same progress channel and the same
// Electron-side busy lock.
export const __devUpdateActiveAtom = atom(false)

// Prefixes a log line with the time it was received; blank spacer lines are left alone.
export function stamp(line: string) {
    return line === "" ? line : `[${new Date().toLocaleTimeString([], { hour12: false })}] ${line}`
}

export function readProgress(lines: string[]) {
    for (let i = lines.length - 1; i >= 0; i--) {
        const text = lines[i].replace(/^\[[\d:]+\]\s?/, "")
        const match = text.match(/^(Backend|Frontend) update:\s*\[(\d{1,3})%\]\s*(.*)$/i)
        if (match) {
            const target: Target = match[1].toLowerCase() === "backend" ? "backend" : "frontend"
            return {
                target,
                percent: Math.min(100, Number(match[2])),
                step: match[3],
            }
        }
    }
    return null
}

export function UpdateSettings() {
    return (
        <div className="space-y-4">
            <LiveUpdates />
        </div>
    )
}

type LogTone = "ok" | "fail" | "warn" | "info" | "dim" | "plain"

function toneOf(text: string): LogTone {
    if (/\b(fail(ed|ure)?|error|fatal|panic|denied|cannot|could not)\b/i.test(text)) return "fail"
    if (/\b(succeed(ed)?|success|up to date|complete(d)?|done|now running)\b/i.test(text)) return "ok"
    if (/\b(warn(ing)?|note|blocked|stash(ed)?|backup)\b/i.test(text)) return "warn"
    if (/\b(update available|checking|fetching|building|installing|restarting|pulling|resetting|running)\b/i.test(text)) return "info"
    return "plain"
}

// Syntax-highlights a log line like source code: each token class gets its own color.
const TOKEN_RE = new RegExp([
    "(?<str>\"[^\"]*\"|'[^']*'|`[^`]*`)",
    "(?<url>https?://[^\\s)]+)",
    "(?<hash>\\b[0-9a-f]{7,40}\\b)",
    "(?<ref>\\b(?:refs/[\\w./-]+|origin/[\\w./-]+|HEAD)\\b)",
    "(?<path>(?:[\\w.-]+/)+[\\w.-]+|\\b[\\w-]+\\.(?:go|tsx?|jsx?|json|css|sh|md|mod|sum|ya?ml|html|exe)\\b)",
    "(?<add>\\+\\d+)",
    "(?<del>(?<![\\w-])-\\d+)",
    "(?<dur>\\b\\d+(?:\\.\\d+)?\\s?(?:ms|s|sec|seconds|m|min|minutes|MB|KB|GB)\\b)",
    "(?<ver>\\bv?\\d+\\.\\d+(?:\\.\\d+)+\\S*)",
    "(?<num>\\b\\d+\\b)",
    "(?<good>\\b(?:succeeded|success|successful|passed|ok|done|complete|completed|up to date|now running)\\b)",
    "(?<bad>\\b(?:failed|failure|error|fatal|panic|denied|cannot|could not|EACCES|aborted)\\b)",
    "(?<warn>\\b(?:warning|warn|note|blocked|stashed|backup|dirty|skipped)\\b)",
    "(?<kw>\\b(?:git|npm|go|bash|sudo|fetch|pull|reset|clean|checkout|build|install|restart|restarting|update|updating|available|checking|checked|stash|commit|branch|remote|binary|backend|frontend|server)\\b)",
    "(?<label>^[A-Za-z][\\w ]{0,30}(?=:))",
].join("|"), "gi")

const GROUP_CLASS: Record<string, string> = {
    str: "text-amber-300",
    url: "text-sky-400 underline decoration-sky-400/40",
    hash: "text-fuchsia-400",
    ref: "text-pink-400",
    path: "text-cyan-300",
    add: "text-green-400 font-semibold",
    del: "text-red-400 font-semibold",
    dur: "text-orange-300",
    ver: "text-teal-300",
    num: "text-orange-300",
    good: "text-green-400 font-semibold",
    bad: "text-red-400 font-semibold",
    warn: "text-yellow-300 font-semibold",
    kw: "text-violet-400",
    label: "text-blue-300",
}

function highlight(text: string): React.ReactNode[] {
    const out: React.ReactNode[] = []
    let last = 0
    let key = 0
    for (const m of text.matchAll(TOKEN_RE)) {
        const idx = m.index ?? 0
        if (idx > last) out.push(<React.Fragment key={key++}>{text.slice(last, idx)}</React.Fragment>)
        const group = Object.entries(m.groups ?? {}).find(([, v]) => v !== undefined)?.[0] ?? "plain"
        out.push(<span key={key++} className={GROUP_CLASS[group]}>{m[0]}</span>)
        last = idx + m[0].length
    }
    if (last < text.length) out.push(<React.Fragment key={key++}>{text.slice(last)}</React.Fragment>)
    return out
}

function LogLine({ line, inFailure }: { line: string, inFailure: boolean }) {
    if (line === "") return <div className="h-2" />
    const m = line.match(/^\[(\d{1,2}:\d{2}:\d{2})\]\s?(.*)$/)
    const time = m?.[1]
    const text = m ? m[2] : line
    const indented = /^\s{2,}/.test(text)
    const progress = text.match(/^(Backend|Frontend) update:\s*\[(\d{1,3})%\]\s*(.*)$/i)
    const progressPercent = progress ? Number(progress[2]) : null
    const progressStep = progress?.[3] ?? ""
    const isProgress = progressPercent !== null
    const isHeader = !indented && /^(backend|frontend) update:/i.test(text)
    const isFailed = toneOf(isProgress ? progressStep : text) === "fail"
    const headerTone = isProgress
        ? isFailed ? "bg-red-500/10" : progressPercent === 100 ? "bg-green-500/10" : "bg-brand-500/10"
        : isHeader ? (isFailed ? "bg-red-500/10" : toneOf(text) === "ok" ? "bg-green-500/10" : "bg-brand-500/10") : ""
    return (
        <div className={`flex gap-2 rounded px-1 ${headerTone} ${indented ? "pl-4 border-l-2 ml-1 " + (inFailure ? "border-red-500/50" : "border-gray-700") : ""}`}>
            {time && <span className="shrink-0 text-gray-600 tabular-nums">{time}</span>}
            {isProgress ? (
                <>
                    <span className={`inline-flex min-w-[3.5rem] shrink-0 justify-center rounded-md border px-2 py-1 text-sm font-bold leading-none tabular-nums tracking-tight ${
                        isFailed ? "border-red-500/30 bg-red-500/10 text-red-300"
                            : progressPercent === 100 ? "border-green-500/30 bg-green-500/10 text-green-300"
                                : "border-brand-400/30 bg-brand-500/10 text-brand-200"
                    }`}>
                        {String(progressPercent).padStart(2, "0")}%
                    </span>
                    <span className={`min-w-0 whitespace-pre-wrap break-all ${isFailed ? "text-red-200" : "text-gray-200"} font-semibold`}>
                        {highlight(progressStep)}
                    </span>
                </>
            ) : (
                <span className={`${inFailure && indented ? "text-red-200/90" : "text-gray-300"} ${isHeader ? "font-semibold" : ""} whitespace-pre-wrap break-all`}>
                    {highlight(text)}
                </span>
            )}
        </div>
    )
}

function StructuredLog({ lines, logRef }: { lines: string[], logRef: React.RefObject<HTMLDivElement | null> }) {
    const progress = readProgress(lines)
    const failed = !!progress && /fail(ed|ure)?|error/i.test(progress.step)
    const isFrontendBuild = progress?.target === "frontend" && /^Building\b/.test(progress.step)
    const status = failed ? "Failed" : progress?.percent === 100 ? "Complete" : progress ? "In progress" : "Saved log"
    let inFailure = false
    return (
        <div className="overflow-hidden rounded-xl border border-gray-700/80 bg-gray-950 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] pl-3 pr-24 py-2">
                <div className="flex items-center gap-2">
                    <span className="flex gap-1" aria-hidden="true">
                        <span className="h-2 w-2 rounded-full bg-red-400/80" />
                        <span className="h-2 w-2 rounded-full bg-amber-300/80" />
                        <span className="h-2 w-2 rounded-full bg-green-400/80" />
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Update log</span>
                    <span className="hidden text-[10px] text-gray-500 sm:inline">Saved locally · clears on the next update</span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    failed ? "border-red-500/30 bg-red-500/10 text-red-300"
                        : status === "Complete" ? "border-green-500/30 bg-green-500/10 text-green-300"
                            : "border-gray-700 bg-gray-900 text-gray-400"
                }`}>
                    {status}
                </span>
            </div>
            {progress && (
                <div className="border-b border-white/5 bg-gradient-to-r from-brand-500/[0.08] via-transparent to-cyan-500/[0.05] px-3 py-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
                        <span className="truncate text-gray-300">
                            {progress.target === "backend" ? "Backend" : "Frontend"} · {progress.step}
                        </span>
                        <span className={`inline-flex min-w-[4.25rem] shrink-0 justify-center rounded-lg border px-2.5 py-1 font-mono text-xl font-semibold leading-none tabular-nums tracking-tight ${
                            failed ? "border-red-500/30 bg-red-500/10 text-red-300"
                                : progress.percent === 100 ? "border-green-500/30 bg-green-500/10 text-green-300"
                                    : "border-brand-400/20 bg-brand-500/[0.08] text-brand-100"
                        }`}>
                            {String(progress.percent).padStart(2, "0")}%
                        </span>
                    </div>
                    <div
                        role="progressbar"
                        aria-label={`${progress.target === "backend" ? "Backend" : "Frontend"} update progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress.percent}
                        className="h-1.5 overflow-hidden rounded-full bg-white/10"
                    >
                        <div
                            className={`h-full rounded-full transition-[width] duration-1000 ease-in-out ${failed ? "bg-red-400" : progress.percent === 100 ? "bg-green-400" : "bg-gradient-to-r from-brand-400 to-cyan-300"} ${isFrontendBuild ? "animate-pulse" : ""}`}
                            style={{ width: `${progress.percent}%` }}
                        />
                    </div>
                </div>
            )}
            <div
                ref={logRef}
                style={{ userSelect: "text", WebkitUserSelect: "text" }}
                className="max-h-64 overflow-auto p-3 pr-24 text-xs font-mono space-y-0.5 cursor-text select-text"
            >
                {lines.map((line, i) => {
                    const text = line.replace(/^\[[\d:]+\]\s?/, "")
                    if (line === "") inFailure = false
                    else if (!/^\s{2,}/.test(text)) inFailure = /:\s*(?:\[\d{1,3}%\]\s*)?failed\b/i.test(text)
                    return <LogLine key={i} line={line} inFailure={inFailure} />
                })}
            </div>
        </div>
    )
}

function LiveUpdates() {
    const [detectedRoot, setDetectedRoot] = React.useState<string | null>(null)
    const [detectedOrigin, setDetectedOrigin] = React.useState<string | null>(null)
    const [running, setRunning] = React.useState<Target | null>(null)
    const [lines, setLines] = useAtom(updateSettingsLogAtom)
    const logRef = React.useRef<HTMLDivElement>(null)
    const initialProgress = readProgress(lines)
    const currentProgressRef = React.useRef(initialProgress?.target === "backend" ? initialProgress.percent : 0)
    const currentFrontendProgressRef = React.useRef(initialProgress?.target === "frontend" ? initialProgress.percent : 0)

    const [remote, setRemote] = React.useState(!window.electron?.liveUpdate)
    const { mutateAsync: updateRemoteBackend } = useUpdateBackend()
    const { mutateAsync: checkRemoteBackend } = useCheckBackendUpdate()
    const [checking, setChecking] = React.useState<Target | null>(null)
    // The last failure of Update now / Check now, in the server's own words (it used to show
    // axios's "Request failed with status code 500" and lose the reason).
    const [errorText, setErrorText] = React.useState<string | null>(null)
    const [showLog, setShowLog] = React.useState(false)
    const [devCheckResult, setDevCheckResult] = React.useState<DevCheckResult | null>(null)
    const [devBuildResult, setDevBuildResult] = React.useState<DevBuildResult | null>(null)
    const qc = useQueryClient()

    const appendLines = React.useCallback((next: string[]) => {
        if (!next.length) return
        setLines(prev => [...prev, ...next].slice(-MAX_LOG_LINES))
    }, [setLines])

    // Mark remote updates complete only after the backend has restarted and websocket reconnects.
    const pendingRef = React.useRef(false)
    const wasDownRef = React.useRef(false)
    const failureReceivedRef = React.useRef(false)
    const isConnected = useAtomValue(websocketConnectedAtom)

    const markSucceeded = React.useCallback(() => {
        if (!pendingRef.current) return
        pendingRef.current = false
        currentProgressRef.current = 100
        appendLines(["", stamp("Backend update: [100%] New version is running")])
    }, [appendLines])

    useWebsocketMessageListener<string>({
        type: WSEvents.UPDATE_BACKEND_LOG,
        onMessage: (msg) => {
            pendingRef.current = false
            failureReceivedRef.current = true
            const percent = currentProgressRef.current
            appendLines(["", stamp(`Backend update: [${String(percent).padStart(2, "0")}%] Failed`), ...String(msg).split("\n").map(l => `    ${l}`)])
        },
    })

    useWebsocketMessageListener<{ percent: number, step: string }>({
        type: WSEvents.UPDATE_BACKEND_PROGRESS,
        onMessage: ({ percent, step }) => {
            const safePercent = Math.max(0, Math.min(100, Math.round(percent)))
            currentProgressRef.current = safePercent
            appendLines([stamp(`Backend update: [${String(safePercent).padStart(2, "0")}%] ${step}`)])
        },
    })

    // The server restarts into the new binary, which drops the websocket. Coming back means the new
    // version is up, even if the notice event was missed while disconnecting.
    React.useEffect(() => {
        if (!pendingRef.current) return
        if (!isConnected) {
            wasDownRef.current = true
        } else if (wasDownRef.current) {
            wasDownRef.current = false
            markSucceeded()
        }
    }, [isConnected, markSucceeded])

    const liveUpdate = window.electron?.liveUpdate

    const refreshInfo = React.useCallback(() => {
        const localUpdater = window.electron?.liveUpdate
        if (!localUpdater) {
            setRemote(true)
            return
        }
        localUpdater.getInfo().then(info => {
            setDetectedRoot(info.repoRoot)
            setDetectedOrigin(info.repoOrigin ?? null)
            setRemote(!!info.remote)
        })
    }, [])

    React.useEffect(() => {
        refreshInfo()
        const off = window.electron?.on("live-update:progress", (p: { target: Target, line: string }) => {
            const progress = readProgress([p.line])
            if (p.target === "backend" && progress) currentProgressRef.current = progress.percent
            if (p.target === "frontend" && progress) currentFrontendProgressRef.current = progress.percent
            // The Frontend card logs its own lines; logging them here too printed each one twice.
            if (p.target === "backend") appendLines([stamp(p.line)])
        })
        return () => off?.()
    }, [appendLines, refreshInfo])

    React.useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
    }, [lines])

    async function check(target: Target) {
        setChecking(target)
        if (target === "backend") setErrorText(null)
        const label = target === "backend" ? "Backend" : "Frontend"
        const checkedAt = Math.round(Date.now() / 1000)
        try {
            let files: { path: string, insertions: number, deletions: number }[] = []
            let summary: string
            let baseline: boolean | null = null
            if (target === "backend" && (remote || !liveUpdate)) {
                const res = await checkRemoteBackend({})
                files = res?.files ?? []
                if (res?.behind && res.blocked) summary = `Update available. Note: ${res.blocked}`
                else summary = res?.behind ? "Update available" : "Up to date"
            } else {
                if (!liveUpdate) throw new Error("Frontend live updates are only available in the Denshi desktop app.")
                const fn = target === "backend" ? liveUpdate!.checkBackend : liveUpdate!.checkFrontend
                if (typeof fn !== "function") throw new Error("This app needs to be fully quit and restarted before it can run this update.")
                const res = await fn()
                if (!res.ok) throw new Error(res.error ?? "check failed")
                files = res.files ?? []
                if (target === "backend") summary = res.behind ? `Update available (${res.behind} new commit${res.behind === 1 ? "" : "s"})` : "Up to date"
                else {
                    baseline = !!res.baseline
                    if (!res.baseline) summary = "No previous build recorded yet. The next build becomes the baseline"
                    else summary = files.length ? "Changes since the last build" : "No changes since the last build"
                }
            }
            const ins = files.reduce((n, f) => n + f.insertions, 0)
            const del = files.reduce((n, f) => n + f.deletions, 0)
            if (target === "frontend") {
                setDevCheckResult({
                    at: checkedAt,
                    ok: true,
                    summary,
                    files,
                    insertions: ins,
                    deletions: del,
                    baseline,
                })
            }
            appendLines([
                "",
                stamp(`${label}: ${summary}`),
                ...(files.length ? [stamp(`${files.length} file${files.length === 1 ? "" : "s"} (+${ins} -${del}):`), ...files.map(f => `    ${f.path}  +${f.insertions} -${f.deletions}`)] : []),
            ])
        }
        catch (e: any) {
            const reason = serverErrorMessage(e)
            if (target === "backend") setErrorText(reason)
            if (target === "frontend") {
                setDevCheckResult({
                    at: checkedAt,
                    ok: false,
                    summary: `Check failed: ${reason}`,
                    files: [],
                    insertions: 0,
                    deletions: 0,
                    baseline: null,
                })
            }
            toast.error(`${label} check failed: ${reason}`)
            appendLines(["", stamp(`${label} check: Failed - ${reason}`)])
        }
        finally {
            setChecking(null)
            if (target === "backend") void qc.invalidateQueries({ queryKey: BACKEND_UPDATE_STATUS_KEY })
        }
    }

    async function run(target: Target) {
        const label = target === "backend" ? "Backend" : "Frontend"
        const startedAt = Math.round(Date.now() / 1000)
        currentProgressRef.current = 0
        currentFrontendProgressRef.current = 0
        failureReceivedRef.current = false
        pendingRef.current = target === "backend" && (remote || !liveUpdate)
        wasDownRef.current = false
        setLines([stamp(target === "backend"
            ? "Backend update: [00%] Checking for an available update"
            : "Frontend update: [00%] Preparing frontend update")])

        if (target === "backend" && (remote || !liveUpdate)) {
            setRunning(target)
            setErrorText(null)
            try {
                const res = await updateRemoteBackend({})
                const msg = res?.message ?? "Update requested."
                pendingRef.current = !!res?.started && !failureReceivedRef.current
                const files = res?.files ?? []
                const fileLines = files.length
                    ? [
                        stamp(`${files.length} file${files.length === 1 ? "" : "s"} changing (+${files.reduce((n, f) => n + f.insertions, 0)} -${files.reduce(
                            (n, f) => n + f.deletions, 0)}):`),
                        ...files.map(f => `    ${f.path}  +${f.insertions} -${f.deletions}`),
                    ]
                    : []
                if (res?.started) {
                    toast.success(msg)
                    setLines(prev => [stamp(msg), ...fileLines, "", ...prev].slice(-MAX_LOG_LINES))
                } else {
                    pendingRef.current = false
                    currentProgressRef.current = 100
                    toast.success(msg)
                    setLines([stamp(msg), stamp("Backend update: [100%] Already up to date")])
                }
            }
            catch (e: any) {
                pendingRef.current = false
                failureReceivedRef.current = true
                const reason = serverErrorMessage(e)
                const already = e?.response?.status === 409
                setErrorText(already ? null : reason)
                if (already) toast.info("The backend is already updating")
                else toast.error(`Backend update failed: ${reason}`)
                appendLines(["", stamp(`Backend update: [${String(currentProgressRef.current).padStart(2, "0")}%] ${already ? "Already updating" : `Failed - ${reason}`}`)])
            }
            finally {
                setRunning(null)
                void qc.invalidateQueries({ queryKey: BACKEND_UPDATE_STATUS_KEY })
            }
            return
        }
        setRunning(target)
        try {
            if (!liveUpdate) throw new Error("Frontend live updates are only available in the Denshi desktop app.")
            const res = target === "backend" ? await liveUpdate!.updateBackend() : await liveUpdate!.updateFrontend()
            const s = res.stats
            const changed = s && s.lines > 0
                ? ` (${s.files} file${s.files === 1 ? "" : "s"}, +${s.insertions}/-${s.deletions} = ${s.lines} lines changed)`
                : " (0 lines changed)"
            if (res.ok) {
                toast.success(`${label} update succeeded${changed}. ${res.message ?? ""}`.trim())
                if (target === "backend") currentProgressRef.current = 100
                else currentFrontendProgressRef.current = 100
                if (target === "frontend") {
                    setDevBuildResult({
                        at: startedAt,
                        ok: true,
                        files: s?.files ?? 0,
                        insertions: s?.insertions ?? 0,
                        deletions: s?.deletions ?? 0,
                        lines: s?.lines ?? 0,
                        message: res.message,
                    })
                }
                appendLines(["", stamp(target === "backend"
                    ? `Backend update: [100%] Succeeded${changed}`
                    : `Frontend update: [100%] Succeeded${changed}`)])
            } else {
                if (target === "frontend") {
                    setDevBuildResult({
                        at: startedAt,
                        ok: false,
                        files: s?.files ?? 0,
                        insertions: s?.insertions ?? 0,
                        deletions: s?.deletions ?? 0,
                        lines: s?.lines ?? 0,
                        message: (res.error ?? "").split("\n")[0] || "unknown error",
                    })
                }
                toast.error(`${label} update failed${changed}: ${(res.error ?? "").split("\n")[0]}`)
                appendLines(["", stamp(`ERROR: ${res.error}`), stamp(target === "backend"
                    ? `Backend update: [${String(currentProgressRef.current).padStart(2, "0")}%] Failed${changed}`
                    : `Frontend update: [${String(currentFrontendProgressRef.current).padStart(2, "0")}%] Failed${changed}`)])
            }
        }
        catch (e: any) {
            if (target === "backend" && remote) pendingRef.current = false
            if (target === "frontend") {
                setDevBuildResult({
                    at: startedAt,
                    ok: false,
                    files: 0,
                    insertions: 0,
                    deletions: 0,
                    lines: 0,
                    message: e?.message ?? "unknown error",
                })
            }
            toast.error(`Update failed: ${e?.message ?? "unknown error"}`)
            appendLines(["", stamp(target === "backend"
                ? `Backend update: [${String(currentProgressRef.current).padStart(2, "0")}%] Failed - ${e?.message ?? "unknown error"}`
                : `Frontend update: [${String(currentFrontendProgressRef.current).padStart(2, "0")}%] Failed - ${e?.message ?? "unknown error"}`)])
        }
        finally {
            setRunning(null)
        }
    }

    // "Dev update": build the frontend from this machine's local source files instead of
    // downloading a release from GitHub. The same build runs on the Denshi side (live-update);
    // this only flags which updater owns the progress channel while it runs.
    const [, setDevUpdateActive] = useAtom(__devUpdateActiveAtom)
    async function runDevUpdate() {
        setDevUpdateActive(true)
        try {
            await run("frontend")
        }
        finally {
            setDevUpdateActive(false)
        }
    }

    const latest = readProgress(lines)
    const backendProgress = latest?.target === "backend"
        ? { percent: latest.percent, step: latest.step, failed: /fail(ed|ure)?|error/i.test(latest.step) }
        : null
    return (
        <div className="space-y-4">
            <ServerUpdateCard
                remote={remote || !liveUpdate}
                running={running === "backend"}
                checking={checking === "backend"}
                progress={running === "backend" || backendProgress?.failed || (backendProgress && backendProgress.percent < 100) ? backendProgress : null}
                errorText={errorText}
                onUpdate={() => run("backend")}
                onCheck={() => check("backend")}
            />
            {!remote && liveUpdate && (
                <p className="px-1 text-xs text-[--muted] break-all">
                    {detectedRoot
                        ? `Source repository: ${detectedOrigin ?? detectedRoot}`
                        : "No source repository was found for this backend."}
                </p>
            )}

            <FrontendUpdateCard />

            {liveUpdate && <DevUpdateCard
                running={running === "frontend"}
                checking={checking === "frontend"}
                lines={lines}
                repoRoot={detectedRoot}
                repoOrigin={detectedOrigin}
                checkResult={devCheckResult}
                buildResult={devBuildResult}
                onUpdate={runDevUpdate}
                onCheck={() => check("frontend")}
            />}

            {lines.length > 0 && (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                    <button
                        type="button"
                        onClick={() => setShowLog(v => !v)}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[--muted] hover:text-white"
                    >
                        <LuScrollText className="size-4" />
                        Details
                        <span className="text-xs font-normal opacity-70">— the full update log</span>
                        <LuChevronDown className={`ml-auto size-4 transition-transform ${showLog ? "rotate-180" : ""}`} />
                    </button>
                    {showLog && (
                        <div className="relative px-3 pb-3">
                            <Button
                                size="sm"
                                intent="gray-outline"
                                className="absolute right-5 top-2 z-10"
                                onClick={() => {
                                    navigator.clipboard.writeText(lines.join("\n")).then(
                                        () => toast.success("Log copied"),
                                        () => toast.error("Could not copy the log"),
                                    )
                                }}
                            >
                                Copy log
                            </Button>
                            <StructuredLog lines={lines} logRef={logRef} />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function DevUpdateCard({ running, checking, lines, repoRoot, repoOrigin, checkResult, buildResult, onUpdate, onCheck }: {
    running: boolean
    checking: boolean
    lines: string[]
    repoRoot: string | null
    repoOrigin: string | null
    checkResult: DevCheckResult | null
    buildResult: DevBuildResult | null
    onUpdate: () => void
    onCheck: () => void
}) {
    // Progress only shows while a dev update is actually running; the shared log also carries
    // the GitHub updater's frontend lines, which would otherwise light this card up too.
    const [devActive] = useAtom(__devUpdateActiveAtom)
    const [showAllFiles, setShowAllFiles] = React.useState(false)
    const progress = devActive ? readProgress(lines) : null
    const frontProgress = progress?.target === "frontend" ? progress : null
    const failed = !!frontProgress && /fail(ed|ure)?|error/i.test(frontProgress.step)
    const runningNow = running || (devActive && !!frontProgress)
    const state = runningNow
        ? "running"
        : checking
            ? "checking"
            : failed || buildResult?.ok === false || checkResult?.ok === false
                ? "failed"
                : checkResult?.ok
                    ? checkResult.files.length > 0 ? "changes" : "clean"
                    : "idle"
    const pill = state === "running"
        ? { label: "Building", className: "bg-brand-500/15 text-brand-200 ring-brand-400/30", icon: <LuLoaderCircle className="size-3 animate-spin" /> }
        : state === "checking"
            ? { label: "Checking", className: "bg-white/10 text-white/80 ring-white/15", icon: <LuLoaderCircle className="size-3 animate-spin" /> }
            : state === "failed"
                ? { label: "Issue detected", className: "bg-red-500/15 text-red-300 ring-red-400/30", icon: <LuCircleAlert className="size-3" /> }
                : state === "changes"
                    ? { label: "Local changes found", className: "bg-amber-400/15 text-amber-200 ring-amber-300/30", icon: <LuSparkles className="size-3" /> }
                    : state === "clean"
                        ? { label: "Ready", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30", icon: <LuCheck className="size-3" /> }
                        : { label: "Not scanned yet", className: "bg-white/10 text-white/60 ring-white/10", icon: null }
    const visibleFiles = showAllFiles ? (checkResult?.files ?? []) : (checkResult?.files ?? []).slice(0, 6)
    const sourceLabel = repoOrigin ?? repoRoot ?? "Not found"
    const progressPercent = frontProgress?.percent ?? 0
    const progressStep = frontProgress?.step || "Preparing the dev update…"
    const steps = [
        { at: 5, label: "Detect repo" },
        { at: 20, label: "Inspect changes" },
        { at: 55, label: "Build frontend" },
        { at: 80, label: "Swap in" },
        { at: 100, label: "Reload app" },
    ]

    return (
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 p-5 shadow-xl shadow-black/20 backdrop-blur-md sm:p-6">
            {(state === "changes" || state === "running") && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-emerald-400/15 blur-3xl" />}
            {state === "failed" && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-red-500/15 blur-3xl" />}

            <div className="flex flex-wrap items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/25 to-emerald-700/15 text-emerald-100 ring-1 ring-white/10">
                    <LuTerminal className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">Dev update</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${pill.className}`}>
                            {pill.icon}{pill.label}
                        </span>
                    </div>
                    <p className="mt-0.5 text-sm text-[--muted]">
                        Build the frontend on this machine from the local source files and swap it in live — no
                        GitHub, no release download. Picks up your working tree exactly as it is, uncommitted
                        changes included. The source repository is found once and remembered.
                    </p>
                </div>
            </div>

            <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[--muted]">Source</div>
                    <div className="mt-1 truncate text-xs font-medium" title={sourceLabel}>{sourceLabel}</div>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[--muted]">Last scan</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-medium"><LuClock3 className="size-3.5 opacity-70" />{timeAgo(checkResult?.at)}</div>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[--muted]">Changed files</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-medium"><LuFiles className="size-3.5 opacity-70" />{checkResult?.ok ? `${checkResult.files.length} (+${checkResult.insertions} -${checkResult.deletions})` : "—"}</div>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[--muted]">Last build</div>
                    <div className="mt-1 text-xs font-medium">{buildResult ? `${timeAgo(buildResult.at)} • ${buildResult.ok ? "Succeeded" : "Failed"}` : "never"}</div>
                </div>
            </div>

            {!!checkResult && (
                <div className={`mt-4 rounded-xl border px-3 py-2.5 text-xs ${checkResult.ok ? "border-white/[0.08] bg-white/[0.03] text-[--muted]" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>
                    {checkResult.summary}
                    {checkResult.ok && checkResult.baseline === false && (
                        <span className="block pt-1 text-[11px] text-amber-200/90">First build on this machine creates the baseline for future change checks.</span>
                    )}
                </div>
            )}

            {/* Progress */}
            {devActive && frontProgress && (
                <div className="relative mt-5 rounded-2xl bg-brand-500/[0.07] p-3.5 ring-1 ring-brand-400/20">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-brand-100">{progressStep}</span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-brand-100">{String(progressPercent).padStart(2, "0")}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                            className={`h-full rounded-full transition-[width] duration-1000 ${failed ? "bg-red-400" : progressPercent === 100 ? "bg-green-400" : "bg-gradient-to-r from-brand-400 to-cyan-300"}`}
                            style={{ width: `${Math.max(progressPercent, 3)}%` }}
                        />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                        {steps.map(s => (
                            <div key={s.label} className={`rounded-md border px-2 py-1 text-center text-[10px] ${progressPercent >= s.at ? "border-brand-300/50 bg-brand-400/10 text-brand-100" : "border-white/[0.08] bg-white/[0.03] text-[--muted]"}`}>
                                {s.label}
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-[11px] text-[--muted]">The app reloads by itself when the build is in place.</p>
                </div>
            )}
            {!devActive && !!buildResult && (
                <div className={`mt-5 rounded-2xl border p-3.5 ${buildResult.ok ? "border-emerald-400/25 bg-emerald-500/[0.08]" : "border-red-500/30 bg-red-500/10"}`}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                        <span className={`font-medium ${buildResult.ok ? "text-emerald-100" : "text-red-200"}`}>
                            {buildResult.ok ? "Last local build succeeded" : "Last local build failed"}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-white/80">{timeAgo(buildResult.at)}</span>
                    </div>
                    <p className="mt-2 text-xs text-[--muted]">
                        {buildResult.files} file{buildResult.files === 1 ? "" : "s"} changed • +{buildResult.insertions} / -{buildResult.deletions} • {buildResult.lines} lines
                    </p>
                    {!!buildResult.message && <p className="mt-1 text-[11px] text-[--muted]">{buildResult.message}</p>}
                </div>
            )}

            {!!checkResult?.ok && checkResult.files.length > 0 && (
                <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-medium text-white/90">Files that will be included in the next dev update</p>
                        {checkResult.files.length > 6 && (
                            <button
                                type="button"
                                className="text-[11px] text-brand-200 hover:text-brand-100"
                                onClick={() => setShowAllFiles(v => !v)}
                            >
                                {showAllFiles ? "Show less" : `Show all (${checkResult.files.length})`}
                            </button>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        {visibleFiles.map(f => (
                            <div key={f.path} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 px-2.5 py-1.5 text-[11px]">
                                <span className="min-w-0 flex-1 truncate font-mono text-white/85">{f.path}</span>
                                <span className="shrink-0 text-emerald-300">+{f.insertions}</span>
                                <span className="shrink-0 text-red-300">-{f.deletions}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="relative mt-5 flex flex-wrap gap-2">
                <Button
                    intent="primary"
                    loading={running}
                    disabled={checking || running}
                    leftIcon={<LuHammer className="size-4" />}
                    onClick={onUpdate}
                >
                    Build & install from local files
                </Button>
                <Button
                    intent="gray-subtle"
                    loading={checking}
                    disabled={checking || running}
                    leftIcon={<LuRefreshCw className="size-4" />}
                    onClick={onCheck}
                >
                    Check local changes
                </Button>
            </div>
        </section>
    )
}
