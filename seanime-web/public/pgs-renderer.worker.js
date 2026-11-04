// Web Worker for PGS rendering.
//
// The main thread only sends a "render" message when playback crosses an event boundary (or after
// a seek, resize, offset change or new events), so this worker does work a few times per subtitle,
// not once per frame. The canvas is cleared only when the shown event changes.
let ctx = null
let offscreenCanvas = null
// Sorted by startTime. Each entry is the event as received plus `bitmap` once decoded.
let events = []
const eventKeys = new Set()
let currentEvent = null
let currentEventRendered = false
let lastTime = null
let lastCanvasWidth = 0
let lastCanvasHeight = 0
let timeOffset = 0
let debug = false

// How many earlier events to check when the latest-starting one has already ended. PGS events
// rarely overlap, so a few is plenty.
const OVERLAP_LOOKBACK = 4

function getEventKey(event) {
    return `${event.startTime}-${event.duration}-${event.imageData.substring(0, 50)}`
}

async function decodeImage(base64Data) {
    const response = await fetch(base64Data)
    const blob = await response.blob()
    return createImageBitmap(blob)
}

function logDebug(message, data) {
    if (debug) {
        self.postMessage({
            type: "debug",
            payload: { message, data },
        })
    }
}

// Index of the first event whose startTime is greater than `time`.
function upperBound(time) {
    let lo = 0
    let hi = events.length
    while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (events[mid].startTime <= time) lo = mid + 1
        else hi = mid
    }
    return lo
}

function findEventAt(time) {
    const last = upperBound(time) - 1
    for (let i = last; i >= 0 && i >= last - OVERLAP_LOOKBACK; i--) {
        const event = events[i]
        if (time <= event.startTime + event.duration) return event
    }
    return null
}

function insertEvent(event) {
    const idx = upperBound(event.startTime)
    events.splice(idx, 0, event)
}

async function handleAddEvent(event) {
    const key = getEventKey(event)
    if (eventKeys.has(key)) {
        return
    }
    eventKeys.add(key)
    // Inserted synchronously, so a "render" message that follows finds it even before its image
    // has been decoded.
    insertEvent(event)

    try {
        const bitmap = await decodeImage(event.imageData)
        if (!eventKeys.has(key)) {
            // Cleared while decoding.
            bitmap.close?.()
            return
        }
        event.bitmap = bitmap
        // The image itself is no longer needed; keep only the bitmap.
        event.imageData = ""
        logDebug("Preloaded image", {
            startTime: event.startTime,
            width: bitmap.width,
            height: bitmap.height,
        })
        // The event became current before its image was ready: draw it now.
        if (event === currentEvent && !currentEventRendered) {
            drawCurrent()
        }
    } catch (err) {
        self.postMessage({
            type: "error",
            payload: { message: "Failed to preload image", error: String(err) },
        })
    }
}

function clearCanvas() {
    if (ctx && offscreenCanvas) {
        ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height)
    }
}

function drawCurrent() {
    if (!currentEvent) return
    if (renderEvent(currentEvent, lastCanvasWidth, lastCanvasHeight)) {
        currentEventRendered = true
    }
}

function handleRender(payload) {
    if (!ctx || !offscreenCanvas) {
        return
    }

    if (payload.canvasWidth) lastCanvasWidth = payload.canvasWidth
    if (payload.canvasHeight) lastCanvasHeight = payload.canvasHeight
    lastTime = payload.currentTime
    const currentTime = payload.currentTime + timeOffset

    const eventToDisplay = findEventAt(currentTime)

    if (eventToDisplay === currentEvent) {
        if (eventToDisplay && !currentEventRendered) drawCurrent()
        return
    }

    clearCanvas()
    currentEventRendered = false

    if (eventToDisplay) {
        logDebug("Displaying new PGS event", {
            currentTime,
            startTime: eventToDisplay.startTime,
            endTime: eventToDisplay.startTime + eventToDisplay.duration,
            canvasWidth: offscreenCanvas.width,
            canvasHeight: offscreenCanvas.height,
        })
    } else if (currentEvent) {
        logDebug("Cleared PGS event", { currentTime })
    }

    currentEvent = eventToDisplay
    drawCurrent()
}

