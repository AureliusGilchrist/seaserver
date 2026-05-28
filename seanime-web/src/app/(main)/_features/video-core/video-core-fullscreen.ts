import { logger } from "@/lib/helpers/debug"
import { isApple } from "@/lib/utils/browser-detection"
import { __isTauriDesktop__ } from "@/types/constants"
import { atom } from "jotai"

const log = logger("VIDEO CORE FULLSCREEN")

export type FullscreenManagerChangedEvent = CustomEvent<{ isFullscreen: boolean }>
export type FullscreenManagerDestroyedEvent = CustomEvent
export type FullscreenManagerAttemptEvent = CustomEvent<{ method: "enter" | "exit" }>

interface VideoCoreFullscreenManagerEventMap {
    "fullscreenchanged": FullscreenManagerChangedEvent
    "destroyed": FullscreenManagerDestroyedEvent
    "enterattempt": FullscreenManagerAttemptEvent
    "exitattempt": FullscreenManagerAttemptEvent
}

export const vc_fullscreenManager = atom<VideoCoreFullscreenManager | null>(null)

export class VideoCoreFullscreenManager extends EventTarget {
    private containerElement: HTMLElement | null = null
    private videoElement: HTMLVideoElement | null = null
    private controller = new AbortController()
    private onFullscreenChange: (isFullscreen: boolean) => void
    private isElectronNativeFullscreen = false
    private isTauriNativeFullscreen = false
    private tauriPlatform: string | null = null
    private attachVideoListeners?: () => void

    constructor(onFullscreenChange: (isFullscreen: boolean) => void) {
        super()
        this.onFullscreenChange = onFullscreenChange
        this.attachDocumentListeners()
        this.attachElectronListeners()
        this.initElectronFullscreenState()
        this.initTauri()
    }

    public get isFullscreen(): boolean {
        // Check Electron native fullscreen first
        if (this._isElectron() && this.isElectronNativeFullscreen) {
            return true
        }

        // Check Tauri native fullscreen
        if (this._isTauri() && this.isTauriNativeFullscreen) {
            return true
        }

        // Check iOS video fullscreen
        if (isApple() && this.videoElement) {
            return !!(this.videoElement as any).webkitDisplayingFullscreen
        }

        return !!(
            document.fullscreenElement ||
            (document as any).webkitFullscreenElement ||
            (document as any).mozFullScreenElement ||
            (document as any).msFullscreenElement
        )
    }

