import { useCheckBackendUpdate, useUpdateBackend } from "@/api/hooks/update-notice.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { SettingsCard } from "@/app/(main)/settings/_components/settings-card"
import { Button } from "@/components/ui/button"
import { websocketConnectedAtom } from "@/app/websocket-provider"
import { useAtom, useAtomValue } from "jotai"
import { atomWithStorage } from "jotai/utils"
import React from "react"
import { toast } from "sonner"

type Target = "backend" | "frontend"

const UPDATE_LOG_STORAGE_KEY = "sea-settings-update-log"
export const MAX_LOG_LINES = 500
export const updateSettingsLogAtom = atomWithStorage<string[]>(UPDATE_LOG_STORAGE_KEY, [], undefined, { getOnInit: true })

// Prefixes a log line with the time it was received; blank spacer lines are left alone.
export function stamp(line: string) {
    return line === "" ? line : `[${new Date().toLocaleTimeString([], { hour12: false })}] ${line}`
}

function readProgress(lines: string[]) {
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
            appendLines([stamp(p.line)])
        })
        return () => off?.()
    }, [appendLines, refreshInfo])

    React.useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
    }, [lines])

    async function check(target: Target) {
        setChecking(target)
        const label = target === "backend" ? "Backend" : "Frontend"
        try {
            let files: { path: string, insertions: number, deletions: number }[] = []
            let summary: string
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
                else if (!res.baseline) summary = "No previous build recorded yet. The next build becomes the baseline"
                else summary = files.length ? "Changes since the last build" : "No changes since the last build"
            }
            const ins = files.reduce((n, f) => n + f.insertions, 0)
            const del = files.reduce((n, f) => n + f.deletions, 0)
            appendLines([
                "",
                stamp(`${label}: ${summary}`),
                ...(files.length ? [stamp(`${files.length} file${files.length === 1 ? "" : "s"} (+${ins} -${del}):`), ...files.map(f => `    ${f.path}  +${f.insertions} -${f.deletions}`)] : []),
            ])
        }
        catch (e: any) {
            toast.error(`${label} check failed: ${e?.message ?? "unknown error"}`)
            appendLines(["", stamp(`${label} check: Failed - ${e?.message ?? "unknown error"}`)])
        }
        finally {
            setChecking(null)
        }
    }

    async function run(target: Target) {
        const label = target === "backend" ? "Backend" : "Frontend"
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
                toast.error(`Backend update failed: ${e?.message ?? "unknown error"}`)
                appendLines(["", stamp(`Backend update: [${String(currentProgressRef.current).padStart(2, "0")}%] Failed - ${e?.message ?? "unknown error"}`)])
            }
            finally {
                setRunning(null)
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
                appendLines(["", stamp(target === "backend"
                    ? `Backend update: [100%] Succeeded${changed}`
                    : `Frontend update: [100%] Succeeded${changed}`)])
            } else {
                toast.error(`${label} update failed${changed}: ${(res.error ?? "").split("\n")[0]}`)
                appendLines(["", stamp(`ERROR: ${res.error}`), stamp(target === "backend"
                    ? `Backend update: [${String(currentProgressRef.current).padStart(2, "0")}%] Failed${changed}`
                    : `Frontend update: [${String(currentFrontendProgressRef.current).padStart(2, "0")}%] Failed${changed}`)])
            }
        }
        catch (e: any) {
            if (target === "backend" && remote) pendingRef.current = false
            toast.error(`Update failed: ${e?.message ?? "unknown error"}`)
            appendLines(["", stamp(target === "backend"
                ? `Backend update: [${String(currentProgressRef.current).padStart(2, "0")}%] Failed - ${e?.message ?? "unknown error"}`
                : `Frontend update: [${String(currentFrontendProgressRef.current).padStart(2, "0")}%] Failed - ${e?.message ?? "unknown error"}`)])
        }
        finally {
            setRunning(null)
        }
    }

    return (
        <div className="space-y-4">
            <SettingsCard title="Backend">
                <p className="text-sm text-[--muted]">
                    {remote
                        ? "Asks the remote server to pull the latest commit from its own repository (origin, the seaserver repo it was checked out from), build it, and restart. The server keeps running the old version if the build fails."
                        : "Pulls the latest changes, builds the server, and only if the build succeeds swaps in the new binary and restarts the backend. If the new backend fails to start, the previous one is restored."}
                </p>
                {!remote && (
                    <p className="text-xs text-[--muted] break-all">
                        {detectedRoot
                            ? `Source repository: ${detectedOrigin ?? detectedRoot}`
                            : "No source repository was found for this backend."}
                    </p>
                )}
                <div className="flex gap-2">
                    <Button
                        intent="primary"
                        loading={running === "backend"}
                        disabled={running !== null || checking !== null}
                        onClick={() => run("backend")}
                    >
                        Update backend
                    </Button>
                    <Button
                        intent="gray-outline"
                        loading={checking === "backend"}
                        disabled={running !== null || checking !== null}
                        onClick={() => check("backend")}
                    >
                        Check for updates
                    </Button>
                </div>
            </SettingsCard>

            <SettingsCard title="Frontend">
                <p className="text-sm text-[--muted]">
                    {liveUpdate
                        ? "Builds the frontend from the local files on this machine and swaps it in live. The window reloads when it is done."
                        : "Frontend live updates are available in the Denshi desktop app. The backend update controls above work from this page."}
                </p>
                <div className="flex gap-2">
                    <Button
                        intent="primary"
                        loading={running === "frontend"}
                        disabled={!liveUpdate || running !== null || checking !== null}
                        onClick={() => run("frontend")}
                    >
                        Update frontend
                    </Button>
                    <Button
                        intent="gray-outline"
                        loading={checking === "frontend"}
                        disabled={!liveUpdate || running !== null || checking !== null}
                        onClick={() => check("frontend")}
                    >
                        Check for updates
                    </Button>
                </div>
            </SettingsCard>

            {lines.length > 0 && (
                <div className="relative">
                    <Button
                        size="sm"
                        intent="gray-outline"
                        className="absolute right-2 top-2 z-10"
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
    )
}