// Returns false when the image is not decoded yet.
function renderEvent(event, canvasWidth, canvasHeight) {
    if (!ctx || !offscreenCanvas) {
        return false
    }

    const img = event.bitmap
    if (!img) {
        return false
    }

    if (!canvasWidth) canvasWidth = offscreenCanvas.width
    if (!canvasHeight) canvasHeight = offscreenCanvas.height

    // Video canvas dimensions from event or use canvas size
    const videoCanvasWidth = event.canvasWidth || canvasWidth
    const videoCanvasHeight = event.canvasHeight || canvasHeight

    // Scale factors
    const scaleX = canvasWidth / videoCanvasWidth
    const scaleY = canvasHeight / videoCanvasHeight

    // Position (default to bottom center if not specified)
    let x = event.x !== undefined ? event.x : (videoCanvasWidth - event.width) / 2
    let y = event.y !== undefined ? event.y : videoCanvasHeight - event.height - 20

    // Apply scaling
    x *= scaleX
    y *= scaleY

    const width = event.width * scaleX
    const height = event.height * scaleY

    logDebug("Rendering PGS image", {
        x,
        y,
        width,
        height,
        scaleX,
        scaleY,
        imgWidth: img.width,
        imgHeight: img.height,
    })

    // Handle cropping if specified
    if (event.cropX !== undefined && event.cropY !== undefined &&
        event.cropWidth !== undefined && event.cropHeight !== undefined) {
        ctx.drawImage(
            img,
            event.cropX, event.cropY, event.cropWidth, event.cropHeight,
            x, y, width, height,
        )
    } else {
        ctx.drawImage(img, x, y, width, height)
    }

    if (debug) {
        // Draw translucent overlay over entire canvas when subtitle is present
        ctx.fillStyle = "rgba(255, 0, 255, 0.1)"
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // Draw debug border around subtitle
        ctx.strokeStyle = "purple"
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, width, height)
    }
    return true
}

function handleResize(payload) {
    if (!offscreenCanvas) {
        return
    }

    // Setting width/height wipes the canvas, so the current event is drawn again at the new size.
    offscreenCanvas.width = payload.width
    offscreenCanvas.height = payload.height
    lastCanvasWidth = payload.width
    lastCanvasHeight = payload.height
    currentEventRendered = false
    drawCurrent()

    logDebug("Resized canvas", {
        width: payload.width,
        height: payload.height,
    })
}

function handleClear() {
    for (const event of events) event.bitmap?.close?.()
    events = []
    eventKeys.clear()
    currentEvent = null
    currentEventRendered = false
    clearCanvas()
}

self.onmessage = async (e) => {
    const { type, payload } = e.data

    switch (type) {
        case "init":
            offscreenCanvas = payload.canvas
            if (offscreenCanvas) {
                ctx = offscreenCanvas.getContext("2d", { alpha: true })
                debug = payload.debug ?? false
                logDebug("Worker initialized", {
                    width: offscreenCanvas.width,
                    height: offscreenCanvas.height,
                })
            }
            break

        case "addEvent":
            await handleAddEvent(payload)
            break

        case "addEvents":
            await Promise.all(payload.map(ev => handleAddEvent(ev)))
            break

        case "render":
            handleRender(payload)
            break

        case "resize":
            handleResize(payload)
            break

        case "clear":
            handleClear()
            break

        case "setTimeOffset":
            timeOffset = payload.offset
            if (lastTime !== null) handleRender({ currentTime: lastTime })
            break

        case "setDebug":
            debug = payload.debug
            break
    }
}