    addEventListener<K extends keyof VideoCoreFullscreenManagerEventMap>(
        type: K,
        listener: (this: VideoCoreFullscreenManager, ev: VideoCoreFullscreenManagerEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions,
    ): void

    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void

    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void {
        super.addEventListener(type, listener, options)
    }

    removeEventListener<K extends keyof VideoCoreFullscreenManagerEventMap>(
        type: K,
        listener: (this: VideoCoreFullscreenManager, ev: VideoCoreFullscreenManagerEventMap[K]) => any,
        options?: boolean | EventListenerOptions,
    ): void

    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void

    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void {
        super.removeEventListener(type, listener, options)
    }

    setContainer(containerElement: HTMLElement) {
        this.containerElement = containerElement
    }

    setVideoElement(videoElement: HTMLVideoElement) {
        this.videoElement = videoElement

        // Attach iOS-specific listeners
        if (isApple() && this.attachVideoListeners) {
            this.attachVideoListeners()
        }
    }

    async toggleFullscreen() {
        if (this.isFullscreen) {
            await this.exitFullscreen()
        } else {
            await this.enterFullscreen()
        }
    }

    async exitFullscreen() {
        const attemptEvent: FullscreenManagerAttemptEvent = new CustomEvent("exitattempt", { detail: { method: "exit" } })
        this.dispatchEvent(attemptEvent)

        try {
            if (this._isElectron() && this._shouldUseElectronFullscreen()) {
                await this._exitElectronFullscreen()
                this._focusVideo()
                return
            }

            if (this._isTauri()) {
                await this._exitTauriFullscreen()
                this._focusVideo()
                return
            }

            if (isApple() && this.videoElement && (this.videoElement as any).webkitDisplayingFullscreen) {
                await (this.videoElement as any).webkitExitFullscreen()
                log.info("Exited iOS fullscreen")
                this._focusVideo()
                return
            }

            if (document.exitFullscreen) {
                await document.exitFullscreen()
            } else if ((document as any).webkitExitFullscreen) {
                await (document as any).webkitExitFullscreen()
            } else if ((document as any).mozCancelFullScreen) {
                await (document as any).mozCancelFullScreen()
            } else if ((document as any).msExitFullscreen) {
                await (document as any).msExitFullscreen()
            }
            log.info("Exited fullscreen")
            this._focusVideo()
        }
        catch (error) {
            log.error("Failed to exit fullscreen", error)
        }
    }

    async enterFullscreen() {
        const attemptEvent: FullscreenManagerAttemptEvent = new CustomEvent("enterattempt", { detail: { method: "enter" } })
        this.dispatchEvent(attemptEvent)

        if (!this.containerElement) {
            log.warning("Container element not set")
            return
        }

        try {
            if (this._isElectron() && this._shouldUseElectronFullscreen()) {
                await this._enterElectronFullscreen()
                this._focusVideo()
                return
            }

            if (this._isTauri()) {
                await this._enterTauriFullscreen()
                this._focusVideo()
                return
            }

            if (isApple() && this.videoElement) {
                if ((this.videoElement as any).webkitEnterFullscreen) {
                    await (this.videoElement as any).webkitEnterFullscreen()
                    log.info("Entered iOS fullscreen")
                    this._focusVideo()
                    return
                }
            }

            if (this.containerElement.requestFullscreen) {
                await this.containerElement.requestFullscreen()
            } else if ((this.containerElement as any).webkitRequestFullscreen) {
                await (this.containerElement as any).webkitRequestFullscreen()
            } else if ((this.containerElement as any).mozRequestFullScreen) {
                await (this.containerElement as any).mozRequestFullScreen()
            } else if ((this.containerElement as any).msRequestFullscreen) {
                await (this.containerElement as any).msRequestFullscreen()
            }
            log.info("Entered fullscreen")
            this._focusVideo()
        }
        catch (error) {
            log.error("Failed to enter fullscreen", error)
        }
    }

    destroy() {
        // this.exitFullscreen()
        this.controller.abort()
        this.containerElement = null
        this.videoElement = null

        const event: FullscreenManagerDestroyedEvent = new CustomEvent("destroyed")
        this.dispatchEvent(event)
    }

    private _isElectron(): boolean {
        return !!(window as any)?.electron
    }

    private async initElectronFullscreenState(): Promise<void> {
        if (!this._isElectron() || !window.electron?.window?.isFullscreen) {
            return
        }

        try {
            this.isElectronNativeFullscreen = await window.electron.window.isFullscreen()
            log.info("Initial Electron fullscreen state:", this.isElectronNativeFullscreen)
        }
        catch (error) {
            log.error("Failed to get initial Electron fullscreen state", error)
        }
    }

    private _focusVideo(): void {
        if (this.videoElement) {
            setTimeout(() => {
                this.videoElement?.focus()
            }, 100)
        }
    }

    private _shouldUseElectronFullscreen(): boolean {
        // return this._isElectron() && window.electron?.platform === "win32"
        return this._isElectron()
    }

    private async _enterElectronFullscreen(): Promise<void> {
        if (!(window as any)?.electron?.window?.setFullscreen) {
            log.warning("Electron fullscreen API not available")
            return
        }

        try {
            await (window as any).electron.window.setFullscreen(true)
            this.isElectronNativeFullscreen = true
            log.info("Entered Electron native fullscreen")
        }
        catch (error) {
            log.error("Failed to enter Electron fullscreen", error)
        }
    }

    private async _exitElectronFullscreen(): Promise<void> {
        if (!window.electron?.window?.setFullscreen) {
            log.warning("Electron fullscreen API not available")
            return
        }

        try {
            await window.electron?.window?.setFullscreen(false)
            this.isElectronNativeFullscreen = false
            log.info("Exited Electron native fullscreen")
        }
        catch (error) {
            log.error("Failed to exit Electron fullscreen", error)
        }
    }

    private attachElectronListeners() {
        if (!this._isElectron()) return

        const removeFullscreenListener = window.electron?.on?.("window:fullscreen", (isFullscreen: boolean) => {
            this.isElectronNativeFullscreen = isFullscreen
            log.info("Electron fullscreen state changed:", isFullscreen)

            const event: FullscreenManagerChangedEvent = new CustomEvent("fullscreenchanged", { detail: { isFullscreen } })
            this.dispatchEvent(event)

            this.onFullscreenChange(isFullscreen)
        })

        if (removeFullscreenListener) {
            const originalAbort = this.controller.abort.bind(this.controller)
            this.controller.abort = () => {
                removeFullscreenListener()
                originalAbort()
            }
        }
    }

    private attachDocumentListeners() {
        document.addEventListener("fullscreenchange", this.handleFullscreenChange, {
            signal: this.controller.signal,
        })
        document.addEventListener("webkitfullscreenchange", this.handleFullscreenChange, {
            signal: this.controller.signal,
        })
        document.addEventListener("mozfullscreenchange", this.handleFullscreenChange, {
            signal: this.controller.signal,
        })
        document.addEventListener("msfullscreenchange", this.handleFullscreenChange, {
            signal: this.controller.signal,
        })

        if (isApple()) {
            const attachVideoListeners = () => {
                if (this.videoElement) {
                    this.videoElement.addEventListener("webkitbeginfullscreen", this.handleFullscreenChange, {
                        signal: this.controller.signal,
                    })
                    this.videoElement.addEventListener("webkitendfullscreen", this.handleFullscreenChange, {
                        signal: this.controller.signal,
                    })
                }
            }

            attachVideoListeners()

            this.attachVideoListeners = attachVideoListeners
        }
    }

    private handleFullscreenChange = () => {
        const isFullscreen = this.isFullscreen
        log.info("Fullscreen state changed:", isFullscreen)

        const event: FullscreenManagerChangedEvent = new CustomEvent("fullscreenchanged", { detail: { isFullscreen } })
        this.dispatchEvent(event)

        this.onFullscreenChange(isFullscreen)
    }

    // ------------------------------------------------------------------
    // Tauri desktop support
    // ------------------------------------------------------------------

    private _isTauri(): boolean {
        return __isTauriDesktop__ || !!(window as any)?.__TAURI__
    }

    private get _isTauriMacos(): boolean {
        return this._isTauri() && this.tauriPlatform === "macos"
    }

    private async initTauri(): Promise<void> {
        if (!this._isTauri()) return
        try {
            const [{ platform }, { getCurrentWebviewWindow }] = await Promise.all([
                import("@tauri-apps/plugin-os"),
                import("@tauri-apps/api/webviewWindow"),
            ])
            try {
                this.tauriPlatform = platform()
            } catch {
                this.tauriPlatform = null
            }
            try {
                const win = getCurrentWebviewWindow()
                this.isTauriNativeFullscreen = await win.isFullscreen()
                log.info("Initial Tauri fullscreen state:", this.isTauriNativeFullscreen, "platform:", this.tauriPlatform)

                // Listen for window resize → detect fullscreen state changes
                const unlistenResize = await win.onResized(async () => {
                    try {
                        const fs = await win.isFullscreen()
                        if (fs !== this.isTauriNativeFullscreen) {
                            this.isTauriNativeFullscreen = fs
                            log.info("Tauri fullscreen state changed:", fs)
                            const event: FullscreenManagerChangedEvent = new CustomEvent("fullscreenchanged", { detail: { isFullscreen: fs } })
                            this.dispatchEvent(event)
                            this.onFullscreenChange(fs)
                        }
                    } catch (e) {
                        log.error("Failed to read Tauri fullscreen state on resize", e)
                    }
                })

                if (this.controller.signal.aborted) {
                    unlistenResize()
                } else {
                    this.controller.signal.addEventListener("abort", () => unlistenResize(), { once: true })
                }
            } catch (e) {
                log.error("Failed to initialize Tauri webview window", e)
            }
        } catch (e) {
            log.warning("Tauri APIs unavailable", e)
        }
    }

    private async _enterTauriFullscreen(): Promise<void> {
        try {
            const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow")
            const win = getCurrentWebviewWindow()

            // macOS: activation policy must be flipped to "accessory" before fullscreen,
            // otherwise the traffic-light area corrupts and the window can become unresponsive.
            if (this._isTauriMacos) {
                try {
                    await win.emit("macos-activation-policy-accessory")
                } catch (e) {
                    log.error("Failed to emit macos-activation-policy-accessory", e)
                }
            }

            await win.setFullscreen(true)
            this.isTauriNativeFullscreen = true
            log.info("Entered Tauri native fullscreen")
        } catch (error) {
            log.error("Failed to enter Tauri fullscreen", error)
        }
    }

    private async _exitTauriFullscreen(): Promise<void> {
        try {
            const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow")
            const win = getCurrentWebviewWindow()

            await win.setFullscreen(false)
            this.isTauriNativeFullscreen = false

            // macOS: restore regular activation policy after exiting fullscreen.
            if (this._isTauriMacos) {
                try {
                    await win.emit("macos-activation-policy-regular")
                } catch (e) {
                    log.error("Failed to emit macos-activation-policy-regular", e)
                }
            }

            log.info("Exited Tauri native fullscreen")
        } catch (error) {
            log.error("Failed to exit Tauri fullscreen", error)
        }
    }
}
