"use client"

import { LoadingOverlayWithLogo } from "@/components/shared/loading-overlay-with-logo"
import { SeanimeGradientBackground } from "@/components/shared/gradient-background"
import { TextGenerateEffect } from "@/components/shared/text-generate-effect"
import { SeaImage as Image } from "@/components/shared/sea-image"
import { LoadingOverlay } from "@/components/ui/loading-spinner"
import { __isTauriDesktop__ } from "@/types/constants"
import React from "react"
import { LuMonitor, LuGlobe, LuLoader, LuCircleCheck, LuCircleX } from "react-icons/lu"

type BootState = "loading" | "setup" | "local-booting" | "remote-connecting"

export default function Page() {
    const [bootState, setBootState] = React.useState<BootState>("loading")
    const [remoteUrl, setRemoteUrl] = React.useState("http://")
    const [validating, setValidating] = React.useState(false)
    const [validationError, setValidationError] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (!__isTauriDesktop__) return

        let cleanup: (() => void)[] = []
        let handled = false

        async function init() {
            const { listen } = await import("@tauri-apps/api/event")
            const { invoke } = await import("@tauri-apps/api/core")

            // Register listeners for events that may arrive later (e.g. if Rust delays)
            const u1 = await listen("show-setup", () => {
                if (!handled) {
                    handled = true
                    setBootState("setup")
                }
            })
            cleanup.push(u1)

            const u2 = await listen<string>("remote-ready", (event) => {
                if (!handled) {
                    handled = true
                    const url = event.payload
                    localStorage.setItem("sea-remote-server-url", JSON.stringify(url))
                    localStorage.setItem("sea-server-connection-mode", JSON.stringify("remote"))
                    proceedToMain()
                }
            })
            cleanup.push(u2)

            // Also poll the config directly in case Rust already emitted before we registered listeners
            try {
                const cfg = await invoke<{ mode: string; remote_url?: string } | null>("get_server_config")
                if (handled) return // event already handled above
                handled = true

                if (cfg && cfg.mode === "remote" && cfg.remote_url) {
                    localStorage.setItem("sea-remote-server-url", JSON.stringify(cfg.remote_url))
                    localStorage.setItem("sea-server-connection-mode", JSON.stringify("remote"))
                    proceedToMain()
                } else if (cfg && cfg.mode === "local") {
                    // Local mode — sidecar should already be starting from Rust .setup()
                    // Just wait; the existing server.rs flow will close splashscreen on "Client connected"
                } else {
                    // No config — show setup
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
        return () => { cleanup.forEach(fn => fn()) }
    }, [])

    async function proceedToMain() {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow")
        const { Window } = await import("@tauri-apps/api/window")
        const mainWindow = new Window("main")
        await mainWindow.maximize()
        await mainWindow.show()
        await getCurrentWebviewWindow().close()
    }

    async function handleChooseLocal() {
        setBootState("local-booting")
        try {
            const { invoke } = await import("@tauri-apps/api/core")
            // Save config
            await invoke("save_server_config", { mode: "local", remoteUrl: null })
            // Clear any remote URL from localStorage
            localStorage.removeItem("sea-remote-server-url")
            localStorage.setItem("sea-server-connection-mode", JSON.stringify("local"))
            // Tell Rust to start the sidecar
            await invoke("start_local_server")
            // The rest happens via the existing server.rs flow:
            // Rust monitors stdout for "Client connected", then closes splashscreen + shows main
        } catch (e) {
            console.error("Failed to start local server:", e)
            setBootState("setup")
        }
    }

    async function handleConnectRemote() {
        if (!remoteUrl || remoteUrl === "http://" || remoteUrl === "https://") return

        setValidating(true)
        setValidationError(null)

        try {
            const { invoke } = await import("@tauri-apps/api/core")
            const ok = await invoke<boolean>("validate_remote_server", { url: remoteUrl })
            if (ok) {
                const cleanUrl = remoteUrl.replace(/\/+$/, "")
                await invoke("save_server_config", { mode: "remote", remoteUrl: cleanUrl })
                localStorage.setItem("sea-remote-server-url", JSON.stringify(cleanUrl))
                localStorage.setItem("sea-server-connection-mode", JSON.stringify("remote"))
                setBootState("remote-connecting")
                // Brief delay before showing main window
                setTimeout(() => proceedToMain(), 500)
            }
        } catch (e: any) {
            setValidationError(typeof e === "string" ? e : e?.message || "Connection failed")
        } finally {
            setValidating(false)
        }
    }

    // Non-Tauri or loading state: show default loading overlay
    if (!__isTauriDesktop__ || bootState === "loading") {
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
