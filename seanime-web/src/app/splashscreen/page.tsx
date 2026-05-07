"use client"

import { LoadingOverlayWithLogo } from "@/components/shared/loading-overlay-with-logo"
import { SeanimeGradientBackground } from "@/components/shared/gradient-background"
import { TextGenerateEffect } from "@/components/shared/text-generate-effect"
import { SeaImage as Image } from "@/components/shared/sea-image"
import { LoadingOverlay } from "@/components/ui/loading-spinner"
import { __isElectronDesktop__, __isTauriDesktop__ } from "@/types/constants"
import React from "react"
import { LuMonitor, LuGlobe, LuLoader, LuCircleCheck, LuCircleX } from "react-icons/lu"

type BootState = "loading" | "setup" | "local-booting" | "remote-connecting"

type ServerConfig = { mode: "local" | "remote"; remote_url?: string } | null

// Cross-platform desktop bridge — abstracts Tauri vs Electron IPC.
type DesktopBridge = {
    getConfig: () => Promise<ServerConfig>
    saveConfig: (mode: "local" | "remote", remoteUrl: string | null) => Promise<void>
    validateRemote: (url: string) => Promise<boolean>
    startLocal: () => Promise<void>
    onShowSetup: (cb: () => void) => () => void
    onRemoteReady: (cb: (url: string) => void) => () => void
    proceedToMain: () => Promise<void>
}

async function makeTauriBridge(): Promise<DesktopBridge> {
    const { listen } = await import("@tauri-apps/api/event")
    const { invoke } = await import("@tauri-apps/api/core")
    return {
        getConfig: () => invoke<ServerConfig>("get_server_config"),
        saveConfig: async (mode, remoteUrl) => { await invoke("save_server_config", { mode, remoteUrl }) },
        validateRemote: (url) => invoke<boolean>("validate_remote_server", { url }),
        startLocal: async () => { await invoke("start_local_server") },
        onShowSetup: (cb) => {
            let off: (() => void) | null = null
            listen("show-setup", () => cb()).then(u => { off = u })
            return () => { off?.() }
        },
        onRemoteReady: (cb) => {
            let off: (() => void) | null = null
            listen<string>("remote-ready", (e) => cb(e.payload)).then(u => { off = u })
            return () => { off?.() }
        },
        proceedToMain: async () => {
            const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow")
            const { Window } = await import("@tauri-apps/api/window")
            const mainWindow = new Window("main")
            await mainWindow.maximize()
            await mainWindow.show()
            await getCurrentWebviewWindow().close()
        },
    }
}

function makeElectronBridge(): DesktopBridge {
    const electron = (window as any).electron
    return {
        getConfig: () => electron.serverConfig.get(),
        saveConfig: async (mode, remoteUrl) => {
            await electron.serverConfig.save({ mode, remote_url: remoteUrl ?? "" })
        },
        validateRemote: async (url) => {
            const r = await electron.serverConfig.validate(url)
            if (r?.ok) return true
            throw new Error(r?.error || "Connection failed")
        },
        startLocal: async () => { electron.serverConfig.launchLocal() },
        onShowSetup: (cb) => {
            const off = electron.on("show-setup", () => cb())
            return () => { off?.() }
        },
        onRemoteReady: (cb) => {
            const off = electron.on("remote-ready", (payload: any) => {
                const url = typeof payload === "string" ? payload : payload?.remote_url
                if (url) cb(url)
            })
            return () => { off?.() }
        },
        proceedToMain: async () => {
            // Main process handles closing splash + showing main window.
            electron.serverConfig.remoteReadyAck()
        },
    }
}

