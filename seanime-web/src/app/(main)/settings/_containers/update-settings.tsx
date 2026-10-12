import { useUpdateBackend } from "@/api/hooks/update-notice.hooks"
import { SettingsCard } from "@/app/(main)/settings/_components/settings-card"
import { Button } from "@/components/ui/button"
import React from "react"
import { toast } from "sonner"

type Target = "backend" | "frontend"

export function UpdateSettings() {
    const [detectedRoot, setDetectedRoot] = React.useState<string | null>(null)
    const [detectedOrigin, setDetectedOrigin] = React.useState<string | null>(null)
    const [running, setRunning] = React.useState<Target | null>(null)
    const [lines, setLines] = React.useState<string[]>([])
    const logRef = React.useRef<HTMLPreElement>(null)

    const [remote, setRemote] = React.useState(false)
    const { mutateAsync: updateRemoteBackend } = useUpdateBackend()

    const liveUpdate = window.electron?.liveUpdate

    const refreshInfo = React.useCallback(() => {
        window.electron?.liveUpdate?.getInfo().then(info => {
            setDetectedRoot(info.repoRoot)
            setDetectedOrigin(info.repoOrigin ?? null)
            setRemote(!!info.remote)
        })
    }, [])

    React.useEffect(() => {
        refreshInfo()
        const off = window.electron?.on("live-update:progress", (p: { target: Target, line: string }) => {
            setLines(prev => [...prev.slice(-199), p.line])
        })
        return () => off?.()
    }, [refreshInfo])

    React.useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
    }, [lines])

    if (!liveUpdate) return null

    async function run(target: Target) {
        if (target === "backend" && remote) {
            setRunning(target)
            try {
                const res = await updateRemoteBackend({})
                const msg = res?.message ?? "Update requested."
                toast.success(msg)
                setLines([msg])
            }
            catch (e: any) {
                toast.error(`Backend update failed: ${e?.message ?? "unknown error"}`)
            }
            finally {
                setRunning(null)
            }
            return
        }
        setRunning(target)
        setLines([])
        try {
            const res = target === "backend" ? await liveUpdate!.updateBackend() : await liveUpdate!.updateFrontend()
            const label = target === "backend" ? "Backend" : "Frontend"
            const s = res.stats
            const changed = s && s.lines > 0
                ? ` (${s.files} file${s.files === 1 ? "" : "s"}, +${s.insertions}/-${s.deletions} = ${s.lines} lines changed)`
                : " (0 lines changed)"
            if (res.ok) {
                toast.success(`${label} update succeeded${changed}. ${res.message ?? ""}`.trim())
            } else {
                toast.error(`${label} update failed${changed}: ${(res.error ?? "").split("\n")[0]}`)
                setLines(prev => [...prev, "", `ERROR: ${res.error}`])
            }
        }
        catch (e: any) {
            toast.error(`Update failed: ${e?.message ?? "unknown error"}`)
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
                <Button
                    intent="primary"
                    loading={running === "backend"}
                    disabled={running !== null}
                    onClick={() => run("backend")}
                >
                    Update backend
                </Button>
            </SettingsCard>

            <SettingsCard title="Frontend">
                <p className="text-sm text-[--muted]">
                    Builds the desktop frontend from the local files on this machine (no repository involved) and swaps it in live. The window reloads when it is done.
                </p>
                <Button
                    intent="primary"
                    loading={running === "frontend"}
                    disabled={running !== null}
                    onClick={() => run("frontend")}
                >
                    Update frontend
                </Button>
            </SettingsCard>

            {lines.length > 0 && (
                <pre
                    ref={logRef}
                    className="max-h-64 overflow-auto rounded-lg border bg-gray-950 p-3 text-xs text-gray-300 whitespace-pre-wrap"
                >
                    {lines.join("\n")}
                </pre>
            )}
        </div>
    )
}
