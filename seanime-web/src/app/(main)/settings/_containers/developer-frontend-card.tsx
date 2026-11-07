"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuCircleAlert, LuCode, LuCopy, LuEye, LuFolderGit2, LuHammer, LuLoaderCircle, LuPlay, LuRadio, LuSquare, LuTerminal } from "react-icons/lu"
import { toast } from "sonner"

// Developer Frontend: Denshi runs a watch build of the local seanime-web sources and serves it in
// place of the installed frontend, reloading the windows after every rebuild. Stopping it returns
// to the installed frontend.

const STATE: Record<DevFrontendStatus["state"], { label: string, pill: string, dot: string }> = {
    stopped: { label: "Off", pill: "bg-white/[0.06] text-white/60 ring-white/10", dot: "bg-white/40" },
    starting: { label: "Starting (first build)...", pill: "bg-amber-400/10 text-amber-200 ring-amber-300/25", dot: "bg-amber-400 animate-pulse" },
    building: { label: "Rebuilding...", pill: "bg-sky-400/10 text-sky-200 ring-sky-300/25", dot: "bg-sky-400 animate-pulse" },
    ready: { label: "Live", pill: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/25", dot: "bg-emerald-400 animate-pulse" },
    error: { label: "Error", pill: "bg-red-400/10 text-red-200 ring-red-300/25", dot: "bg-red-400" },
}

export function DeveloperFrontendCard() {
    const devFrontend = window.electron?.devFrontend
    const [status, setStatus] = React.useState<DevFrontendStatus | null>(null)
    const [busy, setBusy] = React.useState(false)
    const logRef = React.useRef<HTMLDivElement>(null)

    // Keeps "2 min ago" true while the card is open.
    const [, tick] = React.useReducer((n: number) => n + 1, 0)
    React.useEffect(() => {
        const id = window.setInterval(tick, 30_000)
        return () => window.clearInterval(id)
    }, [])

    React.useEffect(() => {
        void devFrontend?.getStatus().then(setStatus)
        const off = window.electron?.on("dev-frontend:event", (p: { status?: DevFrontendStatus, line?: string }) => {
            if (p.status) setStatus(p.status)
            else if (p.line) setStatus(prev => prev ? { ...prev, tail: [...prev.tail, p.line!].slice(-60) } : prev)
        })
        return () => off?.()
    }, [])

    React.useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
    }, [status?.tail.length])

    if (!devFrontend) return null

    const running = !!status?.running
    const state = status ? STATE[status.state] : null

    async function toggle() {
        setBusy(true)
        try {
            const res = running ? await devFrontend!.stop() : await devFrontend!.start()
            if (!res.ok) toast.error((res as { error?: string }).error ?? "Could not change the Developer Frontend")
            if (res.status) setStatus(res.status)
        } finally {
            setBusy(false)
        }
    }

    // Watch → build → live, lit up to wherever the watcher is.
    const stage = !status || !running ? -1 : status.state === "starting" ? 1 : status.state === "building" ? 1 : status.state === "ready" ? 2 : status.state === "error" ? 1 : 0
    const steps = [
        { icon: <LuEye />, label: "Watch", sub: "seanime-web sources" },
        { icon: <LuHammer />, label: "Build", sub: status?.state === "starting" ? "First build" : "On every save" },
        { icon: <LuRadio />, label: "Live", sub: "Windows reload" },
    ]

    return (
        <section
            className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 p-5 shadow-xl shadow-black/20 backdrop-blur-md sm:p-6"
            data-developer-frontend-card
        >
            {status?.state === "ready" && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-emerald-400/10 blur-3xl" />}
            {(status?.state === "starting" || status?.state === "building") && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-sky-400/10 blur-3xl" />}
            {status?.state === "error" && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-red-400/10 blur-3xl" />}

            <div className="relative flex flex-wrap items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400/30 to-brand-700/20 text-violet-100 ring-1 ring-white/10">
                    <LuCode className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                        <h3 className="text-lg font-semibold">Developer Frontend</h3>
                        {state && (
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", state.pill)}>
                                <span className={cn("size-1.5 rounded-full", state.dot)} />{state.label}
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 text-sm text-[--muted]">
                        Watches your local seanime-web files and swaps the running frontend after every change. No release build needed.
                    </p>
                </div>
                <Button
                    size="md"
                    intent={running ? "alert-subtle" : "primary"}
                    rounded
                    onClick={toggle}
                    disabled={busy}
                    leftIcon={busy ? <LuLoaderCircle className="animate-spin" /> : running ? <LuSquare /> : <LuPlay />}
                >
                    {running ? "Stop" : "Start"}
                </Button>
            </div>

            {/* Pipeline */}
            <ol className="relative mt-5 grid grid-cols-3 gap-2">
                {steps.map((step, i) => {
                    const done = stage > i
                    const active = stage === i
                    const failed = active && status?.state === "error"
                    return (
                        <li
                            key={step.label}
                            className={cn(
                                "relative flex items-center gap-2.5 rounded-2xl p-3 ring-1 transition-colors",
                                failed ? "bg-red-400/[0.08] ring-red-300/25"
                                    : active ? "bg-white/[0.07] ring-white/20"
                                        : done ? "bg-emerald-400/[0.06] ring-emerald-300/15"
                                            : "bg-black/20 ring-white/[0.06]",
                            )}
                        >
                            <span className={cn(
                                "flex size-8 flex-none items-center justify-center rounded-xl [&>svg]:size-4",
                                failed ? "bg-red-400/15 text-red-200" : active ? "bg-white/15 text-white" : done ? "bg-emerald-400/15 text-emerald-200" : "bg-white/[0.05] text-white/35",
                            )}>
                                {active && (status?.state === "starting" || status?.state === "building") ? <LuLoaderCircle className="animate-spin" /> : step.icon}
                            </span>
                            <span className="min-w-0">
                                <span className={cn("block text-sm font-semibold", stage < i ? "text-white/45" : "text-white")}>{step.label}</span>
                                <span className="block truncate text-[11px] text-white/40">{step.sub}</span>
                            </span>
                        </li>
                    )
                })}
            </ol>

            {/* Facts */}
            <div className="relative mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Fact label="Builds applied" value={running && status ? String(status.builds) : "—"} />
                <Fact
                    label="Last build"
                    value={status?.lastBuildAt ? new Date(status.lastBuildAt).toLocaleTimeString() : "—"}
                    sub={status?.lastBuildAt ? ago(status.lastBuildAt) : undefined}
                />
                <Fact
                    label="Sources"
                    icon={<LuFolderGit2 />}
                    value={status?.root ? status.root.split(/[\\/]/).filter(Boolean).slice(-2).join("/") : "—"}
                    title={status?.root ?? undefined}
                    className="col-span-2 sm:col-span-1"
                />
            </div>

            {running && status && (
                <p className="relative mt-3 text-xs text-[--muted]">
                    {status.builds > 0
                        ? `${status.builds} build(s) applied${status.lastBuildAt ? `, last at ${new Date(status.lastBuildAt).toLocaleTimeString()}` : ""}.`
                        : "Waiting for the first build; the installed frontend stays active until it finishes."}
                </p>
            )}

            {status?.state === "error" && status.lastError && (
                <div className="relative mt-3 flex gap-2.5 rounded-2xl bg-red-500/[0.08] p-3 ring-1 ring-red-400/25">
                    <LuCircleAlert className="mt-0.5 size-4 flex-none text-red-300" />
                    <p className="min-w-0 text-xs text-red-200 break-all">{status.lastError}</p>
                </div>
            )}

            {status && status.tail.length > 0 && (
                <div className="relative mt-4 overflow-hidden rounded-2xl bg-black/50 ring-1 ring-white/[0.08]">
                    <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
                        <span className="flex gap-1" aria-hidden>
                            <span className="size-2 rounded-full bg-red-400/60" />
                            <span className="size-2 rounded-full bg-amber-400/60" />
                            <span className="size-2 rounded-full bg-emerald-400/60" />
                        </span>
                        <LuTerminal className="ml-1 size-3.5 text-white/40" />
                        <span className="text-[11px] font-semibold text-white/55">Build output</span>
                        <span className="text-[11px] tabular-nums text-white/30">{status.tail.length} lines</span>
                        <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(status.tail.join("\n")).then(
                                () => toast.success("Log copied"),
                                () => toast.error("Could not copy the log"),
                            )}
                            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-white/50 transition hover:bg-white/10 hover:text-white"
                        >
                            <LuCopy className="size-3" />Copy
                        </button>
                    </div>
                    <div ref={logRef} className="max-h-48 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
                        {status.tail.map((line, i) => <div key={i} className={cn("whitespace-pre-wrap break-all", lineTone(line))}>{line}</div>)}
                    </div>
                </div>
            )}
        </section>
    )
}

function Fact({ label, value, sub, icon, title, className }: { label: string, value: string, sub?: string, icon?: React.ReactNode, title?: string, className?: string }) {
    return (
        <div className={cn("min-w-0 rounded-2xl bg-black/25 p-3 ring-1 ring-white/[0.06]", className)} title={title}>
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/45 [&>svg]:size-3">{icon}{label}</p>
            <p className="mt-1 truncate text-sm font-semibold tabular-nums text-white">{value}</p>
            {sub && <p className="truncate text-[11px] text-white/40">{sub}</p>}
        </div>
    )
}

/** Colours a build line by what it says, the way a terminal would. */
function lineTone(line: string) {
    if (/\b(error|failed|fatal)\b/i.test(line)) return "text-red-300"
    if (/\bwarn(ing)?\b/i.test(line)) return "text-amber-200"
    if (/\b(ready|built|compiled|success|done)\b/i.test(line)) return "text-emerald-300"
    return "text-white/55"
}

function ago(date: string) {
    const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000)
    if (!Number.isFinite(seconds)) return undefined
    if (seconds < 60) return "just now"
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
    return `${Math.floor(seconds / 3600)} h ago`
}
