import { MediaCaptionsManager } from "@/app/(main)/_features/video-core/video-core-media-captions"
import { VideoCoreSubtitleManager } from "@/app/(main)/_features/video-core/video-core-subtitles"
import { VideoCore_VideoPlaybackInfo } from "@/app/(main)/_features/video-core/video-core.atoms"
import { __isElectronDesktop__ } from "@/types/constants"
import { logger } from "@/lib/helpers/debug"
import { atom } from "jotai"
import { derive } from "jotai-derive"

const log = logger("VIDEO CORE PIP")

export type PipManagerEnteredEvent = CustomEvent<{ pipElement: HTMLVideoElement }>
export type PipManagerExitedEvent = CustomEvent
export type PipManagerToggledEvent = CustomEvent<{ enabled: boolean }>
export type PipManagerDestroyedEvent = CustomEvent
export type PipManagerErrorEvent = CustomEvent<{ error: string }>

interface VideoCorePipManagerEventMap {
    "enteredpip": PipManagerEnteredEvent
    "exitedpip": PipManagerExitedEvent
    "toggledpip": PipManagerToggledEvent
    "destroyed": PipManagerDestroyedEvent
    "error": PipManagerErrorEvent
}

export const vc_pipElement = atom<HTMLVideoElement | null>(null)
export const vc_pipManager = atom<VideoCorePipManager | null>(null)
export const vc_pip = derive([vc_pipElement], (pipElement) => pipElement !== null)
// Fork: the Document Picture-in-Picture window (Chromium 116+), when one is open. The
// window holds the PiP video plus the app's own controls, portaled in from React.
export const vc_docPipWindow = atom<Window | null>(null)

// Minimal Document Picture-in-Picture API surface (Chromium 116+; not in lib.dom yet).
type DocumentPictureInPicture = {
    requestWindow: (options?: {
        width?: number
        height?: number
        disallowReturnToOpener?: boolean
    }) => Promise<Window>
    window: Window | null
}

