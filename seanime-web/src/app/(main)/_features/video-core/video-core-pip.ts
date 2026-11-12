import { enterAndroidPip } from "@/app/(main)/_features/video-core/video-core-mobile-shell"
import { __isMobileShell__ } from "@/types/constants"
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
    // Document PiP moves the real <video> and its subtitle layers into the PiP window. This marks
    // where they came from so they can go back; the stage is their box in the PiP window.
    private docPipController: AbortController | null = null
    private docPipPlaceholder: Comment | null = null
    private docPipStage: HTMLElement | null = null
    private docPipPausedAt = 0
    private docPipLastPlayingAt = 0
    // "GPU-optimized playback" setting. Off: Document PiP gets the old canvas copy of the video.
    private gpuOptimized = true
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

    setGpuOptimized(enabled: boolean) {
        this.gpuOptimized = enabled
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
            // Put the video back now, while React still has the page it belongs to; closing the
            // window then fires "pagehide", which runs the rest of the cleanup.
            this.restoreDocPipNodes()
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
        if (__isMobileShell__) {
            if (this.video) await enterAndroidPip(this.video).catch(error => log.error("Failed to enter PiP", error))
            return
        }

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

            // Electron does not support the Document PiP API — requestWindow() silently
            // opens nothing there (electron/electron#39633) — so only attempt it outside
            // the desktop client.
            const docPip = __isElectronDesktop__ ? null : getDocumentPictureInPicture()
            if (docPip && !this.gpuOptimized) {
                // GPU-optimized playback off: the Document PiP window shows a canvas copy of the
                // video with subtitles burned in (the original behaviour).
                log.info("Entering Document PiP with a canvas copy", { hasLibassSubtitles, hasMediaCaptions })
                await this.enterPipWithSubtitles(docPip)
                return
            }
            if (docPip) {
                // Document PiP: the real <video> (still hardware-decoded and composited, no copy)
                // and its subtitle canvases move into the window together with the app's controls.
                const pipWindow = await this.openDocPipWindow(docPip)
                if (pipWindow) {
                    log.info("Entering Document PiP", { hasLibassSubtitles, hasMediaCaptions })
                    this.enterDocPipWithVideo(pipWindow)
                    return
                }
                // A requestWindow that fails or hangs falls back to the native video PiP rather
                // than leaving the button dead.
            }

            if (!hasActiveSubtitles) {
                // No subtitles: the browser's native video PiP on the real element is the cheapest.
                log.info("Entering native PiP without subtitles")
                await this.video.requestPictureInPicture()
                return
            }

            // Native video PiP can only show a <video>, so subtitles are burned in by drawing
            // video + subtitles into a canvas and streaming that.
            log.info("Entering native PiP with burned-in subtitles", { hasLibassSubtitles, hasMediaCaptions })
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
        this.restoreDocPipNodes()
        this.docPipController?.abort()
        this.docPipController = null
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

        this.restoreDocPipNodes()
        this.docPipController?.abort()
        this.docPipController = null
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
        // The chosen interface styles (progress bar look, accent colours) are keyed on the root
        // element's data-sea-* attributes and inline CSS variables, so the PiP root needs them too.
        const root = document.documentElement
        const pipRoot = pipWindow.document.documentElement
        for (const attr of [...root.attributes]) {
            if (attr.name.startsWith("data-sea-") || attr.name === "style") pipRoot.setAttribute(attr.name, attr.value)
        }
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

    private setupDocPipBody(pipWindow: Window) {
        const body = pipWindow.document.body
        body.style.margin = "0"
        body.style.background = "#000"
        body.style.display = "flex"
        body.style.flexDirection = "column"
        body.style.overflow = "hidden"

        // The picture sits in its own box, laid out like the player's inner container (relative,
        // centred flex), because the subtitle canvases position themselves against the video's
        // offset parent. Nothing is drawn over the video itself, so it can stay on a hardware
        // overlay plane.
        const stage = pipWindow.document.createElement("div")
        stage.dataset.vcElement = "docpip-stage"
        stage.style.position = "relative"
        stage.style.flex = "1 1 0%"
        stage.style.minHeight = "0"
        stage.style.display = "flex"
        stage.style.alignItems = "center"
        stage.style.justifyContent = "center"
        stage.style.overflow = "hidden"
        body.appendChild(stage)
        return stage
    }

    // Requests a Document PiP window; null when it fails or does not open within 2s.
    private async openDocPipWindow(docPip: DocumentPictureInPicture): Promise<Window | null> {
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

        return Promise.race([request, timeout])
    }

    // The video's subtitle layers: JASSUB's canvas, the PGS canvas and the media-captions overlay.
    // All three are siblings the renderers add next to the <video> — but only for as long as the
    // container holding them is mounted, and every episode change takes it down for a moment while
    // the next stream is set up. The overlays the subtitle manager owns are therefore read from the
    // manager itself, so one that is currently detached is still moved into the PiP window rather
    // than left behind with the episode it belonged to (which is how a new episode could end up
    // playing in the PiP window with no subtitles in it).
    private subtitleLayersOf(video: HTMLVideoElement): HTMLElement[] {
        const parent = video.parentElement
        if (!parent) return []
        const layers = new Set<HTMLElement>()
        const libass = this.subtitleManager?.libassRenderer
        const owned: unknown[] = [
            (libass as any)?._canvasParent ?? (libass as any)?._canvas,
            (this.subtitleManager?.pgsRenderer as any)?._canvas,
        ]
        for (const element of owned) {
            // Not `instanceof`: these elements are created in this window but may already live in
            // the PiP window's document, whose realm has its own HTMLElement.
            if (element && typeof (element as Node).nodeType === "number") layers.add(element as HTMLElement)
        }
        for (const el of Array.from(parent.children)) {
            if (el !== video && el instanceof HTMLElement &&
                el.matches("canvas.JASSUB, canvas.vc-pgs-canvas, #video-core-captions-wrapper")) {
                layers.add(el)
            }
        }
        return [...layers]
    }

    private resizeSubtitleLayers() {
        this.subtitleManager?.pgsRenderer?.resize()
        this.subtitleManager?.libassRenderer?.resize?.()?.catch?.(() => {})
    }

    private enterDocPipWithVideo(pipWindow: Window) {
        const video = this.video
        if (!video || !video.parentElement) {
            pipWindow.close()
            return
        }

        this.docPipController?.abort()
        this.docPipController = new AbortController()
        const signal = this.docPipController.signal

        this.docPipWindow = pipWindow
        this.copyStylesToPipWindow(pipWindow)
        const stage = this.setupDocPipBody(pipWindow)
        this.docPipStage = stage

        // Keep the video playing across the move: Chromium reuses the media player when an
        // element moves into its opener's Document PiP window (and back), so there is no reload.
        const wasPlaying = !video.paused
        const placeholder = document.createComment("vc-docpip-placeholder")
        video.parentElement.insertBefore(placeholder, video)
        this.docPipPlaceholder = placeholder
        const layers = this.subtitleLayersOf(video)
        stage.appendChild(video)
        for (const layer of layers) stage.appendChild(layer)
        if (wasPlaying && video.paused) video.play().catch(() => {})

        // The browser can pause the video as the PiP window goes away ("back to tab", closing it),
        // before "pagehide" moves it home. Remember when a pause comes right after playing, so the
        // restore can tell that apart from the user pausing.
        this.docPipLastPlayingAt = wasPlaying ? performance.now() : 0
        video.addEventListener("pause", () => {
            this.docPipPausedAt = performance.now()
        }, { signal })
        video.addEventListener("playing", () => {
            this.docPipLastPlayingAt = performance.now()
            this.docPipPausedAt = 0
        }, { signal })
        video.addEventListener("timeupdate", () => {
            if (!video.paused) this.docPipLastPlayingAt = performance.now()
        }, { signal })

        // The renderers' ResizeObservers belong to the main window, so resizes in the PiP window
        // are forwarded by hand.
        pipWindow.addEventListener("resize", () => this.resizeSubtitleLayers(), { signal })
        pipWindow.requestAnimationFrame(() => this.resizeSubtitleLayers())

        pipWindow.addEventListener("pagehide", () => {
            this.handleDocPipClosed()
        }, { signal })

        this.onDocPipWindowChange?.(pipWindow)
        this.handleDocPipEntered(video)
    }

    // Moves the video and everything placed next to it in the PiP window (including subtitle
    // layers created there after an episode change) back to where the video was. Idempotent.
    private restoreDocPipNodes() {
        const placeholder = this.docPipPlaceholder
        const stage = this.docPipStage
        this.docPipPlaceholder = null
        this.docPipStage = null
        if (!placeholder || !stage) return

        const video = this.video
        // Paused within the last moment while it had been playing: that pause came from the PiP
        // window closing, not from the user, so playback carries on.
        const now = performance.now()
        const pausedByClose = !!video && video.paused && this.docPipPausedAt > 0
            && now - this.docPipPausedAt < 400 && this.docPipPausedAt - this.docPipLastPlayingAt < 400
        const wasPlaying = !!video && (!video.paused || pausedByClose)
        this.docPipPausedAt = 0
        this.docPipLastPlayingAt = 0
        const parent = placeholder.parentNode
        const nodes = Array.from(stage.childNodes)
        if (parent) {
            for (const node of nodes) parent.insertBefore(node, placeholder)
            placeholder.remove()
        }
        // Without a parent the player was unmounted while in PiP; the nodes are left to close
        // with the window.
        if (video && wasPlaying && video.paused && video.isConnected) video.play().catch(() => {})
        requestAnimationFrame(() => this.resizeSubtitleLayers())
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
        lastRenderTimeRef: { current: number },
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

        // The PiP stream is capped at 30fps; avoid doing canvas and subtitle work on
        // every source frame when the main video is running at 60fps or higher.
        if (now === undefined || now - lastRenderTimeRef.current >= 1000 / 30) {
            lastRenderTimeRef.current = now ?? performance.now()
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
        }

        animationFrameRef.current = this.video.requestVideoFrameCallback(this.renderToCanvas(pipVideo, context, animationFrameRef, lastRenderTimeRef))
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

    private async enterPipWithSubtitles(docPip: DocumentPictureInPicture | null = null) {
        if (!this.video || (!docPip && !this.subtitleManager && !this.mediaCaptionsManager)) return

        const canvas = document.createElement("canvas")
        const context = canvas.getContext("2d")
        if (!context) {
            log.error("Failed to get canvas context")
            return
        }

        const pipVideo = this.newPipVideo()
        pipVideo.srcObject = canvas.captureStream(30)
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
        const lastRenderTimeRef = { current: performance.now() }

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
            this.renderToCanvas(pipVideo, context, animationFrameRef, lastRenderTimeRef)(performance.now())

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

            // With GPU-optimized playback on, Document PiP moves the real video instead and this
            // stream only feeds the native video PiP. With it off, the stream feeds the Document
            // PiP window when one opens.
            const pipWindow = docPip ? await this.openDocPipWindow(docPip) : null
            if (pipWindow) {
                this.docPipWindow = pipWindow
                this.onDocPipWindowChange?.(pipWindow)
                this.copyStylesToPipWindow(pipWindow)
                const stage = this.setupDocPipBody(pipWindow)
                pipVideo.style.width = "100%"
                pipVideo.style.height = "100%"
                pipVideo.style.minHeight = "0"
                pipVideo.style.objectFit = "contain"
                stage.appendChild(pipVideo)
                // The same light vignette the main player draws over its picture.
                const vignette = pipWindow.document.createElement("div")
                vignette.style.position = "absolute"
                vignette.style.inset = "0"
                vignette.style.pointerEvents = "none"
                vignette.style.background = "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.15) 75%, rgba(0,0,0,0.35) 100%)"
                stage.appendChild(vignette)

                pipWindow.addEventListener("pagehide", () => {
                    this.handleDocPipClosed()
                }, { signal: this.canvasController.signal })

                this.handleDocPipEntered(pipVideo)
            } else {
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
