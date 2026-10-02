import { getServerBaseUrl } from "@/api/client/server-url"
import { serverAuthTokenAtom, serverConnectionModeAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { isUpdateInstalledAtom, isUpdatingAtom } from "@/app/(main)/_electron/electron-update-modal"
import { websocketConnectedAtom, websocketConnectionErrorCountAtom } from "@/app/websocket-provider"
import { LuffyError } from "@/components/shared/luffy-error"
import { Button } from "@/components/ui/button"
import { LoadingOverlay } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { useAtom, useAtomValue } from "jotai/react"
import React from "react"
import { toast } from "sonner"

export function ElectronRestartServerPrompt() {

    // Hard guard: never run on the splashscreen window.
    // The setup flow lives there; firing `restart-server` from the splash will crash the boot.
    if (typeof window !== "undefined"
        && (/(^|\/)splashscreen(\/|$)/.test(window.location.pathname)
            || /(^|\/)splashscreen(\/|$)/.test(window.location.hash))) {
        return null
    }

    const [hasRendered, setHasRendered] = React.useState(false)

    const [isConnected, setIsConnected] = useAtom(websocketConnectedAtom)
    const connectionErrorCount = useAtomValue(websocketConnectionErrorCountAtom)
    const [hasClickedRestarted, setHasClickedRestarted] = React.useState(false)
    const isUpdatedInstalled = useAtomValue(isUpdateInstalledAtom)
    const isUpdating = useAtomValue(isUpdatingAtom)
    const connectionMode = useAtomValue(serverConnectionModeAtom)

    // Check if the server requires a password (no router dependency)
    const [serverHasPassword, setServerHasPassword] = React.useState(false)
    const serverAuthToken = useAtomValue(serverAuthTokenAtom)

    React.useEffect(() => {
        let cancelled = false
        const checkStatus = async () => {
            try {
                const res = await fetch(`${getServerBaseUrl()}/api/v1/status`)
                if (res.ok) {
                    const json = await res.json() as any
                    if (!cancelled) {
                        setServerHasPassword(!!json?.data?.serverHasPassword)
                    }
                }
            }
            catch {
                // Server unreachable, leave as false
            }
        }
        checkStatus()
        return () => { cancelled = true }
    }, [])

    const threshold = 8

    React.useEffect(() => {
        (async () => {
            if (window.electron) {
                // await window.electron.window.getCurrentWindow() // TODO: Isn't called
                setHasRendered(true)
            }
        })()
    }, [])

    const handleRestart = async () => {
        if (import.meta.env.MODE === "development") return toast.warning("Dev mode: Not restarting server")

        // Remote mode (the server lives on another machine — a NAS, a home server): there is no
        // local server process to restart, and asking the shell to start one spawns a sidecar
        // that cannot serve this client's config. It exits immediately and takes the app down
        // with it, which is the blank window users saw. Reload instead and let the client
        // reconnect on its own — the same thing the Tauri build does here.
        if (connectionMode === "remote") {
            toast.info("Reconnecting...")
            window.location.reload()
            return
        }

        setHasClickedRestarted(true)
        toast.info("Restarting server...")
        if (window.electron) {
            window.electron.emit("restart-server")
            React.startTransition(() => {
                setTimeout(() => {
                    setHasClickedRestarted(false)
                }, 5000)
            })
        }
    }

    // Server is reachable but user hasn't logged in yet
    const isUnauthenticated = (serverHasPassword && !serverAuthToken) || import.meta.env.MODE === "development"

    // Try to reconnect automatically
    const tryAutoReconnectRef = React.useRef(true)
    React.useEffect(() => {
        // Remote mode: never restart or reload on our own. There is no local process to kick,
        // and reloading the whole app over a connection blip turns one hiccup into a loop of
        // full boots — the websocket already retries with backoff, so let it.
        if (connectionMode === "remote") return
        if (!isConnected && connectionErrorCount >= threshold && tryAutoReconnectRef.current && !isUpdatedInstalled && !isUnauthenticated) {
            tryAutoReconnectRef.current = false
            console.log("Connection error count reached 10, restarting server automatically")
            handleRestart()
        }
    }, [connectionErrorCount, isUnauthenticated, connectionMode])

    React.useEffect(() => {
        if (isConnected) {
            setHasClickedRestarted(false)
            tryAutoReconnectRef.current = true
        }
    }, [isConnected])

    if (!hasRendered || isUnauthenticated) return null

    // Not connected for 10 seconds
    return (
        <>
            {(!isConnected && connectionErrorCount > 2 && connectionErrorCount < threshold && !isUpdating && !isUpdatedInstalled) && (
                <LoadingOverlay className="fixed left-0 top-0 z-[9999]">
                    <p>
                        The server connection has been lost. Please wait while we attempt to reconnect.
                    </p>
                </LoadingOverlay>
            )}

            <Modal
                open={!isConnected && connectionErrorCount >= threshold && !isUpdatedInstalled}
                onOpenChange={() => {}}
                hideCloseButton
                contentClass="max-w-2xl"
            >
                <LuffyError>
                    <div className="space-y-4 flex flex-col items-center">
                        <p className="text-lg max-w-sm">
                            {connectionMode === "remote"
                                ? "The server is not responding. Please check that it is running, then reconnect."
                                : "The background server process has stopped responding. Please restart it to continue."}
                        </p>

                        <Button
                            onClick={handleRestart}
                            loading={hasClickedRestarted}
                            intent="white-outline"
                            size="lg"
                            className="rounded-full"
                        >
                            {connectionMode === "remote" ? "Reconnect" : "Restart server"}
                        </Button>
                        <p className="text-[--muted] text-sm max-w-xl">
                            {connectionMode === "remote"
                                ? "If this message persists, check the server machine or your connection to it."
                                : "If this message persists after multiple tries, please relaunch the application."}
                        </p>
                    </div>
                </LuffyError>
            </Modal>
        </>
    )
}
