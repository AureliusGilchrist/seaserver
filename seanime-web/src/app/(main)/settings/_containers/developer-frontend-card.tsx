"use client"

import { Button } from "@/components/ui/button"
import React from "react"
import { LuCode, LuLoaderCircle, LuPlay, LuSquare } from "react-icons/lu"
import { toast } from "sonner"

// Developer Frontend: Denshi runs a watch build of the local seanime-web sources and serves it in
// place of the installed frontend, reloading the windows after every rebuild. Stopping it returns
// to the installed frontend.

const STATE_LABEL: Record<DevFrontendStatus["state"], string> = {
    stopped: "Off",
    starting: "Starting (first build)...",
    building: "Rebuilding...",
    ready: "Live",
    error: "Error",
}

export function DeveloperFrontendCard() {
    const devFrontend = window.electron?.devFrontend
    const [status, setStatus] = React.useState<DevFrontendStatus | null>(null)
    const [busy, setBusy] = React.useState(false)
    const logRef = React.useRef<HTMLDivElement>(null)

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

    return (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center gap-3">
                <LuCode className="size-5 text-[--muted]" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Developer Frontend</p>
                    <p className="text-xs text-[--muted]">
                        Watches your local seanime-web files and swaps the running frontend after every change. No release build needed.
                    </p>
                </div>
                <span className="text-xs text-[--muted]">{status ? STATE_LABEL[status.state] : ""}</span>
                <Button
                    size="sm"
                    intent={running ? "alert-subtle" : "primary-subtle"}
                    onClick={toggle}
                    disabled={busy}
                    leftIcon={busy ? <LuLoaderCircle className="animate-spin" /> : running ? <LuSquare /> : <LuPlay />}
                >
                    {running ? "Stop" : "Start"}
                </Button>
            </div>
            {status?.state === "error" && status.lastError && (
                <p className="text-xs text-red-400 break-all">{status.lastError}</p>
            )}
            {running && status && (
                <p className="text-xs text-[--muted]">
                    {status.builds > 0
                        ? `${status.builds} build(s) applied${status.lastBuildAt ? `, last at ${new Date(status.lastBuildAt).toLocaleTimeString()}` : ""}.`
                        : "Waiting for the first build; the installed frontend stays active until it finishes."}
                </p>
            )}
            {status && status.tail.length > 0 && (
                <div ref={logRef} className="max-h-40 overflow-auto rounded-lg bg-black/30 p-2 font-mono text-[11px] leading-snug text-[--muted]">
                    {status.tail.map((line, i) => <div key={i} className="whitespace-pre-wrap break-all">{line}</div>)}
                </div>
            )}
        </div>
    )
}
