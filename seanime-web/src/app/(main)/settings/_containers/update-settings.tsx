import { useOverwriteAnilist, useUpdateBackend } from "@/api/hooks/update-notice.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { SettingsCard } from "@/app/(main)/settings/_components/settings-card"
import { Button } from "@/components/ui/button"
import { websocketConnectedAtom } from "@/app/websocket-provider"
import { useAtomValue } from "jotai"
import React from "react"
import { toast } from "sonner"

type Target = "backend" | "frontend"

// Prefixes a log line with the time it was received; blank spacer lines are left alone.
function stamp(line: string) {
    return line === "" ? line : `[${new Date().toLocaleTimeString([], { hour12: false })}] ${line}`
}

function AnilistOverwriteCard() {
    const { mutateAsync, isPending } = useOverwriteAnilist()
    const [busy, setBusy] = React.useState(false)

    useWebsocketMessageListener<{ ok: boolean, message: string }>({
        type: WSEvents.ANILIST_OVERWRITE_COMPLETED,
        onMessage: data => {
            setBusy(false)
            if (data.ok) toast.success(data.message)
            else toast.error(data.message)
        },
    })

    async function start() {
        if (!window.confirm("This overwrites your AniList lists so they match this library exactly: statuses, scores, progress and dates. Entries that are on AniList but not in the library will be deleted. Continue?")) return
        try {
            await mutateAsync({})
            setBusy(true)
            toast.info("Overwriting AniList with your library...")
        }
        catch {
            setBusy(false)
        }
    }

    return (
        <SettingsCard title="AniList">
            <p className="text-sm text-[--muted]">
                Overwrites AniList with exactly what is in your library: every status, score, progress and date. Entries not in your library are removed from AniList.
            </p>
            <Button intent="alert-subtle" loading={isPending || busy} disabled={isPending || busy} onClick={start}>
                Overwrite AniList
            </Button>
        </SettingsCard>
    )
}

export function UpdateSettings() {
    return (
        <div className="space-y-4">
            <AnilistOverwriteCard />
            {!!window.electron?.liveUpdate && <ElectronUpdates />}
        </div>
    )
}

function ElectronUpdates() {
    const [detectedRoot, setDetectedRoot] = React.useState<string | null>(null)
    const [detectedOrigin, setDetectedOrigin] = React.useState<string | null>(null)
    const [running, setRunning] = React.useState<Target | null>(null)
    const [lines, setLines] = React.useState<string[]>([])
    const logRef = React.useRef<HTMLPreElement>(null)

    const [remote, setRemote] = React.useState(false)
    const { mutateAsync: updateRemoteBackend } = useUpdateBackend()

    // The server writes the update notice right before it swaps to the new binary, so this is the
    // point where a remote backend update is known to have succeeded.
    const pendingRef = React.useRef(false)
    const wasDownRef = React.useRef(false)
    const isConnected = useAtomValue(websocketConnectedAtom)

    const markSucceeded = React.useCallback((text: string) => {
        if (!pendingRef.current) return
        pendingRef.current = false
        setLines(prev => [...prev, "", stamp(`Backend update: Succeeded (${text})`)])
    }, [])

    useWebsocketMessageListener({
        type: WSEvents.UPDATE_NOTICE_AVAILABLE,
        onMessage: () => markSucceeded("restarting on the new version"),
    })

    // The server restarts into the new binary, which drops the websocket. Coming back means the new
    // version is up, even if the notice event was missed while disconnecting.
    React.useEffect(() => {
        if (!pendingRef.current) return
        if (!isConnected) {
            wasDownRef.current = true
        } else if (wasDownRef.current) {
            wasDownRef.current = false
            markSucceeded("now running the new version")
        }
    }, [isConnected, markSucceeded])

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
            setLines(prev => [...prev.slice(-199), stamp(p.line)])
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
                pendingRef.current = !!res?.started
                wasDownRef.current = false
                setLines(res?.started
                    ? [stamp(msg), stamp("Backend update: In progress...")]
                    : [stamp(msg), stamp("Backend update: Succeeded (already up to date)")])
            }
            catch (e: any) {
                pendingRef.current = false
                toast.error(`Backend update failed: ${e?.message ?? "unknown error"}`)
                setLines([stamp(`Backend update: Failed - ${e?.message ?? "unknown error"}`)])
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
                setLines(prev => [...prev, "", stamp(`${label} update: Succeeded${changed}`)])
            } else {
                toast.error(`${label} update failed${changed}: ${(res.error ?? "").split("\n")[0]}`)
                setLines(prev => [...prev, "", stamp(`ERROR: ${res.error}`), stamp(`${label} update: Failed${changed}`)])
            }
        }
        catch (e: any) {
            toast.error(`Update failed: ${e?.message ?? "unknown error"}`)
            setLines(prev => [...prev, "", stamp(`Update: Failed - ${e?.message ?? "unknown error"}`)])
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