function getDocumentPictureInPicture(): DocumentPictureInPicture | null {
    if (typeof window === "undefined") return null
    return (window as Window & { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null
}

export class VideoCorePipManager extends EventTarget {
    private video: HTMLVideoElement | null = null
    private subtitleManager: VideoCoreSubtitleManager | null = null
    private mediaCaptionsManager: MediaCaptionsManager | null = null
    // Fork: when set, all pop-out actions hand playback off to the desktop popout window
    // instead of entering picture-in-picture. Set in the Electron client, where the
    // canvas PiP pipeline is too heavy and Document PiP is unsupported.
    private popoutHandler: (() => void) | null = null
    private controller = new AbortController()
    private canvasController: AbortController | null = null
    private readonly onPipElementChange: (element: HTMLVideoElement | null) => void
    private readonly onDocPipWindowChange: ((win: Window | null) => void) | null
    private docPipWindow: Window | null = null
    private pipProxy: HTMLVideoElement | null = null
    private isSyncingFromMain = false
    private isSyncingFromPip = false
    private playbackInfo: VideoCore_VideoPlaybackInfo | null = null

    constructor(
        onPipElementChange: (element: HTMLVideoElement | null) => void,
        onDocPipWindowChange?: (win: Window | null) => void,
    ) {
        super()
        this.onPipElementChange = onPipElementChange
        this.onDocPipWindowChange = onDocPipWindowChange ?? null
        document.addEventListener("enterpictureinpicture", this.handleEnterPip, {
            signal: this.controller.signal,
        })
        document.addEventListener("leavepictureinpicture", this.handleLeavePip, {
            signal: this.controller.signal,
        })
        // window.addEventListener("visibilitychange", () => {
        //     const shouldAutoPip = document.visibilityState !== "visible" &&
        //         this.video &&
        //         !this.video.paused
        //
        //     if (shouldAutoPip) {
        //         this.togglePip(true)
        //     }
        // }, { signal: this.controller.signal })
    }

    private _isPip = false

    get isPip(): boolean {
        return this._isPip
    }

    addEventListener<K extends keyof VideoCorePipManagerEventMap>(
        type: K,
        listener: (this: VideoCorePipManager, ev: VideoCorePipManagerEventMap[K]) => any,
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

    removeEventListener<K extends keyof VideoCorePipManagerEventMap>(
        type: K,
        listener: (this: VideoCorePipManager, ev: VideoCorePipManagerEventMap[K]) => any,
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

    setVideo(video: HTMLVideoElement, playbackInfo: VideoCore_VideoPlaybackInfo) {
        this.video = video

        if (this.video) {
            this.video.addEventListener("play", this.handleMainVideoPlay, {
                signal: this.controller.signal,
            })
            this.video.addEventListener("pause", this.handleMainVideoPause, {
                signal: this.controller.signal,
            })
        }
        this.playbackInfo = playbackInfo
    }

    /**
     * Fork: wire the desktop popout (Electron). While set, togglePip/enterPip hand the
     * stream off to the always-on-top popout window instead of using picture-in-picture.
     */
    setPopoutHandler(handler: (() => void) | null) {
        this.popoutHandler = handler
    }

    setSubtitleManager(subtitleManager: VideoCoreSubtitleManager) {
        this.subtitleManager = subtitleManager
    }

    setMediaCaptionsManager(mediaCaptionsManager: MediaCaptionsManager) {
        this.mediaCaptionsManager = mediaCaptionsManager
    }

    togglePip(enable?: boolean) {
        // In the desktop client, "pop out" means handing playback off to the popout
        // window — there is no PiP state to toggle here.
        if (this.popoutHandler) {
            if (enable === false) return
            this.popoutHandler()
            return
        }

        const isCurrentlyInPip = document.pictureInPictureElement !== null || this.docPipWindow !== null
        const shouldEnable = enable !== undefined ? enable : !isCurrentlyInPip

        if (shouldEnable) {
            this.enterPip()
        } else {
            this.exitPip()
        }
    }

    exitPip() {
        if (this.docPipWindow) {
            // Closing the Document PiP window fires "pagehide", which runs the cleanup.
            this.docPipWindow.close()
            return
        }

        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch((err: DOMException) => {
                log.error("Failed to exit PiP", err)
                const errorEvent: PipManagerErrorEvent = new CustomEvent("error", { detail: { error: `Failed to exit PiP: ${err.message}` } })
                this.dispatchEvent(errorEvent)
            })
        }
    }

    private isEnteringRef = false

    async enterPip() {
        if (this.popoutHandler) {
            this.popoutHandler()
            return
        }

        if (this.isEnteringRef || document.pictureInPictureElement || this.docPipWindow || !this.video) {
            log.warning("PiP already in use, entry already in progress, or video not set")
            return
        }

        this.isEnteringRef = true
        try {
            const hasLibassSubtitles = this.subtitleManager?.getSelectedTrackNumberOrNull?.() != null
            const hasMediaCaptions = this.mediaCaptionsManager?.getSelectedTrackIndexOrNull?.() != null
            const hasActiveSubtitles = hasLibassSubtitles || hasMediaCaptions

            if (!hasActiveSubtitles && !getDocumentPictureInPicture()) {
                // No subtitles and no Document PiP support: the browser's native video PiP
                // is both the cheapest and the only floating window available.
                log.info("Entering native PiP without subtitles")
                await this.video.requestPictureInPicture()
                return
            }

            // The canvas-stream path serves both remaining cases: with subtitles it burns
            // them into the PiP picture; without subtitles it feeds the Document PiP
            // window, which carries the app's own controls.
            log.info("Entering PiP", { hasLibassSubtitles, hasMediaCaptions })
            await this.enterPipWithSubtitles()
        }
        catch (error) {
            log.error("Failed to enter PiP", error)
            const errorMessage = error instanceof Error ? error.message : "Unknown error during PiP entry"
            const errorEvent: PipManagerErrorEvent = new CustomEvent("error", { detail: { error: errorMessage } })
            this.dispatchEvent(errorEvent)
        }
        finally {
            this.isEnteringRef = false
        }
    }

    destroy() {
        this.exitPip()
        this.canvasController?.abort()
        this.controller.abort()
        this.docPipWindow = null
        this.onDocPipWindowChange?.(null)
        this.video = null
        this.subtitleManager = null
        this.mediaCaptionsManager = null

        const event: PipManagerDestroyedEvent = new CustomEvent("destroyed")
        this.dispatchEvent(event)
    }

    private handleEnterPip = () => {
        const pipElement = document.pictureInPictureElement as HTMLVideoElement | null
        log.info("Entered PiP", pipElement)

        this._isPip = true

        if (pipElement) {
            const event: PipManagerEnteredEvent = new CustomEvent("enteredpip", { detail: { pipElement } })
            this.dispatchEvent(event)
            const event2: PipManagerToggledEvent = new CustomEvent("toggledpip", { detail: { enabled: true } })
            this.dispatchEvent(event2)
        }

        this.onPipElementChange(pipElement)
    }

    private handleLeavePip = () => {
        log.info("Exited PiP")

        this._isPip = false

        const event: PipManagerExitedEvent = new CustomEvent("exitedpip")
        this.dispatchEvent(event)
        const event2: PipManagerToggledEvent = new CustomEvent("toggledpip", { detail: { enabled: false } })
        this.dispatchEvent(event2)

        this.onPipElementChange(null)

        if (this.video) {
            this.video.focus()
        }
        this.pipProxy = null
    }

    // ── Fork: Document Picture-in-Picture ────────────────────────────────────────────

    private handleDocPipEntered(pipVideo: HTMLVideoElement) {
        log.info("Entered Document PiP", pipVideo)

        this._isPip = true

        const event: PipManagerEnteredEvent = new CustomEvent("enteredpip", { detail: { pipElement: pipVideo } })
        this.dispatchEvent(event)
        const event2: PipManagerToggledEvent = new CustomEvent("toggledpip", { detail: { enabled: true } })
        this.dispatchEvent(event2)

        this.onPipElementChange(pipVideo)
    }

    private handleDocPipClosed() {
        log.info("Exited Document PiP")

        this.canvasController?.abort()
        this.docPipWindow = null
        this.onDocPipWindowChange?.(null)

        this._isPip = false

        const event: PipManagerExitedEvent = new CustomEvent("exitedpip")
        this.dispatchEvent(event)
        const event2: PipManagerToggledEvent = new CustomEvent("toggledpip", { detail: { enabled: false } })
        this.dispatchEvent(event2)

        this.onPipElementChange(null)

        if (this.video) {
            this.video.focus()
        }
        this.pipProxy = null
    }

    private async enterNativePip(pipVideo: HTMLVideoElement, signal: AbortSignal) {
        // Native video PiP: the PiP window shows only the picture, with the browser's own
        // controls. Used in the desktop client (which has no Document PiP support) and as
        // the fallback when the Document PiP window fails to open.
        const pipWindow = await pipVideo.requestPictureInPicture()

        pipWindow.addEventListener("resize", () => {
            const { width, height } = pipWindow
            if (isNaN(width) || isNaN(height) || !isFinite(width) || !isFinite(height)) {
                return
            }
            this.subtitleManager?.pgsRenderer?.resize()
        }, { signal })
    }

    private copyStylesToPipWindow(pipWindow: Window) {
        [...document.styleSheets].forEach((styleSheet) => {
            try {
                const cssRules = [...styleSheet.cssRules].map(rule => rule.cssText).join("")
                const style = pipWindow.document.createElement("style")
                style.textContent = cssRules
                pipWindow.document.head.appendChild(style)
            }
            catch {
                // Cross-origin stylesheet: fall back to linking it so the browser re-fetches it.
                const link = pipWindow.document.createElement("link")
                link.rel = "stylesheet"
                link.type = styleSheet.type ?? "text/css"
                link.media = styleSheet.media.mediaText
                if (styleSheet.href) {
                    link.href = styleSheet.href
                    pipWindow.document.head.appendChild(link)
                }
            }
        })
    }

    private setupDocPipBody(pipWindow: Window, pipVideo: HTMLVideoElement) {
        const body = pipWindow.document.body
        body.style.margin = "0"
        body.style.background = "#000"
        body.style.display = "flex"
        body.style.flexDirection = "column"
        body.style.overflow = "hidden"

        pipVideo.style.width = "100%"
        pipVideo.style.flex = "1 1 0%"
        pipVideo.style.minHeight = "0"
        pipVideo.style.objectFit = "contain"

        body.appendChild(pipVideo)
    }

    private newPipVideo() {
        const element = document.createElement("video")
        element.muted = true
        element.addEventListener("enterpictureinpicture", this.handleEnterPip, {
            signal: this.controller.signal,
        })
        element.addEventListener("leavepictureinpicture", this.handleLeavePip, {
            signal: this.controller.signal,
        })
        return element
    }


    private renderToCanvas = (
        pipVideo: HTMLVideoElement,
        context: CanvasRenderingContext2D,
        animationFrameRef: { current: number },
    ) => (now?: number, metadata?: VideoFrameCallbackMetadata) => {
        if (!this.video || !context) return

        // sync play/pause state
        if (now !== undefined) {
            if (this.video.paused && !pipVideo.paused) {
                if (!this.isSyncingFromPip) {
                    pipVideo.pause()
                }
            } else if (!this.video.paused && pipVideo.paused) {
                if (!this.isSyncingFromPip) {
                    pipVideo.play().catch(() => {})
                }
            }
        }

        context.drawImage(this.video, 0, 0, context.canvas.width, context.canvas.height)

        // Draw ASS/SSA subtitles
        const subtitleCanvas = this.subtitleManager?.libassRenderer?._canvas
        if (subtitleCanvas && context.canvas.width && context.canvas.height) {
            context.drawImage(subtitleCanvas, 0, 0, context.canvas.width, context.canvas.height)
        }

        // Draw PGS subtitles
        const pgsCanvas = this.subtitleManager?.pgsRenderer?._canvas
        if (pgsCanvas && context.canvas.width && context.canvas.height) {
            context.drawImage(pgsCanvas, 0, 0, context.canvas.width, context.canvas.height)
        }

        // Draw media captions
        if (this.mediaCaptionsManager) {
            this.mediaCaptionsManager.renderToCanvas(context, context.canvas.width, context.canvas.height, this.video.currentTime)
        }

        animationFrameRef.current = this.video.requestVideoFrameCallback(this.renderToCanvas(pipVideo, context, animationFrameRef))
    }

    private handleMainVideoPlay = () => {
        if (this.isSyncingFromPip) return
        if (this.pipProxy && this.pipProxy.paused) {
            this.isSyncingFromMain = true
            this.pipProxy.play().catch(() => {})
            this.isSyncingFromMain = false
        }
    }

    private handleMainVideoPause = () => {
        if (this.isSyncingFromPip) return
        if (this.pipProxy && !this.pipProxy.paused) {
            this.isSyncingFromMain = true
            this.pipProxy.pause()
            this.isSyncingFromMain = false
        }
    }

    private async enterPipWithSubtitles() {
        if (!this.video || (!this.subtitleManager && !this.mediaCaptionsManager)) return

        const canvas = document.createElement("canvas")
        const context = canvas.getContext("2d")
        if (!context) {
            log.error("Failed to get canvas context")
            return
        }

        const pipVideo = this.newPipVideo()
        pipVideo.srcObject = canvas.captureStream()
        pipVideo.muted = true
        this.pipProxy = pipVideo

        // Cap the canvas at a working resolution. Drawing the video frame (a GPU→CPU
        // readback) and rendering libass subtitles at full source resolution for every
        // frame is what makes the popout lag on heavy content; the floating window is
        // small enough that 960px wide stays sharp.
        const sourceWidth = this.video.videoWidth || 960
        const sourceHeight = this.video.videoHeight || Math.round(960 * (9 / 16))
        const sizeScale = Math.min(1, 960 / sourceWidth)
        canvas.width = Math.round(sourceWidth * sizeScale)
        canvas.height = Math.round(sourceHeight * sizeScale)

        if (this.subtitleManager?.libassRenderer) {
            await this.subtitleManager.libassRenderer.resize(true, canvas.width, canvas.height)
        }

        this.canvasController = new AbortController()

        // Forward PiP overlay play/pause controls to the main video element
        // In the canvas path the PiP element is not the main <video> and PiP UI
        // controls act on this proxy element instead.
        const forwardPlay = () => {
            if (this.video && this.video.paused) {
                this.isSyncingFromPip = true
                this.video.play().catch(err => {
                    log.error("Failed to play main video from PiP overlay", err)
                }).finally(() => {
                    this.isSyncingFromPip = false
                })
            }
        }
        const forwardPause = () => {
            if (this.video && !this.video.paused) {
                this.isSyncingFromPip = true
                this.video.pause()
                this.isSyncingFromPip = false
            }
        }
        pipVideo.addEventListener("play", forwardPlay, { signal: this.canvasController.signal })
        pipVideo.addEventListener("pause", forwardPause, { signal: this.canvasController.signal })
        const animationFrameRef = { current: 0 }

        // draw initial frame
        context.drawImage(this.video, 0, 0, context.canvas.width, context.canvas.height)
        const subtitleCanvas = this.subtitleManager?.libassRenderer?._canvas
        if (subtitleCanvas && canvas.width && canvas.height) {
            context.drawImage(subtitleCanvas, 0, 0, canvas.width, canvas.height)
        }
        const pgsCanvas = this.subtitleManager?.pgsRenderer?._canvas
        if (pgsCanvas && canvas.width && canvas.height) {
            context.drawImage(pgsCanvas, 0, 0, canvas.width, canvas.height)
        }
        if (this.mediaCaptionsManager) {
            await this.mediaCaptionsManager.renderToCanvas(context, canvas.width, canvas.height, this.video.currentTime)
        }

        // wait for metadata
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Timeout waiting for PiP video metadata"))
            }, 5000)

            pipVideo.addEventListener("loadedmetadata", () => {
                clearTimeout(timeout)
                resolve()
            }, { once: true })

            pipVideo.addEventListener("error", () => {
                clearTimeout(timeout)
                reject(new Error("Error loading PiP video metadata"))
            }, { once: true })
        })

        const cleanup = () => {
            if (this.subtitleManager?.libassRenderer) {
                this.subtitleManager.libassRenderer.resize()
            }
            if (animationFrameRef.current && this.video) {
                this.video.cancelVideoFrameCallback(animationFrameRef.current)
            }
            canvas.remove()
            pipVideo.remove()
            this.pipProxy = null
        }

        this.canvasController.signal.addEventListener("abort", cleanup)
        this.controller.signal.addEventListener("abort", () => {
            this.canvasController?.abort()
        })
        pipVideo.addEventListener("leavepictureinpicture", () => {
            this.canvasController?.abort()
        }, { signal: this.canvasController.signal })

        try {
            // start the continuous rendering loop
            this.renderToCanvas(pipVideo, context, animationFrameRef)(performance.now())

            // always start the canvas stream
            try {
                await pipVideo.play()
                if (this.video.paused) {
                    pipVideo.pause()
                }
            }
            catch (playError) {
                if (playError instanceof DOMException && playError.name === "AbortError") {
                } else {
                    throw playError
                }
            }

            // Electron does not support the Document PiP API — requestWindow() silently
            // opens nothing there (electron/electron#39633) — so only attempt it outside
            // the desktop client. A requestWindow that fails or hangs falls back to the
            // native video PiP rather than leaving the button dead.
            const docPip = __isElectronDesktop__ ? null : getDocumentPictureInPicture()

            if (docPip) {
                let pipWindow: Window | null = null
                let settled = false

                const request = docPip.requestWindow({
                    width: 480,
                    height: 270,
                }).then(win => {
                    if (settled) {
                        // We already fell back to native PiP; close the late window so it
                        // doesn't linger unmanaged alongside it.
                        win.close()
                        return null
                    }
                    settled = true
                    return win
                }).catch(err => {
                    log.warning("Document PiP requestWindow failed, falling back to native video PiP", err)
                    settled = true
                    return null
                })

                const timeout = new Promise<null>(resolve => setTimeout(() => {
                    if (!settled) {
                        settled = true
                        log.warning("Document PiP window did not open in time — falling back to native video PiP")
                    }
                    resolve(null)
                }, 2000))

                pipWindow = await Promise.race([request, timeout])

                if (pipWindow) {
                    this.docPipWindow = pipWindow
                    this.onDocPipWindowChange?.(pipWindow)
                    this.copyStylesToPipWindow(pipWindow)
                    this.setupDocPipBody(pipWindow, pipVideo)

                    pipWindow.addEventListener("pagehide", () => {
                        this.handleDocPipClosed()
                    }, { signal: this.canvasController.signal })

                    this.handleDocPipEntered(pipVideo)
                }
                else {
                    await this.enterNativePip(pipVideo, this.canvasController!.signal)
                }
            }
            else {
                await this.enterNativePip(pipVideo, this.canvasController!.signal)
            }

            log.info("Successfully entered PiP")
        }
        catch (error) {
            log.error("Failed to enter PiP", error)
            this.canvasController?.abort()
            throw error
        }
    }
}