export default function Page() {
    const [bootState, setBootState] = React.useState<BootState>("loading")
    const [remoteUrl, setRemoteUrl] = React.useState("http://")
    const [validating, setValidating] = React.useState(false)
    const [validationError, setValidationError] = React.useState<string | null>(null)
    const bridgeRef = React.useRef<DesktopBridge | null>(null)

    React.useEffect(() => {
        if (!__isTauriDesktop__ && !__isElectronDesktop__) return

        let cleanup: Array<() => void> = []
        let handled = false
        let cancelled = false

        async function init() {
            const bridge: DesktopBridge = __isTauriDesktop__
                ? await makeTauriBridge()
                : makeElectronBridge()
            if (cancelled) return
            bridgeRef.current = bridge

            // Register listeners for events that may arrive later
            cleanup.push(bridge.onShowSetup(() => {
                if (!handled) {
                    handled = true
                    setBootState("setup")
                }
            }))

            cleanup.push(bridge.onRemoteReady((url) => {
                if (!handled) {
                    handled = true
                    localStorage.setItem("sea-remote-server-url", JSON.stringify(url))
                    localStorage.setItem("sea-server-connection-mode", JSON.stringify("remote"))
                    bridge.proceedToMain()
                }
            }))

            // Also poll the config directly in case the event already fired before listeners were registered
            try {
                const cfg = await bridge.getConfig()
                if (handled) return
                handled = true

                if (cfg && cfg.mode === "remote" && cfg.remote_url) {
                    localStorage.setItem("sea-remote-server-url", JSON.stringify(cfg.remote_url))
                    localStorage.setItem("sea-server-connection-mode", JSON.stringify("remote"))
                    bridge.proceedToMain()
                } else if (cfg && cfg.mode === "local") {
                    // Local mode — sidecar should already be starting from main process.
                    // Wait for the existing "Client connected" flow to close splash + show main.
                } else {
                    setBootState("setup")
                }
            } catch (e) {
                console.error("Failed to get server config:", e)
                if (!handled) {
                    handled = true
                    setBootState("setup")
                }
            }
        }

        init()
        return () => {
            cancelled = true
            cleanup.forEach(fn => fn())
        }
    }, [])

    async function handleChooseLocal() {
        const bridge = bridgeRef.current
        if (!bridge) return
        setBootState("local-booting")
        try {
            await bridge.saveConfig("local", null)
            localStorage.removeItem("sea-remote-server-url")
            localStorage.setItem("sea-server-connection-mode", JSON.stringify("local"))
            await bridge.startLocal()
            // The rest happens via the existing "Client connected" flow:
            // main process monitors stdout, then closes splash + shows main.
        } catch (e) {
            console.error("Failed to start local server:", e)
            setBootState("setup")
        }
    }

    async function handleConnectRemote() {
        const bridge = bridgeRef.current
        if (!bridge) return
        if (!remoteUrl || remoteUrl === "http://" || remoteUrl === "https://") return

        setValidating(true)
        setValidationError(null)

        try {
            const ok = await bridge.validateRemote(remoteUrl)
            if (ok) {
                const cleanUrl = remoteUrl.replace(/\/+$/, "")
                await bridge.saveConfig("remote", cleanUrl)
                localStorage.setItem("sea-remote-server-url", JSON.stringify(cleanUrl))
                localStorage.setItem("sea-server-connection-mode", JSON.stringify("remote"))
                setBootState("remote-connecting")
                setTimeout(() => bridge.proceedToMain(), 500)
            }
        } catch (e: any) {
            setValidationError(typeof e === "string" ? e : e?.message || "Connection failed")
        } finally {
            setValidating(false)
        }
    }

    // Non-desktop or loading state: show default loading overlay
    if ((!__isTauriDesktop__ && !__isElectronDesktop__) || bootState === "loading") {
        return <LoadingOverlayWithLogo />
    }

    // Local booting: show loading overlay while sidecar starts
    if (bootState === "local-booting") {
        return <LoadingOverlayWithLogo title="Starting server..." />
    }

    // Remote connecting: brief success state
    if (bootState === "remote-connecting") {
        return (
            <LoadingOverlay showSpinner={false}>
                <LuCircleCheck className="text-green-400 text-4xl mb-2 animate-pulse z-[1]" />
                <TextGenerateEffect className="text-lg mt-2 text-[--muted] z-[1]" words="Connected" />
                <SeanimeGradientBackground />
            </LoadingOverlay>
        )
    }

    // Setup screen: choose local or remote
    return (
        <div className="fixed inset-0 bg-[#04060a] flex flex-col items-center justify-center text-white">
            <SeanimeGradientBackground />

            <div className="z-[1] flex flex-col items-center">
                <Image
                    src="/seanime-logo.png"
                    alt="Seanime"
                    priority
                    width={80}
                    height={80}
                    className="mb-4"
                />
                <TextGenerateEffect className="text-lg text-[--muted] mb-8" words="S e a n i m e" />

                <p className="text-sm text-gray-400 mb-6">How would you like to run Seanime?</p>

                <div className="flex gap-4 mb-6">
                    {/* Local Server Card */}
                    <button
                        onClick={handleChooseLocal}
                        className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-gray-700 bg-gray-900/50 hover:border-gray-500 hover:bg-gray-800/50 transition-all duration-200 w-56 cursor-pointer"
                    >
                        <LuMonitor className="text-3xl text-gray-300 group-hover:text-white transition-colors" />
                        <span className="font-semibold text-sm">Local Server</span>
                        <span className="text-xs text-gray-500 text-center leading-relaxed">
                            Run the built-in server on this machine
                        </span>
                    </button>

                    {/* Remote Server Card */}
                    <button
                        onClick={() => setBootState("setup")} // already in setup, this focuses the remote form
                        className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-gray-700 bg-gray-900/50 hover:border-gray-500 hover:bg-gray-800/50 transition-all duration-200 w-56 cursor-pointer"
                        id="remote-card"
                    >
                        <LuGlobe className="text-3xl text-gray-300 group-hover:text-white transition-colors" />
                        <span className="font-semibold text-sm">Remote Server</span>
                        <span className="text-xs text-gray-500 text-center leading-relaxed">
                            Connect to a Seanime server on your network
                        </span>
                    </button>
                </div>

                {/* Remote URL form — always shown on setup */}
                <div className="w-full max-w-md space-y-3">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={remoteUrl}
                            onChange={(e) => {
                                setRemoteUrl(e.target.value)
                                setValidationError(null)
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleConnectRemote()
                            }}
                            placeholder="http://192.168.1.x:43211"
                            className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-400 transition-colors"
                        />
                        <button
                            onClick={handleConnectRemote}
                            disabled={validating || !remoteUrl || remoteUrl === "http://" || remoteUrl === "https://"}
                            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {validating ? <LuLoader className="animate-spin" /> : "Connect"}
                        </button>
                    </div>

                    {validationError && (
                        <div className="flex items-center gap-2 text-red-400 text-xs">
                            <LuCircleX className="shrink-0" />
                            <span>{validationError}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
