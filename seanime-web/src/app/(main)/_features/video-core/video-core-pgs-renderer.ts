import { logger } from "@/lib/helpers/debug"

interface VideoCorePgsRendererOptions {
    videoElement: HTMLVideoElement
    debug?: boolean
}

export interface PgsEvent {
    startTime: number // in seconds
    duration: number // in seconds
    imageData: string // base64 encoded PNG
    width: number // image width
    height: number // image height
    x?: number // position on canvas
    y?: number // position on canvas
    canvasWidth?: number // total canvas dimensions
    canvasHeight?: number
    cropX?: number
    cropY?: number
    cropWidth?: number
    cropHeight?: number
}

const log = logger("PGS RENDERER")

// Timing-only copy of an event, kept sorted on the main thread so it can tell when playback crosses
// an event boundary without asking the worker every frame.
interface PgsTiming {
    key: string
    start: number
    end: number
}

// Same lookback as the worker: earlier events checked when the latest-starting one has ended.
const OVERLAP_LOOKBACK = 4

function pgsEventKey(event: PgsEvent) {
    return `${event.startTime}-${event.duration}-${event.imageData.substring(0, 50)}`
}

type VideoWithFrameCallback = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, metadata: { mediaTime: number }) => void) => number
    cancelVideoFrameCallback?: (handle: number) => void
}

export class VideoCorePgsRenderer {
    _canvas: HTMLCanvasElement | null = null
    private _videoElement: HTMLVideoElement
    private _worker: Worker | null = null
    private _animationFrameId: number | null = null
    private _videoFrameCallbackId: number | null = null
    private _timings: PgsTiming[] = []
    private _timingKeys = new Set<string>()
    private _timeOffset = 0
    // Key of the event the worker was last told to show ("" = none, null = never told).
    private _postedKey: string | null = null
    private _onSeeked = () => this._check(true)
    private _debug: boolean = false
    private _isDestroyed: boolean = false
    private _canvasWidth: number = 0
    private _canvasHeight: number = 0
    private _resizeObserver: ResizeObserver | null = null

    constructor(options: VideoCorePgsRendererOptions) {
        this._videoElement = options.videoElement
        this._debug = options.debug ?? false
        this._setupCanvas()
        this._setupWorker()
        this._startRenderLoop()
    }

    addEvent(event: PgsEvent) {
        if (!this._worker) {
            return
        }

        this._worker.postMessage({
            type: "addEvent",
            payload: event,
        })
        if (this._addTiming(event)) this._check(true)
    }

    addEvents(events: PgsEvent[]) {
        if (!this._worker || events.length === 0) {
            return
        }

        this._worker.postMessage({
            type: "addEvents",
            payload: events,
        })
        let added = false
        for (const event of events) {
            if (this._addTiming(event)) added = true
        }
        if (added) this._check(true)
    }

    resize() {
        if (!this._canvas || !this._worker) {
            return
        }

        const videoContentSize = this._getRenderedVideoContentSize(
            this._videoElement.clientWidth,
            this._videoElement.clientHeight,
        )
        if (!videoContentSize) {
            return
        }

        const { displayedWidth, displayedHeight, offsetX, offsetY } = videoContentSize

        // Store dimensions for render loop
        this._canvasWidth = displayedWidth
        this._canvasHeight = displayedHeight

        // Update canvas style (position and display size)
        // devnote: can't modify width/height after transferControlToOffscreen
        this._canvas.style.width = `${displayedWidth}px`
        this._canvas.style.height = `${displayedHeight}px`
        this._canvas.style.left = `${offsetX}px`
        this._canvas.style.top = `${offsetY}px`

        // Notify worker of resize to update internal canvas dimensions
        this._worker.postMessage({
            type: "resize",
            payload: {
                width: displayedWidth,
                height: displayedHeight,
            },
        })

        if (this._debug) {
            log.info("Resized canvas", {
                width: displayedWidth,
                height: displayedHeight,
                left: offsetX,
                top: offsetY,
            })
        }
    }

