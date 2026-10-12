import { OverwriteChange, OverwritePreview, useCheckBackendUpdate, useOverwriteAnilist, useOverwriteAnilistPreview, useUpdateBackend } from "@/api/hooks/update-notice.hooks"
import { Modal } from "@/components/ui/modal"
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

const KIND_STYLE: Record<OverwriteChange["kind"], { label: string, badge: string }> = {
    add: { label: "Add", badge: "bg-green-500/15 text-green-300 border-green-500/30" },
    update: { label: "Update", badge: "bg-brand-500/15 text-brand-200 border-brand-500/30" },
    remove: { label: "Remove", badge: "bg-red-500/15 text-red-300 border-red-500/30" },
}

function StatBox({ label, value, className }: { label: string, value: number, className?: string }) {
    return (
        <div className="flex-1 rounded-lg border border-[--border] bg-[--subtle] px-3 py-2 text-center">
            <div className={`text-2xl font-bold ${className ?? ""}`}>{value}</div>
            <div className="text-xs text-[--muted] uppercase tracking-wide">{label}</div>
        </div>
    )
}

function AnilistOverwriteCard() {
    const { mutateAsync, isPending } = useOverwriteAnilist()
    const { mutateAsync: loadPreview, isPending: isPreviewing } = useOverwriteAnilistPreview()
    const [busy, setBusy] = React.useState(false)
    const [preview, setPreview] = React.useState<OverwritePreview | null>(null)

    useWebsocketMessageListener<{ ok: boolean, message: string }>({
        type: WSEvents.ANILIST_OVERWRITE_COMPLETED,
        onMessage: data => {
            setBusy(false)
            if (data.ok) toast.success(data.message)
            else toast.error(data.message)
        },
    })

    async function review() {
        try {
            setPreview((await loadPreview({})) ?? null)
        }
        catch {
            setPreview(null)
        }
    }

    async function apply() {
        try {
            await mutateAsync({})
            setBusy(true)
            setPreview(null)
            toast.info("Updating AniList with the changes...")
        }
        catch {
            setBusy(false)
        }
    }

    const total = preview ? preview.add + preview.update + preview.remove : 0

    return (
        <SettingsCard title="AniList">
            <p className="text-sm text-[--muted]">
                Makes AniList match your library. Only what differs is changed; you review the changes first.
            </p>
            <Button intent="alert-subtle" loading={isPreviewing || isPending || busy} disabled={isPreviewing || isPending || busy} onClick={review}>
                Overwrite AniList
            </Button>

            <Modal
                open={!!preview}
                onOpenChange={o => { if (!o) setPreview(null) }}
                title="Review AniList changes"
                contentClass="max-w-2xl"
                footer={preview && (
                    <div className="flex w-full justify-end gap-2">
                        <Button intent="gray-outline" onClick={() => setPreview(null)}>Cancel</Button>
                        <Button intent="alert" disabled={total === 0 || isPending} loading={isPending} onClick={apply}>
                            {total === 0 ? "Nothing to change" : `Apply ${total} change${total === 1 ? "" : "s"}`}
                        </Button>
                    </div>
                )}
            >
                {preview && (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <StatBox label="Add" value={preview.add} className="text-green-400" />
                            <StatBox label="Update" value={preview.update} className="text-brand-300" />
                            <StatBox label="Remove" value={preview.remove} className="text-red-400" />
                            <StatBox label="Already matching" value={preview.unchanged} />
                        </div>
                        {preview.remove > 0 && (
                            <p className="text-sm text-red-300">
                                {preview.remove} entries are on AniList but not in your library and will be deleted from AniList.
                            </p>
                        )}
                        {total === 0 ? (
                            <p className="text-center text-[--muted] py-6">AniList already matches your library.</p>
                        ) : (
                            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                                {preview.changes.map(c => (
                                    <div key={`${c.media}-${c.mediaId}`} className="rounded-lg border border-[--border] bg-[--subtle] p-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${KIND_STYLE[c.kind].badge}`}>
                                                {KIND_STYLE[c.kind].label}
                                            </span>
                                            <span className="text-[10px] uppercase text-[--muted]">{c.media}</span>
                                            <span className="font-medium truncate">{c.title || `#${c.mediaId}`}</span>
                                        </div>
                                        <ul className="mt-1.5 space-y-0.5 text-sm text-[--muted]">
                                            {c.fields.map(f => <li key={f}>{f}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Modal>
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
    const { mutateAsync: checkRemoteBackend } = useCheckBackendUpdate()
    const [checking, setChecking] = React.useState<Target | null>(null)

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

    async function check(target: Target) {
        setChecking(target)
        setLines([])
        const label = target === "backend" ? "Backend" : "Frontend"
        try {
            let files: { path: string, insertions: number, deletions: number }[] = []
            let summary: string
            if (target === "backend" && remote) {
                const res = await checkRemoteBackend({})
                files = res?.files ?? []
                if (res?.behind && res.blocked) summary = `Update available. Note: ${res.blocked}`
                else summary = res?.behind ? "Update available" : "Up to date"
            } else {
                const res = target === "backend" ? await liveUpdate!.checkBackend() : await liveUpdate!.checkFrontend()
                if (!res.ok) throw new Error(res.error ?? "check failed")
                files = res.files ?? []
                if (target === "backend") summary = res.behind ? `Update available (${res.behind} new commit${res.behind === 1 ? "" : "s"})` : "Up to date"
                else if (!res.baseline) summary = "No previous build recorded yet. The next build becomes the baseline"
                else summary = files.length ? "Changes since the last build" : "No changes since the last build"
            }
            const ins = files.reduce((n, f) => n + f.insertions, 0)
            const del = files.reduce((n, f) => n + f.deletions, 0)
            setLines([
                stamp(`${label}: ${summary}`),
                ...(files.length ? [stamp(`${files.length} file${files.length === 1 ? "" : "s"} (+${ins} -${del}):`), ...files.map(f => `    ${f.path}  +${f.insertions} -${f.deletions}`)] : []),
            ])
        }
        catch (e: any) {
            toast.error(`${label} check failed: ${e?.message ?? "unknown error"}`)
            setLines([stamp(`${label} check: Failed - ${e?.message ?? "unknown error"}`)])
        }
        finally {
            setChecking(null)
        }
    }

    async function run(target: Target) {
        if (target === "backend" && remote) {
            setRunning(target)
            try {
                const res = await updateRemoteBackend({})
                const msg = res?.message ?? "Update requested."
                toast.success(msg)
                pendingRef.current = !!res?.started
                wasDownRef.current = false
                const files = res?.files ?? []
                const fileLines = files.length
                    ? [
                        stamp(`${files.length} file${files.length === 1 ? "" : "s"} changing (+${files.reduce((n, f) => n + f.insertions, 0)} -${files.reduce(
                            (n, f) => n + f.deletions, 0)}):`),
                        ...files.map(f => `    ${f.path}  +${f.insertions} -${f.deletions}`),
                    ]
                    : []
                setLines(res?.started
                    ? [stamp(msg), ...fileLines, stamp("Backend update: In progress...")]
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
                    Builds the desktop frontend from the local files on this machine (no repository involved) and swaps it in live. The window reloads when it is done.
                </p>
                <div className="flex gap-2">
                    <Button
                        intent="primary"
                        loading={running === "frontend"}
                        disabled={running !== null || checking !== null}
                        onClick={() => run("frontend")}
                    >
                        Update frontend
                    </Button>
                    <Button
                        intent="gray-outline"
                        loading={checking === "frontend"}
                        disabled={running !== null || checking !== null}
                        onClick={() => check("frontend")}
                    >
                        Check for updates
                    </Button>
                </div>
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