    setTimeOffset(offset: number) {
        if (!this._worker) {
            return
        }

        this._timeOffset = offset
        this._worker.postMessage({
            type: "setTimeOffset",
            payload: { offset },
        })
        this._check(true)
    }

    stop() {
        // no-op
    }

    clear() {
        if (!this._worker) {
            return
        }

        this._timings = []
        this._timingKeys.clear()
        this._postedKey = null
        this._worker.postMessage({
            type: "clear",
        })
    }

    destroy() {
        this._isDestroyed = true

        if (this._animationFrameId !== null) {
            cancelAnimationFrame(this._animationFrameId)
            this._animationFrameId = null
        }
        const video = this._videoElement as VideoWithFrameCallback
        if (this._videoFrameCallbackId !== null) {
            video.cancelVideoFrameCallback?.(this._videoFrameCallbackId)
            this._videoFrameCallbackId = null
        }
        this._videoElement.removeEventListener("seeked", this._onSeeked)

        // Terminate worker
        if (this._worker) {
            this._worker.terminate()
            this._worker = null
        }

        // Clean up resize observer
        if (this._resizeObserver) {
            this._resizeObserver.disconnect()
            this._resizeObserver = null
        }

        if (this._canvas && this._canvas.parentElement) {
            this._canvas.parentElement.removeChild(this._canvas)
        }

        this._canvas = null
    }

    private _setupCanvas() {
        // Create canvas element
        this._canvas = document.createElement("canvas")
        this._canvas.style.position = "absolute"
        this._canvas.style.pointerEvents = "none"
        this._canvas.style.zIndex = "10"
        this._canvas.style.objectFit = "contain"
        this._canvas.style.objectPosition = "center"
        this._canvas.className = "vc-pgs-canvas"

        // Insert canvas after video element
        const parent = this._videoElement.parentElement
        if (parent) {
            parent.style.position = "relative"
            parent.appendChild(this._canvas)
        }

        // Set initial size before transferring
        const videoContentSize = this._getRenderedVideoContentSize(
            this._videoElement.clientWidth,
            this._videoElement.clientHeight,
        )
        if (videoContentSize) {
            const { displayedWidth, displayedHeight, offsetX, offsetY } = videoContentSize
            this._canvas.width = displayedWidth
            this._canvas.height = displayedHeight
            this._canvasWidth = displayedWidth
            this._canvasHeight = displayedHeight
            this._canvas.style.width = `${displayedWidth}px`
            this._canvas.style.height = `${displayedHeight}px`
            this._canvas.style.left = `${offsetX}px`
            this._canvas.style.top = `${offsetY}px`
        }

        // Add resize observer to handle video element size changes
        this._setupResizeObserver()
    }

    private _setupWorker() {
        if (!this._canvas) {
            return
        }

        this._worker = new window.Worker("/pgs-renderer.worker.js")

        // Handle messages
        this._worker.onmessage = (e) => {
            const { type, payload } = e.data

            if (type === "debug" && this._debug) {
                log.info(payload.message, payload.data)
            } else if (type === "error") {
                log.error(payload.message, payload.error)
            }
        }

        // Transfer canvas to worker
        const offscreenCanvas = this._canvas.transferControlToOffscreen()
        this._worker.postMessage({
            type: "init",
            payload: {
                canvas: offscreenCanvas,
                debug: this._debug,
            },
        }, [offscreenCanvas])
    }

    private _setupResizeObserver() {
        if (!this._videoElement || !this._canvas) return

        let resizeRafId: number | null = null
        this._resizeObserver = new ResizeObserver((entries) => {
            if (!this._canvas || !this._worker || !entries[0]) {
                return
            }
            // batch reads and writes
            if (resizeRafId !== null) return
            const { width, height } = entries[0].contentRect
            resizeRafId = requestAnimationFrame(() => {
                resizeRafId = null
                if (!this._canvas || !this._worker) return
                const videoContentSize = this._getRenderedVideoContentSize(width, height)
                if (!videoContentSize) return

                const { displayedWidth, displayedHeight, offsetX, offsetY } = videoContentSize
                this._canvasWidth = displayedWidth
                this._canvasHeight = displayedHeight
                // batch all style writes together
                this._canvas.style.width = `${displayedWidth}px`
                this._canvas.style.height = `${displayedHeight}px`
                this._canvas.style.left = `${offsetX}px`
                this._canvas.style.top = `${offsetY}px`
                this._worker.postMessage({
                    type: "resize",
                    payload: { width: displayedWidth, height: displayedHeight },
                })
                if (this._debug) {
                    log.info("Resized canvas", { width: displayedWidth, height: displayedHeight, left: offsetX, top: offsetY })
                }
            })
        })

        this._resizeObserver.observe(this._videoElement)
    }

    // Runs once per presented video frame (requestVideoFrameCallback), which is when the picture
    // the subtitle belongs to can change, and asks the worker to draw only when that crosses an
    // event boundary. Browsers without rVFC fall back to rAF with the same boundary check.
    private _startRenderLoop() {
        const video = this._videoElement as VideoWithFrameCallback
        video.addEventListener("seeked", this._onSeeked)

        if (typeof video.requestVideoFrameCallback === "function") {
            const onFrame = (_now: number, metadata: { mediaTime: number }) => {
                if (this._isDestroyed) return
                this._check(false, metadata.mediaTime)
                this._videoFrameCallbackId = video.requestVideoFrameCallback!(onFrame)
            }
            this._videoFrameCallbackId = video.requestVideoFrameCallback(onFrame)
        } else {
            const render = () => {
                if (this._isDestroyed) return
                if (!video.paused || video.seeking) this._check(false)
                this._animationFrameId = requestAnimationFrame(render)
            }
            this._animationFrameId = requestAnimationFrame(render)
        }

        this._check(true)
    }

    // Returns true when the timing was new.
    private _addTiming(event: PgsEvent) {
        const key = pgsEventKey(event)
        if (this._timingKeys.has(key)) return false
        this._timingKeys.add(key)
        const timing = { key, start: event.startTime, end: event.startTime + event.duration }
        const idx = this._upperBound(timing.start)
        this._timings.splice(idx, 0, timing)
        return true
    }

    private _upperBound(time: number) {
        let lo = 0
        let hi = this._timings.length
        while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (this._timings[mid].start <= time) lo = mid + 1
            else hi = mid
        }
        return lo
    }

    private _activeKey(time: number) {
        const last = this._upperBound(time) - 1
        for (let i = last; i >= 0 && i >= last - OVERLAP_LOOKBACK; i--) {
            if (time <= this._timings[i].end) return this._timings[i].key
        }
        return ""
    }

    private _check(force: boolean, mediaTime?: number) {
        if (!this._worker || this._isDestroyed) return
        const currentTime = mediaTime ?? this._videoElement.currentTime
        const key = this._activeKey(currentTime + this._timeOffset)
        if (!force && key === this._postedKey) return
        this._postedKey = key
        this._worker.postMessage({
            type: "render",
            payload: {
                currentTime,
                canvasWidth: this._canvasWidth,
                canvasHeight: this._canvasHeight,
                isPlaying: !this._videoElement.paused,
            },
        })
    }

    private _getRenderedVideoContentSize(containerWidth: number, containerHeight: number) {
        const videoWidth = this._videoElement.videoWidth
        const videoHeight = this._videoElement.videoHeight

        if (!videoWidth || !videoHeight) return null

        const containerRatio = containerWidth / containerHeight
        const videoRatio = videoWidth / videoHeight

        let displayedWidth: number
        let displayedHeight: number
        let offsetX = 0
        let offsetY = 0

        if (videoRatio > containerRatio) {
            displayedWidth = containerWidth
            displayedHeight = containerWidth / videoRatio
            offsetY = (containerHeight - displayedHeight) / 2
        } else {
            displayedHeight = containerHeight
            displayedWidth = containerHeight * videoRatio
            offsetX = (containerWidth - displayedWidth) / 2
        }

        return { displayedWidth, displayedHeight, offsetX, offsetY }
    }
}
