import { getServerBaseUrl } from "@/api/client/server-url"
import { MKVParser_AttachmentInfo, MKVParser_SubtitleEvent, MKVParser_TrackInfo } from "@/api/generated/types"
import { VideoCorePgsRenderer } from "@/app/(main)/_features/video-core/video-core-pgs-renderer"
import { vc_getSubtitleStyle } from "@/app/(main)/_features/video-core/video-core-settings-menu"
import { PerMediaTrackOverride, VideoCore_VideoPlaybackInfo, VideoCore_VideoSubtitleTrack, VideoCoreSettings } from "@/app/(main)/_features/video-core/video-core.atoms"
import { logger } from "@/lib/helpers/debug"
import { detectTrackLanguage, trackMatchesLanguage } from "@/lib/helpers/language"
import { getAssetUrl } from "@/lib/server/assets"
import JASSUB from "jassub"
import type { ASSEvent } from "jassub/dist/worker/util"
import { toast } from "sonner"

const modernWasmUrl = "/jassub/jassub-worker-modern.wasm"
const wasmUrl = "/jassub/jassub-worker.wasm"
const workerUrl = "/jassub/jassub-worker.js"

const subtitleLog = logger("VIDEO CORE SUBTITLES")

const NO_TRACK_NUMBER = -1
const DEFAULT_FONT_NAME = "roboto medium"

// Font bytes fetched on the main thread so we can validate them before handing them to
// libass. Feeding libass a failed response (the SPA fallback serves index.html with HTTP
// 200 for dead URLs) poisons it with "Error opening memory font" entries and triggers a
// per-glyph fallback search on every rendered frame — visible as playback lag and
// completely missing subtitles when the track's own font is the broken one.
// Cached by a stable key (attachment filename / asset URL) so episodes of the same series
// don't refetch identical fonts.
const fontDataCache = new Map<string, Uint8Array | null>()

async function fetchFontData(url: string, cacheKey: string = url): Promise<Uint8Array | null> {
    if (fontDataCache.has(cacheKey)) return fontDataCache.get(cacheKey) ?? null
    let data: Uint8Array | null = null
    try {
        const res = await fetch(url)
        const contentType = res.headers.get("content-type") || ""
        if (res.ok && !contentType.includes("text/html") && !contentType.includes("application/json")) {
            const buf = await res.arrayBuffer()
            if (buf.byteLength > 0) {
                data = new Uint8Array(buf)
            }
        }
        if (!data) {
            subtitleLog.warning("Font failed to load, skipping", url, res.status, contentType)
        }
    }
    catch (e) {
        subtitleLog.warning("Font fetch error, skipping", url, e)
    }
    fontDataCache.set(cacheKey, data)
    return data
}

// Subtitle files are extracted in the background on the server right after a stream starts
// (mediastream caches the media container immediately so playback can begin, and extracts
// attachments afterwards). A track auto-selected during that window — e.g. the saved
// per-series caption being re-applied on the next episode — can hit a 404/500 (or an empty
// file) before extraction finishes; re-selecting the same track seconds later works, which
// is why the auto-applied selection used to silently leave the episode without subtitles.
// Retry with backoff so auto-applied selections survive the extraction window. External URLs
// (hotlink-protected CDNs) are fetched once: their failures are permanent, not a race.
// A definitive server-side failure (e.g. "subtitle extraction failed") is not retried:
// the outcome is the same every time, so retrying only delays the error toast.
const EXTRACTION_FAILED_MARKERS = ["extraction failed", "subtitles not ready", "attachments not ready"]

async function fetchSubtitleTextWithRetry(
    url: string,
    isCancelled: () => boolean,
): Promise<string> {
    const maxAttempts = url.includes("/api/v1/") ? 8 : 1
    let lastStatus: number | string = "network error"
    let definitiveError: string | null = null
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (isCancelled()) throw new Error("Track selection changed")
        if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, Math.min(500 * attempt, 2000)))
        }
        try {
            const res = await fetch(url)
            if (res.ok) {
                const text = await res.text()
                if (text.trim().length > 0) return text
                lastStatus = "empty response"
            }
            else {
                lastStatus = `HTTP ${res.status}`
                // A definitive failure won't change on retry — capture the server's
                // reason and stop looping.
                try {
                    const body = await res.text()
                    if (EXTRACTION_FAILED_MARKERS.some(marker => body.toLowerCase().includes(marker))) {
                        definitiveError = body.trim().slice(0, 160)
                    }
                }
                catch { /* body unreadable, keep retrying */ }
            }
        }
        catch {
            lastStatus = "network error"
        }
        if (definitiveError) break
    }
    if (definitiveError) throw new Error(`Subtitle track unavailable (${definitiveError})`)
    throw new Error(`Subtitle track unavailable (${lastStatus})`)
}

// One JASSUB instance (worker + WASM + loaded fonts) shared across subtitle managers.
//
// The manager is destroyed and recreated on every episode transition, and a fresh JASSUB
// means spawning a worker, fetching + compiling the WASM and reloading fonts — observed to
// take many seconds mid-playback (the network is busy streaming the new episode), during
// which selectTrack is blocked and the episode plays without subtitles. Reusing the
// renderer makes track selection on episode 2+ effectively instant.
// The instance is only torn down if reuse fails (worker died), in which case a fresh one
// is created.
let sharedRenderer: JASSUB | null = null
// The manager currently driving the shared renderer; prevents a late destroy() of a
// previous manager from blanking the track of the current one.
let sharedRendererOwner: VideoCoreSubtitleManager | null = null
// Stable keys of fonts already loaded into the shared renderer's libass instance, so the
// same fonts aren't re-added (and re-buffered) on every episode of a series.
const sharedRendererLoadedFontKeys = new Set<string>()
// Font attachments are loaded in the background (they can be hundreds of files and block
// for a long time on a fresh stream); these dedupe concurrent loads per renderer instance.
let sharedFontLoadRenderer: JASSUB | null = null
let sharedFontLoadPromise: Promise<void> | null = null

function hexToASSColor(hex: string, alpha: number = 0): number {
    hex = hex.replace(/^#/, "")
    if (hex.length === 3) {
        hex = hex.split("").map(c => c + c).join("")
    }
    const val = parseInt(hex, 16)
    const r = (val >> 16) & 0xFF
    const g = (val >> 8) & 0xFF
    const b = val & 0xFF
    return ((r << 24) | (g << 16) | (b << 8) | alpha) >>> 0
}

function isPGS(str: string) {
    return str === "S_HDMV/PGS"
}

// Event or file track info.
export type NormalizedTrackInfo = {
    type: "event" | "file"
    language?: string
    languageIETF?: string
    codecID?: string
    label?: string
    number: number
    forced: boolean
    default: boolean
}

export type SubtitleManagerTrackSelectedEvent = CustomEvent<{ trackNumber: number, kind: "file" | "event" }>
export type SubtitleManagerTrackDeselectedEvent = CustomEvent
export type SubtitleManagerTrackAddedEvent = CustomEvent<{ track: NormalizedTrackInfo }>
export type SubtitleManagerTracksLoadedEvent = CustomEvent<{ tracks: NormalizedTrackInfo[] }>
export type SubtitleManagerDestroyedEvent = CustomEvent
export type SubtitleManagerSettingsUpdatedEvent = CustomEvent<{ settings: VideoCoreSettings }>

interface VideoCoreSubtitleManagerEventMap {
    "trackselected": SubtitleManagerTrackSelectedEvent
    "trackdeselected": SubtitleManagerTrackDeselectedEvent
    "trackadded": SubtitleManagerTrackAddedEvent
    "tracksloaded": SubtitleManagerTracksLoadedEvent
    "destroyed": SubtitleManagerDestroyedEvent
    "settingsupdated": SubtitleManagerSettingsUpdatedEvent
}

type CachedEvent = {
    event: MKVParser_SubtitleEvent
    assEvent: ASSEvent
    translatedAssEvent?: ASSEvent
    isTranslating?: boolean
}

// Manages ASS and PGS subtitle streams.
export class VideoCoreSubtitleManager extends EventTarget {
    private readonly videoElement: HTMLVideoElement
    private readonly jassubOffscreenRender: boolean
    libassRenderer: JASSUB | null = null
    pgsRenderer: VideoCorePgsRenderer | null = null
    private libassLoadedMetadataListener: (() => void) | null = null
    private libassFullscreenListener: (() => void) | null = null
    private libassHealthListener: (() => void) | null = null
    private recoveringRenderer = false
    private settings: VideoCoreSettings
    private defaultSubtitleHeader = `[Script Info]
Title: English (US)
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 640
PlayResY: 360
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default, Roboto Medium,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1.3,0,2,20,20,23,0
[Events]

`

    // Event-based tracks
    private eventTracks: Record<string, {
        info: MKVParser_TrackInfo
        events: Map<string, CachedEvent>
        styles: Record<string, number>
    }> = {}

    // PGS event-based tracks
    private pgsEventTracks: Record<string, {
        info: MKVParser_TrackInfo
        events: Map<string, MKVParser_SubtitleEvent>
    }> = {}

    // URL-based tracks (will use internal API to convert to ASS)
    private fileTracks: Record<string, {
        info: VideoCore_VideoSubtitleTrack
        content: string | null // converted content
    }> = {}

    private readonly fetchAndConvertToASS?: (url?: string, content?: string, headers?: Record<string, string>) => Promise<string | undefined>
    // Sends translate request to the server
    private readonly sendTranslateRequest: (text?: string, track?: VideoCore_VideoSubtitleTrack) => void
    private readonly translateFn?: (event: CachedEvent) => void

    private playbackInfo: VideoCore_VideoPlaybackInfo
    // Per-media (per-series) subtitle preference. When set, the matching track is
    // auto-selected on load so a manually chosen caption carries across episodes.
    private preferredTrackOverride?: PerMediaTrackOverride
    private currentTrackNumber: number = NO_TRACK_NUMBER
    // Set on destroy(). The manager is torn down and recreated around episode transitions
    // while async work (renderer init, track selection, font fetches) is still in flight;
    // finished awaits must bail instead of calling into the released JASSUB worker proxy
    // ("Proxy has been released and is not useable").
    private isDestroyed = false
    private fonts: string[] = []
    private hmacToken: string = ""

    // Holds the in-flight initialisation so concurrent callers await it rather than starting a
    // second one. Cleared on destroy, and on failure, so a manager can always initialise again.
    private initPromise: Promise<void> | null = null

    private _onSelectedTrackChanged?: (track: number | null) => void
    private _onTracksLoaded?: (tracks: NormalizedTrackInfo[]) => void

    // Translation is active
    private translationTargetLang: string | null = null
    private shouldTranslate: string | null = null
    // Event translation queue. Once translated the event is removed
    private eventTranslationQueue = new Map<string, CachedEvent>()
    // Remember the translated file tracks to avoid re-fetching them
    private translatedFileTracks = new Map<number, { translating: boolean }>()

    constructor({
        videoElement,
        jassubOffscreenRender,
        playbackInfo,
        settings,
        fetchAndConvertToASS,
        sendTranslateRequest,
        translateTargetLang,
        hmacToken,
        preferredTrackOverride,
    }: {
        videoElement: HTMLVideoElement
        jassubOffscreenRender: boolean
        playbackInfo: VideoCore_VideoPlaybackInfo
        settings: VideoCoreSettings
        fetchAndConvertToASS: (url?: string, content?: string, headers?: Record<string, string>) => Promise<string | undefined>
        sendTranslateRequest: (text?: string, track?: VideoCore_VideoSubtitleTrack) => void
        translateTargetLang: string | null
        hmacToken?: string
        preferredTrackOverride?: PerMediaTrackOverride
    }) {
        super()
        this.videoElement = videoElement
        this.jassubOffscreenRender = jassubOffscreenRender
        this.playbackInfo = playbackInfo
        this.preferredTrackOverride = preferredTrackOverride
        this.settings = settings
        this.hmacToken = hmacToken || ""
        this.shouldTranslate = translateTargetLang
        this.translationTargetLang = translateTargetLang
        this.fetchAndConvertToASS = fetchAndConvertToASS
        this.sendTranslateRequest = sendTranslateRequest
        this.translateFn = function (cached: CachedEvent) {
            cached.isTranslating = true
            // Send the request to the server
            this.sendTranslateRequest?.(cached.event.text)
            // Add it to the queue
            this.eventTranslationQueue.set(cached.event.text, cached)
        }

        /*
         * Event Tracks
         */
        if (this.playbackInfo?.mkvMetadata?.subtitleTracks) {
            for (const track of this.playbackInfo.mkvMetadata.subtitleTracks) {
                this._addEventTrack(track)
            }
            this._storeEventTrackStyles()
        }

        /*
         * File Tracks
         *
         * Every track is registered, not just the libass ones: a source mixing ASS and SRT
         * tracks used to lose whichever half the other manager didn't take. Non-ASS tracks
         * are fetched and converted to ASS on selection (_handleFileTrack), same as before.
         */
        if (this.playbackInfo?.subtitleTracks) {
            let trackNumber = 1000
            for (const track of this.playbackInfo.subtitleTracks) {
                this.fileTracks[trackNumber] = {
                    info: {
                        ...track,
                        index: trackNumber,
                    },
                    content: null,
                }
                trackNumber++
            }
        }

        this._onTracksLoaded?.(this._getTracks())

        // Select default track if we have any tracks
        if (this.playbackInfo?.mkvMetadata?.subtitleTracks || Object.keys(this.fileTracks).length > 0) {
            this._selectDefaultTrack()
        }

        // Apply subtitle delay from settings
        this.setSubtitleDelay(settings.subtitleDelay)

        subtitleLog.info("Text tracks", this.videoElement.textTracks)
        subtitleLog.info("Event Tracks", this.eventTracks)
        subtitleLog.info("PGS Event Tracks", this.pgsEventTracks)
        subtitleLog.info("File tracks", this.fileTracks)
    }

    /**
     * Initialisation, run once however many callers ask for it.
     *
     * Ported from upstream v3.9.x (`fix(videocore): subtitle renderer race`), which memoised this
     * behind a promise. The race it fixes is present here too, and costs more: two callers reaching
     * the guard below before either has finished both build a renderer, and the second overwrites
     * the first. Upstream leaks an orphaned renderer still attached to the video element; we also
     * overwrite the module-level `sharedRenderer`, so the orphan becomes the one nothing can ever
     * reach to destroy — it keeps drawing over the canvas of the episode that replaced it.
     *
     * Everything our version does differently is kept: the renderer shared across episodes, the
     * isDestroyed guards, the font-query and resize workarounds. Only the concurrency rule is
     * taken from upstream — awaiting one initialisation rather than starting a second.
     */
    private async _init(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise
        }

        this.initPromise = this._initOnce()

        try {
            await this.initPromise
        }
        catch (e) {
            // A failed initialisation must not be cached as though it had succeeded, or the
            // renderer can never recover for the life of this manager.
            this.initPromise = null
            throw e
        }
    }

    private async _initOnce() {
        if (!this.libassRenderer && !this.isDestroyed) {
            try {
                const defaultFontUrl = "/fonts/Roboto-Medium.ttf"

                // Try to reuse the shared renderer from the previous episode first
                if (sharedRenderer) {
                    try {
                        subtitleLog.info("Reusing existing libass renderer")
                        await sharedRenderer.ready
                        if (this.isDestroyed) return
                        // Re-attach the canvas wrapper next to the current video element —
                        // the previous episode's wrapper location unmounted with its video.
                        const canvasParent = (sharedRenderer as any)._canvasParent as HTMLDivElement | undefined
                        if (canvasParent && this.videoElement.nextElementSibling !== canvasParent) {
                            this.videoElement.insertAdjacentElement("afterend", canvasParent)
                        }
                        await sharedRenderer.setVideo(this.videoElement)
                        if (this.isDestroyed) return
                        // Reusing the renderer must release the prior episode's track before
                        // installing the blank track; setTrack() adds tracks rather than replacing them.
                        sharedRenderer.busy = false
                        await this._freeLibassTrack(sharedRenderer)
                        if (this.isDestroyed) return
                        await sharedRenderer.renderer.setTrack(this.defaultSubtitleHeader)
                        sharedRenderer.resize(true)?.catch?.(() => {})
                        this.libassRenderer = sharedRenderer
                        sharedRendererOwner = this
                        subtitleLog.info("Libass renderer reused")
                    }
                    catch (e) {
                        subtitleLog.warning("Failed to reuse libass renderer, creating a fresh one", e)
                        try {
                            sharedRenderer.destroy()
                        }
                        catch {
                        }
                        sharedRenderer = null
                        sharedRendererOwner = null
                        sharedRendererLoadedFontKeys.clear()
                        this.libassRenderer = null
                    }
                }

                if (!this.libassRenderer) {
                    if (this.isDestroyed) return
                    subtitleLog.info("Initializing libass renderer")

                    sharedRenderer = new JASSUB({
                        video: this.videoElement,
                        subContent: this.defaultSubtitleHeader,
                        wasmUrl: wasmUrl,
                        workerUrl: workerUrl,
                        modernWasmUrl: modernWasmUrl,
                        fonts: [],
                        defaultFont: DEFAULT_FONT_NAME,
                        availableFonts: {
                            [DEFAULT_FONT_NAME]: defaultFontUrl,
                        },
                        // Never query local/remote fonts on glyph misses: each miss round-trips
                        // to the main thread and stacks another broken "memory font" in libass,
                        // on every rendered frame — a major source of playback stutter whenever
                        // a track references a font we don't have. Missing glyphs simply render
                        // with the default font instead.
                        queryFonts: false,
                        maxRenderHeight: 1080,
                        debug: false,
                    })
                    this.libassRenderer = sharedRenderer
                    sharedRendererOwner = this

                    subtitleLog.info("Waiting for libass renderer...")
                    await this.libassRenderer.ready
                    subtitleLog.info("Libass renderer ready")
                    if (this.isDestroyed) return
                }

                // JASSUB can compute a NaN/Infinity canvas size if it resizes (e.g. via its
                // internal ResizeObserver firing as soon as the video element is attached)
                // before the video's intrinsic dimensions (videoWidth/videoHeight) are known,
                // which throws inside the render worker ("not of type unsigned long") and can
                // leave subtitles stuck unrendered. Force a clean resize once real dimensions
                // are available to recover from that race.
                this.libassLoadedMetadataListener = () => {
                    this._applyLibassRenderHeightCap()
                    this.libassRenderer?.resize?.()?.catch?.(e => subtitleLog.warn("Failed to resize libass renderer on loadedmetadata", e))
                }
                this.videoElement.addEventListener("loadedmetadata", this.libassLoadedMetadataListener)

                // Apply the cap right away too: when the renderer attaches to a video that has
                // already loaded (episode switches, or the shared renderer being handed over),
                // "loadedmetadata" has come and gone, so the listener alone would leave the
                // render height at the uncapped 1080 default.
                this._applyLibassRenderHeightCap()

                // Re-apply on fullscreen transitions. JASSUB derives its canvas size from the
                // video element's offset size multiplied by devicePixelRatio, both of which jump
                // on entering fullscreen (a 1.5x-DPI 1440p screen asks for a 2160px-tall overlay).
                // Its ResizeObserver resizes the canvas but never revisits maxRenderHeight, so
                // without this the overlay is re-rendered at full screen resolution on every
                // video frame — which is the fullscreen stutter.
                this.libassFullscreenListener = () => {
                    this._applyLibassRenderHeightCap()
                    this.libassRenderer?.resize?.()?.catch?.(e => subtitleLog.warn("Failed to resize libass renderer on fullscreen change", e))
                }
                document.addEventListener("fullscreenchange", this.libassFullscreenListener)
                document.addEventListener("webkitfullscreenchange", this.libassFullscreenListener)

                // After a long pause the render worker can be suspended or killed, and every
                // later draw then never settles, leaving subtitles dead until a full restart.
                this._removeHealthListeners()
                this.libassHealthListener = () => {
                    if (document.visibilityState === "hidden") return
                    void this._recoverRendererIfUnresponsive()
                }
                this.videoElement.addEventListener("play", this.libassHealthListener)
                this.videoElement.addEventListener("seeked", this.libassHealthListener)
                document.addEventListener("visibilitychange", this.libassHealthListener)

                // Load the fonts in the background instead of awaiting them here: a file can
                // carry hundreds of font attachments, and awaiting every fetch inside
                // _initOnce blocked all track selection on first use — the pick looked dead
                // (menu not updating, nothing rendered) until the fonts finished arriving,
                // which is why subtitles only "worked" after leaving and reopening the
                // player. libass flushes its font cache when fonts are added (the worker's
                // reloadFonts), so tracks already loaded pick them up on the next frame; the
                // background load forces a repaint once done.
                this._startBackgroundFontLoad()
            }
            catch (e) {
                if (this.isDestroyed) return
                subtitleLog.error("Error initializing libass renderer", e)
                toast.error("Error initializing libass renderer: " + e)
            }
        }

        if (!this.pgsRenderer && this.playbackInfo.mkvMetadata?.tracks?.some(t => isPGS(t.codecID))) {
            this.pgsRenderer = new VideoCorePgsRenderer({
                videoElement: this.videoElement,
                // debug: process.env.NODE_ENV === "development",
            })
        }
    }

    /**
     * Kicks off the font load for this playback's attachments without blocking renderer
     * readiness (and therefore track selection). Deduplicated per renderer instance so a
     * manager transition can't start a second concurrent load into the same renderer.
     */
    private _startBackgroundFontLoad() {
        const renderer = this.libassRenderer
        if (!renderer) return
        if (sharedFontLoadPromise && sharedFontLoadRenderer === renderer) return

        sharedFontLoadRenderer = renderer
        sharedFontLoadPromise = this._loadFontsIntoRenderer(renderer).finally(() => {
            if (sharedFontLoadRenderer === renderer) {
                sharedFontLoadRenderer = null
                sharedFontLoadPromise = null
            }
        })
    }

    private async _loadFontsIntoRenderer(renderer: JASSUB) {
        try {
            const defaultFontUrl = "/fonts/Roboto-Medium.ttf"
            // Keyed by attachment filename (stable across episodes of a series, while
            // the URL changes per stream) so fonts already in the shared renderer are
            // neither refetched nor re-added. An attachment may carry its own `_srcUrl`
            // (mediastream synthesized metadata points at its att endpoint; the
            // directstream default below wouldn't serve those fonts).
            const fontEntries = [
                { key: defaultFontUrl, url: defaultFontUrl },
                ...(this.playbackInfo.mkvMetadata?.attachments?.filter(a => a.type === "font")
                    ?.map(a => ({
                        key: `att:${a.filename}`,
                        url: (a as MKVParser_AttachmentInfo & { _srcUrl?: string })._srcUrl
                            || `${getServerBaseUrl()}/api/v1/directstream/att/${a.filename}?id=${this.playbackInfo.id}${this.hmacToken.replace(
                                /^\?/,
                                "&")}`,
                    })) || []),
            ]

            const newEntries = fontEntries.filter(f => !sharedRendererLoadedFontKeys.has(f.key))
            if (newEntries.length === 0) return

            this.fonts = [...new Set(fontEntries.map(f => f.url))]

            // Fetch each font on the main thread and validate it, so a failed request
            // (expired token, missing file, SPA HTML fallback) never reaches libass.
            const fontBuffers: Uint8Array[] = []
            await Promise.all(newEntries.map(async f => {
                const data = await fetchFontData(f.url, f.key)
                if (data) {
                    fontBuffers.push(data)
                    sharedRendererLoadedFontKeys.add(f.key)
                }
            }))

            // The renderer may have been replaced or destroyed while the fonts were in
            // flight; never feed a stale or dead instance.
            if (renderer !== sharedRenderer || fontBuffers.length === 0) return

            subtitleLog.info(`Adding ${fontBuffers.length}/${newEntries.length} fonts to libass renderer`)
            await renderer.renderer.addFonts(fontBuffers)
            // Adding fonts flushes libass's font cache but doesn't redraw by itself; force
            // a repaint so a track selected while the fonts were loading (or a paused
            // video) re-renders with the real fonts instead of the fallback.
            await renderer.resize(true)?.catch?.(e => subtitleLog.warn("Failed to repaint after font load", e))
        }
        catch (e) {
            subtitleLog.warning("Background font load failed", e)
        }
    }

    private _removeHealthListeners() {
        if (!this.libassHealthListener) return
        this.videoElement.removeEventListener("play", this.libassHealthListener)
        this.videoElement.removeEventListener("seeked", this.libassHealthListener)
        document.removeEventListener("visibilitychange", this.libassHealthListener)
        this.libassHealthListener = null
    }

    private async _isRendererHealthy(renderer: JASSUB): Promise<boolean> {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            await Promise.race([
                renderer.resize(false),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("libass worker unresponsive")), 3000)
                }),
            ])
            return true
        }
        catch (e) {
            subtitleLog.warning("Libass renderer unhealthy", e)
            return false
        }
        finally {
            clearTimeout(timer)
        }
    }

    // Throws the dead renderer away and builds a new one. Callers re-select the track afterwards.
    private async _rebuildRenderer() {
        const renderer = this.libassRenderer
        subtitleLog.warning("Recreating libass renderer")

        // Terminate the worker directly; a graceful destroy() would await the dead worker.
        try {
            if (renderer) {
                (renderer as any)._destroyed = true
                ;(renderer as any)._canvas?.remove?.()
                ;(renderer as any)._worker?.terminate?.()
            }
        }
        catch {
        }
        if (sharedRenderer === renderer) {
            sharedRenderer = null
            sharedRendererOwner = null
            sharedRendererLoadedFontKeys.clear()
        }
        this.libassRenderer = null

        if (this.libassFullscreenListener) {
            document.removeEventListener("fullscreenchange", this.libassFullscreenListener)
            document.removeEventListener("webkitfullscreenchange", this.libassFullscreenListener)
            this.libassFullscreenListener = null
        }
        if (this.libassLoadedMetadataListener) {
            this.videoElement.removeEventListener("loadedmetadata", this.libassLoadedMetadataListener)
            this.libassLoadedMetadataListener = null
        }
        this.initPromise = null

        await this._init()
    }

    private async _recoverRendererIfUnresponsive() {
        const renderer = this.libassRenderer
        if (!renderer || this.isDestroyed || this.recoveringRenderer) return
        this.recoveringRenderer = true

        try {
            if (await this._isRendererHealthy(renderer) || this.isDestroyed) return

            const trackNumber = this.currentTrackNumber
            await this._rebuildRenderer()
            if (this.isDestroyed) return
            if (trackNumber !== NO_TRACK_NUMBER) {
                await this.selectTrack(trackNumber)
            }
        }
        catch (e) {
            subtitleLog.error("Failed to recover libass renderer", e)
        }
        finally {
            this.recoveringRenderer = false
        }
    }


    addEventListener<K extends keyof VideoCoreSubtitleManagerEventMap>(
        type: K,
        listener: (this: VideoCoreSubtitleManager, ev: VideoCoreSubtitleManagerEventMap[K]) => any,
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

    removeEventListener<K extends keyof VideoCoreSubtitleManagerEventMap>(
        type: K,
        listener: (this: VideoCoreSubtitleManager, ev: VideoCoreSubtitleManagerEventMap[K]) => any,
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

    getSelectedTrackNumberOrNull(): number | null {
        if (this.currentTrackNumber === NO_TRACK_NUMBER) return null
        return this.currentTrackNumber
    }

    getTrackContent(number: number): string | null {
        return this.fileTracks[number]?.content || null
    }

    // Sets the track to no track.
    setNoTrack() {
        this.currentTrackNumber = NO_TRACK_NUMBER
        this._disableNativeTextTracks()
        this.libassRenderer?.renderer?.setTrack(this.defaultSubtitleHeader)
        this.libassRenderer?.resize?.()?.catch?.(e => subtitleLog.warn("Failed to resize libass renderer", e))
        this.pgsRenderer?.clear()
        this._onSelectedTrackChanged?.(NO_TRACK_NUMBER)

        const event: SubtitleManagerTrackDeselectedEvent = new CustomEvent("trackdeselected")
        this.dispatchEvent(event)
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Selects a track by its number.
    /**
     * Caps the ASS overlay's render resolution to the source video height.
     *
     * JASSUB re-renders the overlay on every video frame. Left uncapped it renders at the
     * displayed size times devicePixelRatio, so a 720p stream in fullscreen on a high-DPI
     * screen pays for a >1080p ARGB canvas per frame — far more pixels than the video
     * itself. Clamping to the source height (kept within 720-1080 for legibility) removes
     * that cost with no visible quality loss, since the video is upscaled to the same size.
     */
    private _applyLibassRenderHeightCap() {
        if (!this.libassRenderer) return
        const videoHeight = this.videoElement?.videoHeight || 0
        if (videoHeight <= 0) return
        this.libassRenderer.maxRenderHeight = Math.min(1080, Math.max(720, videoHeight))
    }

    /**
     * Frees the current subtitle track inside the shared libass instance.
     *
     * The renderer is deliberately shared across episodes so tracks appear instantly, but
     * JASSUB's setTrack is purely additive (createTrackMem never frees the previous track
     * — its own freeTrack exists and nothing calls it). Without this, every episode and
     * every track switch left the previous track's events resident inside libass forever,
     * and libass scans the entire event list on every rendered frame — so a session grew
     * slower the longer it ran and the more events it had seen.
     */
    private async _freeLibassTrack(renderer: JASSUB | null = this.libassRenderer) {
        if (!renderer) return
        await Promise.race([
            Promise.resolve((renderer.renderer as any)?.freeTrack?.()),
            new Promise((_, reject) => setTimeout(() => reject(new Error("freeTrack timed out")), 3000)),
        ])
    }

    private async _replaceLibassTrack(content: string) {
        const renderer = this.libassRenderer
        if (!renderer || this.isDestroyed) return
        try {
            await this._freeLibassTrack(renderer)
        }
        catch (e) {
            if (this.isDestroyed || this.libassRenderer !== renderer) return
            subtitleLog.warning("Rebuilding libass renderer after track cleanup failed", e)
            await this._rebuildRenderer()
        }
        if (this.isDestroyed || !this.libassRenderer) return
        await this.libassRenderer.renderer.setTrack(content)
    }

    async selectTrack(trackNumber: number) {
        subtitleLog.info("Track selection requested", trackNumber)
        if (this.isDestroyed) return

        this.shouldTranslate = this.translationTargetLang

        // if (this.currentTrackNumber === trackNumber) {
        //     subtitleLog.info("Track already selected", trackNumber)
        //     return
        // }

        if (trackNumber === NO_TRACK_NUMBER) {
            subtitleLog.info("No track selected", trackNumber)
            this.setNoTrack()
            return
        }

        const track = this._getTracks()?.find?.(t => t.number === trackNumber)
        subtitleLog.info("Selecting track", trackNumber, track)

        this._disableNativeTextTracks()

        if (!track) {
            subtitleLog.error("Track not found", trackNumber)
            this.setNoTrack()
            return
        }

        // Record the selection and notify the menu BEFORE initialising the renderer:
        // renderer init (or the shared-renderer handover) can take a while on first use,
        // and the menu must reflect the pick immediately instead of appearing dead until
        // init finishes. _handleFileTrack's staleness guards keep an older in-flight load
        // from clobbering this selection.
        this._onSelectedTrackChanged?.(trackNumber)
        this.currentTrackNumber = track.number // update the current track number

        await this._init()
        if (this.isDestroyed) return

        /*
         * File track
         */

        // Check if this is a file track
        // If it is, fetch/convert the content and add it to the libass renderer
        const fileTrack = this.fileTracks[trackNumber]
        if (fileTrack) {
            await this._handleFileTrack(trackNumber, fileTrack)
            return
        }

        /*
         * Event track
         */

        const eventTrack = this.eventTracks[trackNumber]
        if (!eventTrack) {
            subtitleLog.warning("Event track not found", trackNumber)
            return
        }

        // Don't tanslate if the event track language matches the target language
        if (!!this.translationTargetLang && detectTrackLanguage(eventTrack.info) === this.translationTargetLang) {
            subtitleLog.info("Translation target language matches event track language, not translating")
            this.shouldTranslate = null
        }

        // Handle event track
        const codecPrivate = eventTrack.info.codecPrivate?.slice?.(0, -1) || this.defaultSubtitleHeader

        // Check if this is a PGS track
        if (isPGS(eventTrack.info.codecID)) {
            // Clear PGS renderer and libass
            this.pgsRenderer?.clear()
            this.libassRenderer?.renderer?.setTrack(this.defaultSubtitleHeader)

            // Add all cached PGS events from the event map
            const pgsTrack = this.pgsEventTracks[track.number]
            if (pgsTrack?.events) {
                subtitleLog.info("Found", pgsTrack.events.size, "PGS events for track", track.number)
                for (const event of pgsTrack.events.values()) {
                    this._addPgsEvent(event)
                }
                this.pgsRenderer?.resize?.()
            } else {
                subtitleLog.warning("No PGS events found for track", track.number)
            }
        } else {
            // Handle regular ASS/text subtitles
            this.pgsRenderer?.clear()

            // Set the track. JASSUB's setTrack → createTrackMem ADDS the track's events to
            // libass without freeing the previous track (the WASM bindings expose removeTrack
            // for exactly this and the worker never calls it), and this renderer is shared
            // across episodes/track switches — so every selection used to pile another full
            // track's events onto an ever-growing list. Libass scans the whole list on every
            // frame (rawRender), which is why playback degraded the longer it ran and the
            // more words a caption had. Free the old track before adding the new one.
            try {
                await this._freeLibassTrack()
                await this.libassRenderer?.renderer?.setTrack(codecPrivate)
            }
            catch (e) {
                subtitleLog.warning("Setting libass track failed, rebuilding renderer", e)
                await this._rebuildRenderer()
                if (this.isDestroyed) return
                await this.libassRenderer?.renderer?.setTrack(codecPrivate)
            }
            // Apply customization to Default styles
            await this._applySubtitleCustomization()
            if (this.isDestroyed) return

            this._populateEventTrack(trackNumber)
        }

        const selectedEvent: SubtitleManagerTrackSelectedEvent = new CustomEvent("trackselected", { detail: { trackNumber, kind: "event" } })
        this.dispatchEvent(selectedEvent)
    }

    setTrackChangedEventListener(callback: (track: number | null) => void) {
        this._onSelectedTrackChanged = callback
    }

    setTracksLoadedEventListener(callback: ((tracks: NormalizedTrackInfo[]) => void)) {
        this._onTracksLoaded = callback
    }

    destroy() {
        subtitleLog.info("Destroying subtitle manager")
        this.isDestroyed = true
        // Any memoised initialisation belongs to the manager being torn down; leaving it set
        // would hand a destroyed manager's promise to whatever asks next.
        this.initPromise = null
        this._disableNativeTextTracks()
        if (this.libassFullscreenListener) {
            document.removeEventListener("fullscreenchange", this.libassFullscreenListener)
            document.removeEventListener("webkitfullscreenchange", this.libassFullscreenListener)
            this.libassFullscreenListener = null
        }
        if (this.libassLoadedMetadataListener) {
            this.videoElement.removeEventListener("loadedmetadata", this.libassLoadedMetadataListener)
            this.libassLoadedMetadataListener = null
        }
        this._removeHealthListeners()
        // Release the shared renderer instead of destroying it — the next manager (next
        // episode) reuses the live worker so its subtitles appear instantly instead of
        // waiting for a full worker + WASM + font re-initialization mid-playback.
        // Only blank the track if this manager still owns it, so a late destroy can't wipe
        // the next episode's already-selected track.
        if (this.libassRenderer && sharedRendererOwner === this) {
            try {
                this.libassRenderer.renderer?.setTrack(this.defaultSubtitleHeader)
            }
            catch {
            }
            sharedRendererOwner = null
        }
        this.libassRenderer = null
        this.pgsRenderer?.destroy()
        this.pgsRenderer = null
        this.eventTranslationQueue.clear()
        this.translatedFileTracks.clear()
        for (const trackNumber in this.eventTracks) {
            this.eventTracks[trackNumber].events.clear()
        }
        this.eventTracks = {}
        for (const trackNumber in this.pgsEventTracks) {
            this.pgsEventTracks[trackNumber].events.clear()
        }
        this.pgsEventTracks = {}
        this.fileTracks = {}
        this.currentTrackNumber = NO_TRACK_NUMBER

        const event: SubtitleManagerDestroyedEvent = new CustomEvent("destroyed")
        this.dispatchEvent(event)
    }

    private _disableNativeTextTracks() {
        if (!this.videoElement.textTracks) return

        subtitleLog.info("Disabling video element textTracks", this.videoElement.textTracks)
        for (const textTrack of this.videoElement.textTracks) {
            textTrack.mode = "disabled"
        }
        this.videoElement.textTracks.dispatchEvent(new Event("change"))
    }

    getTracks() {
        return this._getTracks()
    }

    getTrack(trackNumber: number | null) {
        return this._getTracks()?.find(t => t.number === (trackNumber ?? NO_TRACK_NUMBER))
    }

    getNextTrackNumber(trackNumber: number | null) {
        const tracks = this._getTracks()
        const nextTrackNumber = tracks.find(t => t.number > (trackNumber ?? NO_TRACK_NUMBER))?.number
        return nextTrackNumber ?? NO_TRACK_NUMBER
    }

    // Update settings and reapply subtitle customization to current track
    async updateSettings(newSettings: VideoCoreSettings) {
        this.settings = newSettings
        // Apply subtitle delay
        await this.setSubtitleDelay(newSettings.subtitleDelay)
        // Reapply customization if a track is currently selected
        if (this.currentTrackNumber !== NO_TRACK_NUMBER) {
            await this._applySubtitleCustomization()
        }

        // Dispatch Settings Updated Event
        const event: SubtitleManagerSettingsUpdatedEvent = new CustomEvent("settingsupdated", { detail: { settings: newSettings } })
        this.dispatchEvent(event)
    }

    updateShouldTranslate(shouldTranslate: string | null) {
        subtitleLog.info("Updating shouldTranslate setting", shouldTranslate)
        // If translation settings changed, we need to refresh the current track
        const translationChanged = this.shouldTranslate !== shouldTranslate
        this.shouldTranslate = shouldTranslate
        this.translationTargetLang = shouldTranslate

        if (translationChanged && this.currentTrackNumber !== NO_TRACK_NUMBER) {
            subtitleLog.info("Translation settings changed, reloading current track")
            this._reloadCurrentTrack()
        }
    }

    // This will record the events and add them to the renderers if they are new.
    async onSubtitleEvents(events: MKVParser_SubtitleEvent[]) {
        if (this.isDestroyed) return
        const pgsEvents: any[] = []
        const assEvents: CachedEvent[] = []

        for (const event of events) {
            // Check if this is a PGS event
            if (isPGS(event.codecID)) {
                const isNew = this._handlePgsEvent(event, false)
                if (isNew && event.trackNumber === this.currentTrackNumber && this.pgsRenderer) {
                    pgsEvents.push({
                        startTime: event.startTime / 1e3,
                        duration: event.duration / 1e3,
                        imageData: event.text, // base64 PNG
                        width: parseInt(event.extraData?.width || "0", 10),
                        height: parseInt(event.extraData?.height || "0", 10),
                        x: event.extraData?.x ? parseInt(event.extraData.x, 10) : undefined,
                        y: event.extraData?.y ? parseInt(event.extraData.y, 10) : undefined,
                        canvasWidth: event.extraData?.canvas_width ? parseInt(event.extraData.canvas_width, 10) : undefined,
                        canvasHeight: event.extraData?.canvas_height ? parseInt(event.extraData.canvas_height, 10) : undefined,
                        cropX: event.extraData?.crop_x ? parseInt(event.extraData.crop_x, 10) : undefined,
                        cropY: event.extraData?.crop_y ? parseInt(event.extraData.crop_y, 10) : undefined,
                        cropWidth: event.extraData?.crop_width ? parseInt(event.extraData.crop_width, 10) : undefined,
                        cropHeight: event.extraData?.crop_height ? parseInt(event.extraData.crop_height, 10) : undefined,
                    })
                }
            } else {
                // Record the event
                const { isNew, cachedEntry } = this._recordSubtitleEvent(event)
                if (isNew && cachedEntry && event.trackNumber === this.currentTrackNumber && this.libassRenderer) {
                    assEvents.push(cachedEntry)
                }
            }
        }

        if (pgsEvents.length > 0 && this.pgsRenderer) {
            this.pgsRenderer.addEvents(pgsEvents)
        }

        if (assEvents.length > 0 && this.libassRenderer) {
            await this._injectAssEventsChunked(assEvents, this.currentTrackNumber)
        }
    }

    // Injecting an event into JASSUB is one worker postMessage per event. Bursts of hundreds
    // (full-track population on track select, or the event-history replay at episode
    // transitions) dispatch them in a tight loop, which stalls the main thread and causes a
    // visible playback hitch. Spread large batches across macrotasks in small chunks: the
    // steady-state trickle (a few dozen events) still goes out in a single pass, while a
    // full-episode burst takes a few hundred ms without ever blocking a frame.
    private async _injectAssEventsChunked(entries: CachedEvent[], trackNumber: number) {
        const CHUNK_SIZE = 50
        for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
            // Abort if the renderer was destroyed or the user switched tracks mid-injection
            if (this.isDestroyed || !this.libassRenderer || this.currentTrackNumber !== trackNumber) return
            const end = Math.min(i + CHUNK_SIZE, entries.length)
            for (let j = i; j < end; j++) {
                const cached = entries[j]
                if (this.shouldTranslate) {
                    if (cached.translatedAssEvent) {
                        // already translated, use it
                        this.libassRenderer.renderer.createEvent(cached.translatedAssEvent)
                    } else {
                        // fetch the translation, it will be rendered once returned
                        this._fetchEventTranslationIfNeeded(cached)
                    }
                } else {
                    // not translating, use the original event
                    this.libassRenderer.renderer.createEvent(cached.assEvent)
                }
            }
            if (end < entries.length) {
                await new Promise(resolve => setTimeout(resolve, 12))
            }
        }
    }

    async setSubtitleDelay(subtitleDelay: number) {
        if (this.libassRenderer) {
            await this.libassRenderer.ready
            this.libassRenderer.timeOffset = -subtitleDelay
        }
        if (this.pgsRenderer) this.pgsRenderer.setTimeOffset(-subtitleDelay)
    }

    getFileTrack(trackNumber: number) {
        return this.fileTracks[trackNumber] || null
    }

    processEventTranslationQueue(original: string, translated: string) {
        const cached = this.eventTranslationQueue.get(original)
        if (!cached) return
        this.eventTranslationQueue.delete(original)
        cached.translatedAssEvent = {
            ...cached.assEvent,
            Text: translated,
        }
        cached.isTranslating = false
        // If the track is still the active one, inject the new event immediately
        if (this.currentTrackNumber === cached.event.trackNumber && this.libassRenderer) {
            this.libassRenderer.renderer.createEvent(cached.translatedAssEvent)
        }
    }

    private _getTracks(): NormalizedTrackInfo[] {
        const eventTracks = Object.values(this.eventTracks).map(t => <NormalizedTrackInfo>({
            type: "event",
            language: t.info.language,
            number: t.info.number,
            label: t.info.name,
            forced: t.info.forced,
            default: t.info.default,
            languageIETF: t.info.languageIETF,
            codecID: t.info.codecID,
        }))

        const fileTracks = Object.entries(this.fileTracks).map(([trackNumber, t]) => <NormalizedTrackInfo>({
            type: "file",
            language: t.info.language,
            number: Number(trackNumber),
            label: t.info.label,
            forced: false,
            default: t.info.default,
        }))

        return [...eventTracks, ...fileTracks].sort((a, b) => a.number - b.number)
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////\

    // +-----------------------+
    // |      Event Tracks     |
    // +-----------------------+

    // Adds a new track AFTER initialization and selects it
    async addFileTrack(track: VideoCore_VideoSubtitleTrack) {
        subtitleLog.info("Subtitle file track added", track)

        // Check if the added track is a translation
        const translatingTrack = this.translatedFileTracks.get(track.index)
        let isTranslated = false
        if (translatingTrack) {
            subtitleLog.info("Subtitle file track is a translation", translatingTrack)
            // already translated, don't add it
            if (!translatingTrack.translating) return
            translatingTrack.translating = false
            isTranslated = true
        }

        const lastFileTrackNumber = Object.keys(this.fileTracks).length
            ? Number(Object.keys(this.fileTracks)[Object.keys(this.fileTracks).length - 1])
            : 999
        const number = lastFileTrackNumber + 1
        this.fileTracks[number] = {
            info: {
                ...track,
                index: number, // update the index (track number)
            },
            content: null,
        }
        // Select the track
        await this.selectTrack(number)
        this.libassRenderer?.resize?.()?.catch?.(e => subtitleLog.warn("Failed to resize libass renderer", e))
        this.pgsRenderer?.resize()

        const tracks = this._getTracks()
        const normalizedTrack = tracks.find(t => t.number === number)
        if (normalizedTrack) {
            const event: SubtitleManagerTrackAddedEvent = new CustomEvent("trackadded", { detail: { track: normalizedTrack } })
            this.dispatchEvent(event)
        }
        const event: SubtitleManagerTracksLoadedEvent = new CustomEvent("tracksloaded", { detail: { tracks: tracks } })
        this.dispatchEvent(event)

        // Flag this nerw track as translated
        if (isTranslated) {
            subtitleLog.info("Added track is translated", track)
            this.translatedFileTracks.set(number, { translating: false })
        }

        this._onTracksLoaded?.(tracks)
    }

    async addEventTrack(track: MKVParser_TrackInfo) {
        subtitleLog.info("Subtitle track added", track)
        this._addEventTrack(track)
        this._storeEventTrackStyles()
        // Select the track
        await this.selectTrack(track.number)
        this.libassRenderer?.resize?.()?.catch?.(e => subtitleLog.warn("Failed to resize libass renderer", e))
        this.pgsRenderer?.resize()

        const tracks = this._getTracks()
        const normalizedTrack = tracks.find(t => t.number === track.number)
        if (normalizedTrack) {
            const event: SubtitleManagerTrackAddedEvent = new CustomEvent("trackadded", { detail: { track: normalizedTrack } })
            this.dispatchEvent(event)
        }
        const event: SubtitleManagerTracksLoadedEvent = new CustomEvent("tracksloaded", { detail: { tracks: tracks } })
        this.dispatchEvent(event)
        this._onTracksLoaded?.(tracks)
    }

    // When called for the first time, it will initialize the libass renderer.
    private async _selectDefaultTrack() {
        if (this.currentTrackNumber !== NO_TRACK_NUMBER) {
            subtitleLog.warning("A track is already selected, cannot select default track")
            return
        }
        const tracks = this._getTracks()
        subtitleLog.info("Selecting default track", tracks)

        if (!tracks?.length) {
            this.setNoTrack()
            return
        }

        // A per-media (per-series) override takes priority over the global preferred language,
        // including an explicit "Off", so a caption the user picked on one episode is re-applied
        // on every other episode of the same series.
        const overrideTrackNumber = resolveOverrideTrackNumber(this.preferredTrackOverride, tracks)
        if (overrideTrackNumber !== null) {
            subtitleLog.info("Applying per-media subtitle override", overrideTrackNumber, this.preferredTrackOverride)
            await this.selectTrack(overrideTrackNumber)
            return
        }

        if (tracks.length === 1) {
            subtitleLog.info("Only one track found, selecting it")
            await this.selectTrack(tracks[0].number)
            return
        }

        // Split preferred languages by comma and trim whitespace
        const defaultTrackNumber = getDefaultSubtitleTrackNumber(this.settings, tracks)
        subtitleLog.info("Default subtitle track number",
            defaultTrackNumber,
            this.settings.preferredSubtitleLanguage,
            this.settings.preferredSubtitleBlacklist)
        await this.selectTrack(defaultTrackNumber)
    }

    private _handlePgsEvent(event: MKVParser_SubtitleEvent, renderImmediately = true) {
        // Ensure the PGS track exists
        if (!this.pgsEventTracks[event.trackNumber]) {
            subtitleLog.warning("PGS track not initialized for track number", event.trackNumber)
            return false
        }

        const trackEventMap = this.pgsEventTracks[event.trackNumber].events
        const eventKey = this._getPgsEventKey(event)

        // Check if the event is already recorded
        if (trackEventMap.has(eventKey)) {
            return false
        }

        // Store the event
        trackEventMap.set(eventKey, event)

        // If this is the currently selected track, add the event to the renderer
        if (renderImmediately && event.trackNumber === this.currentTrackNumber && this.pgsRenderer) {
            this._addPgsEvent(event)
        }

        return true
    }

    private _getPgsEventKey(event: MKVParser_SubtitleEvent): string {
        return `${event.startTime}-${event.duration}-${event.text.substring(0, 50)}`
    }

    private _addPgsEvent(event: MKVParser_SubtitleEvent) {
        if (!this.pgsRenderer) {
            return
        }

        const pgsEvent = {
            startTime: event.startTime / 1e3,
            duration: event.duration / 1e3,
            imageData: event.text, // base64 PNG
            width: parseInt(event.extraData?.width || "0", 10),
            height: parseInt(event.extraData?.height || "0", 10),
            x: event.extraData?.x ? parseInt(event.extraData.x, 10) : undefined,
            y: event.extraData?.y ? parseInt(event.extraData.y, 10) : undefined,
            canvasWidth: event.extraData?.canvas_width ? parseInt(event.extraData.canvas_width, 10) : undefined,
            canvasHeight: event.extraData?.canvas_height ? parseInt(event.extraData.canvas_height, 10) : undefined,
            cropX: event.extraData?.crop_x ? parseInt(event.extraData.crop_x, 10) : undefined,
            cropY: event.extraData?.crop_y ? parseInt(event.extraData.crop_y, 10) : undefined,
            cropWidth: event.extraData?.crop_width ? parseInt(event.extraData.crop_width, 10) : undefined,
            cropHeight: event.extraData?.crop_height ? parseInt(event.extraData.crop_height, 10) : undefined,
        }

        this.pgsRenderer.addEvent(pgsEvent)
    }

    private async _applySubtitleCustomization() {
        if (!this.libassRenderer || this.isDestroyed) {
            return
        }

        await this.libassRenderer.ready
        if (this.isDestroyed) return
        // Handle undefined or disabled customization
        if (!this.settings.subtitleCustomization?.enabled) {
            // Disable style override if customization is disabled
            this.libassRenderer.renderer.disableStyleOverride()
            this.libassRenderer.renderer.setDefaultFont(DEFAULT_FONT_NAME)
            return
        }

        // check if the track has only one style, if so, apply the customization to that style
        let found = false
        const eventTrack = this.eventTracks[this.currentTrackNumber]
        if (eventTrack) {
            found = true
            if (eventTrack.styles && Object.keys(eventTrack.styles).length > 1) {
                subtitleLog.info("Track has multiple styles, not applying customization")
                return
            }
        }
        const fileTrack = this.fileTracks[this.currentTrackNumber]
        if (fileTrack) {
            found = true
            // if it's a file track, it was converted from another format so has only one style
        }

        if (!found) return

        const opts = this.settings.subtitleCustomization

        const primaryColor = hexToASSColor(vc_getSubtitleStyle(opts, "primaryColor"), 0)
        const outlineColor = hexToASSColor(vc_getSubtitleStyle(opts, "outlineColor"), 0)
        const backColor = hexToASSColor(vc_getSubtitleStyle(opts, "backColor"), vc_getSubtitleStyle(opts, "backColorOpacity"))

        // devnote: jassub scales down to 30% of the og scale
        // /jassub/blob/main/src/JASSUB.cpp#L709
        let customStyle = {
            Name: "CustomDefault",
            FontName: DEFAULT_FONT_NAME, // opts.fontName || DEFAULT_FONT_NAME,
            FontSize: vc_getSubtitleStyle(opts, "fontSize"),
            PrimaryColour: primaryColor,
            SecondaryColour: primaryColor,
            OutlineColour: outlineColor,
            BackColour: backColor,
            ScaleX: ((100) / 100),
            ScaleY: ((100) / 100),
            Outline: vc_getSubtitleStyle(opts, "outline"),
            Shadow: vc_getSubtitleStyle(opts, "shadow"),
            MarginV: 120,
            BorderStyle: 1,
            Alignment: 2, // Bottom center
            MarginL: 20,
            MarginR: 20,
            Bold: 0, // customization.bold ? 1 : 0,
            Encoding: 1,
            Justify: 0,
            Blur: 0,
            Italic: 0,
            Underline: 0,
            StrikeOut: 0,
            Spacing: 0,
            Angle: 0,
            treat_fontname_as_pattern: 0,
        }

        // Apply font change
        // fontName can be something like "Noto Sans SC" or "Noto Sans SC.ttf"
        if (opts.fontName) {
            // clean font name
            const _fontName = opts.fontName.trim()
            let url = getAssetUrl(`${_fontName}.woff2`)
            if (_fontName.includes(".")) {
                url = getAssetUrl(_fontName) // use the fontname as filename if there's an extension
            }
            const fontName = _fontName.split(".")[0]

            // Validate the font actually loads BEFORE making it the default. Setting a
            // default font whose asset is broken/missing makes libass fail glyph lookup
            // on every event ("failed to find any fallback with glyph ... for font") and
            // renders nothing, while also churning the renderer every frame.
            const fontData = await fetchFontData(url)
            if (this.isDestroyed || !this.libassRenderer) return

            if (fontData) {
                subtitleLog.info("Applying font change", url, ", setting default font to", fontName)
                if (!sharedRendererLoadedFontKeys.has(url)) {
                    subtitleLog.info("Adding font to renderer", fontName)
                    sharedRendererLoadedFontKeys.add(url)
                    this.fonts.push(url)
                    this.libassRenderer.renderer.addFonts([fontData])
                }
                await this.libassRenderer.renderer.setDefaultFont(fontName)
                customStyle.FontName = fontName
            } else {
                subtitleLog.warning(`Custom subtitle font "${fontName}" could not be loaded, keeping default font`)
                await this.libassRenderer.renderer.setDefaultFont(DEFAULT_FONT_NAME)
            }
            await this.libassRenderer.renderer.styleOverride(customStyle)
        } else {
            await this.libassRenderer.renderer.setDefaultFont(DEFAULT_FONT_NAME)
            await this.libassRenderer.renderer.styleOverride(customStyle)
        }

        await this.libassRenderer.resize()
        subtitleLog.info("Applied subtitle customization override", customStyle)
    }

    private __eventMapKey(event: MKVParser_SubtitleEvent): string {
        // Key by content, NOT by the server-assigned extraData._id: the id is unique per
        // extraction run, and the server re-extracts (and re-sends) already-delivered events
        // when a seek restarts the subtitle stream mid-file. Keying by id made those re-sent
        // events look new, so they were rendered a second time — visibly doubled subtitles.
        return `${event.trackNumber}:${event.startTime}:${event.duration}:${this.__fastStringHash(event.text)}`
    }

    // djb2 hash for string hashing
    private __fastStringHash(str: string): number {
        let hash = 5381
        for (let i = 0, len = str.length; i < len; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
        }
        return hash >>> 0
    }

    // Stores the styles for each track.
    private _storeEventTrackStyles() {
        if (!this.playbackInfo?.mkvMetadata?.subtitleTracks) return
        for (const track of this.playbackInfo.mkvMetadata.subtitleTracks) {
            const codecPrivate = track.codecPrivate?.slice?.(0, -1) || this.defaultSubtitleHeader
            const lines = codecPrivate.replaceAll("\r\n", "\n").split("\n").filter(line => line.startsWith("Style:"))
            let index = 1
            const s: Record<string, number> = {}
            this.eventTracks[track.number].styles = s // reset styles
            for (const line of lines) {
                let styleName = line.split("Style:")[1]
                styleName = (styleName.split(",")[0] || "").trim()
                if (styleName && !s[styleName]) {
                    s[styleName] = index++
                }
            }
            this.eventTracks[track.number].styles = s
        }
    }

    private async _reloadCurrentTrack() {
        const track = this.currentTrackNumber
        // effectively flushes the renderer and re-adds events
        // using the new settings logic
        if (this.libassRenderer) {
            await this.libassRenderer.ready
            if (this.isDestroyed) return
            // Free the old track first — see the note in selectTrack: setTrack is additive
            // and this renderer outlives the track being replaced.
            try {
                await this._freeLibassTrack()
            }
            catch (e) {
                subtitleLog.warn("Failed to free previous libass track", e)
            }
            this.libassRenderer?.renderer?.setTrack(this.eventTracks[track]?.info.codecPrivate?.slice(0, -1) || this.defaultSubtitleHeader)
            await this._applySubtitleCustomization()
            if (this.isDestroyed) return
        }

        // Re-run the selection logic to populate events
        if (this.eventTracks[track]) {
            this._populateEventTrack(track)
        }

        // Run translation logic if needed
        if (this.fileTracks[track] && this.shouldTranslate) {
            this._translateFileTrack(track)
        }
    }

    /**
     * Iterates all cached events and adds them to the renderer.
     * Handles fetching translations for existing events in the background.
     */
    private _populateEventTrack(trackNumber: number) {
        const trackEventMap = this.eventTracks[trackNumber]?.events
        if (!trackEventMap) return

        subtitleLog.info(`Populating ${trackEventMap.size} events for track ${trackNumber}`)

        // Chunked so a full track's worth of createEvent postMessages doesn't stall the main
        // thread (see _injectAssEventsChunked). Fire-and-forget; resize once done.
        this._injectAssEventsChunked([...trackEventMap.values()], trackNumber).then(() => {
            this.libassRenderer?.resize?.()?.catch?.(e => subtitleLog.warn("Failed to resize libass renderer", e))
        })
    }

    private _createAssEvent(event: MKVParser_SubtitleEvent, index: number): ASSEvent {
        // Resolve the style index. If the style name isn't in the track's parsed styles map
        // (e.g. case mismatch, codecPrivate not yet parsed), fall back to "Default" or 1.
        // Returning `undefined` here causes JASSUB to drop the event or render it with an
        // unexpected style, which manifests as subtitles not showing at all.
        const styles = this.eventTracks[event.trackNumber]?.styles
        const styleName = event.extraData?.style
        let styleIdx: number = 1
        if (styleName && styles) {
            const idx = styles[styleName]
            if (typeof idx === "number" && idx > 0) {
                styleIdx = idx
            } else if (typeof styles["Default"] === "number" && styles["Default"] > 0) {
                styleIdx = styles["Default"]
            }
        }

        // Sanitize the duration. Some malformed MKV/ASS sources emit events with absurdly long
        // durations or non-positive values. Clamp anything beyond a reasonable maximum and
        // replace non-positive/NaN values with a short fallback so the event still flashes
        // rather than becoming permanent or being dropped.
        const MAX_EVENT_DURATION_MS = 10_000
        const DEFAULT_EVENT_DURATION_MS = 1_500
        let duration = event.duration
        if (!Number.isFinite(duration) || duration <= 0) {
            duration = DEFAULT_EVENT_DURATION_MS
        } else if (duration > MAX_EVENT_DURATION_MS) {
            duration = MAX_EVENT_DURATION_MS
        }

        return {
            Start: event.startTime,
            Duration: duration,
            Style: styleIdx,
            Name: event.extraData?.name ?? "",
            MarginL: event.extraData?.marginL ? Number(event.extraData.marginL) : 0,
            MarginR: event.extraData?.marginR ? Number(event.extraData.marginR) : 0,
            MarginV: event.extraData?.marginV ? Number(event.extraData.marginV) : 0,
            Effect: event.extraData?.effect ?? "",
            Text: event.text,
            ReadOrder: event.extraData?.readOrder ? Number(event.extraData.readOrder) : 1,
            Layer: event.extraData?.layer ? Number(event.extraData.layer) : 0,
            // index is based on the order of the events in the record
            // _index: index,
        }
    }

    private _addEventTrack(track: MKVParser_TrackInfo) {
        this.eventTracks[track.number] = {
            info: track,
            events: new Map(),
            styles: {},
        }

        // If this is a PGS track, initialize it in the PGS events map
        // PGS tracks will also have an entry in eventTracks
        if (isPGS(track.codecID)) {
            this.pgsEventTracks[track.number] = {
                info: track,
                events: new Map(),
            }
        }
    }

    private _fetchEventTranslationIfNeeded(cached: CachedEvent) {
        if (!this.translateFn) return
        if (cached.translatedAssEvent || cached.isTranslating) return
        if (!cached.event.text) return

        this.translateFn(cached)
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // +-----------------------+
    // |      File Tracks      |
    // +-----------------------+

    private _recordSubtitleEvent(event: MKVParser_SubtitleEvent): { isNew: boolean, cachedEntry?: CachedEvent } {
        // no track map
        const trackEventMap = this.eventTracks[event.trackNumber]?.events
        if (!trackEventMap) return { isNew: false, cachedEntry: undefined }

        const eventKey = this.__eventMapKey(event)

        // return the cached entry if it exists
        if (trackEventMap.has(eventKey)) {
            return { isNew: false, cachedEntry: trackEventMap.get(eventKey) }
        }

        // create a new entry
        const assEvent = this._createAssEvent(event, trackEventMap.size)
        const cachedEntry: CachedEvent = {
            event,
            assEvent,
        }
        trackEventMap.set(eventKey, cachedEntry)
        return { isNew: true, cachedEntry }
    }

    // Called after selecting a non-translated file and shouldTranslate is true.
    private _translateFileTrack(trackNumber: number) {
        if (!this.shouldTranslate) return
        const trackToTranslate = this.fileTracks[trackNumber]
        if (!trackToTranslate) return

        // Stop other files from translating
        for (const [tn, translatingTrack] of this.translatedFileTracks.entries()) {
            if (translatingTrack.translating && tn !== trackNumber) {
                translatingTrack.translating = false
            }
        }

        // If already added, stop
        const translatingTrack = this.translatedFileTracks.get(trackNumber)
        if (translatingTrack) {
            return
        }

        // Check if it's not the same as target language
        const t = Object.values(this.fileTracks).find(t => detectTrackLanguage(t.info) === this.shouldTranslate)
        if (t && t.info.index !== trackNumber) {
            subtitleLog.info(`Track ${t.info} is already in target language`, trackNumber, ", selecting it instead")
            if (!this.translatedFileTracks.has(t.info.index)) {
                this.selectTrack(t.info.index)
            }
            this.translatedFileTracks.set(trackNumber, { translating: false })
            this.translatedFileTracks.set(t.info.index, { translating: false })
            return
        }

        // Add it, then send translate request
        this.translatedFileTracks.set(trackNumber, { translating: true })
        // Send server translate request
        this.sendTranslateRequest(undefined, trackToTranslate.info)
    }


    // Fetches the track's content and converts it to ASS.
    // If the content is already fetched, it will load it.
    private async _handleFileTrack(trackNumber: number, fileTrack: { info: VideoCore_VideoSubtitleTrack, content: string | null }) {
        subtitleLog.info("Handling file track", trackNumber, fileTrack.info)

        if (!this.fetchAndConvertToASS) {
            subtitleLog.error("fetchAndConvertToASS callback not provided")
            return
        }

        // A track load can take a while (retries while the server extracts subtitle files in
        // the background); if the user picked another track in the meantime, or the manager was
        // torn down on an episode transition, this load must not clobber the newer selection.
        const isStale = () => this.isDestroyed || this.currentTrackNumber !== trackNumber

        // If content is already loaded, use it
        if (!!fileTrack.content) {
            if (isStale()) return
            subtitleLog.info("Using cached converted content for track", trackNumber)
            await this._replaceLibassTrack(fileTrack.content)
            if (isStale()) return
            await this._applySubtitleCustomization()
            await this.libassRenderer?.resize?.()?.catch?.(e => subtitleLog.warn("Failed to resize libass renderer", e))
            this.pgsRenderer?.resize()
            return
        }

        // Convert the subtitle to ASS format
        if (fileTrack.info.type === "ass") {
            try {
                if (fileTrack.info.src) subtitleLog.info("Fetching subtitle content", fileTrack.info.src)
                // fetch subtitle file content — check the response before using it: a failed
                // request (500 from the stream not being registered, SPA fallback HTML) must
                // not be cached as the track's content
                let content = fileTrack.info.content || ""
                if (fileTrack.info.src) {
                    content = await fetchSubtitleTextWithRetry(fileTrack.info.src, isStale)
                }
                if (isStale()) return
                this.fileTracks[trackNumber].content = content // cache it
                await this._replaceLibassTrack(content)
                if (isStale()) return
                await this._applySubtitleCustomization()
                await this.libassRenderer?.resize?.()
                this.pgsRenderer?.resize()
            }
            catch (error) {
                if (this.isDestroyed || this.currentTrackNumber !== trackNumber) return
                subtitleLog.error("Error fetching subtitle content", error)
                toast.error("Failed to load subtitle track")
            }
        } else {
            try {
                subtitleLog.info("Converting subtitle to ASS format")
                let url = fileTrack.info.src
                let content = fileTrack.info.content
                // Local mediastream tracks: fetch the content in the browser first. Handing the
                // URL to the server's convert-subs makes the server fetch itself, which goes
                // through the video proxy transport and fails in confusing ways — surfacing as
                // "failed to detect subtitle format from content".
                if (url && url.includes("/api/v1/mediastream/subs/")) {
                    content = await fetchSubtitleTextWithRetry(url, isStale)
                    url = undefined
                }
                let assContent = await this.fetchAndConvertToASS(url, content, fileTrack.info.headers)
                if (!assContent && !isStale()) {
                    // The conversion endpoint can transiently fail while the stream is warming
                    // up; give it one more shot before surfacing the error.
                    subtitleLog.warning("Subtitle conversion returned nothing, retrying once")
                    await new Promise(resolve => setTimeout(resolve, 1500))
                    if (isStale()) return
                    const retried = await this.fetchAndConvertToASS(url, content, fileTrack.info.headers)
                    if (retried) {
                        assContent = retried
                    }
                }
                if (!assContent || isStale()) throw new Error("Subtitle conversion failed")

                // Cache the converted content
                this.fileTracks[trackNumber].content = assContent
                subtitleLog.info("Loading converted ASS content")
                await this._replaceLibassTrack(assContent)
                if (isStale()) return
                await this._applySubtitleCustomization()
                await this.libassRenderer?.resize?.()
                this.pgsRenderer?.resize()
            }
            catch (error) {
                if (this.isDestroyed || this.currentTrackNumber !== trackNumber) return
                subtitleLog.error("Error loading track", error)
                toast.error("Failed to load subtitle track: " + error)
            }
        }

        if (isStale()) return

        const selectedEvent: SubtitleManagerTrackSelectedEvent = new CustomEvent("trackselected", { detail: { trackNumber, kind: "file" } })
        this.dispatchEvent(selectedEvent)

        this._translateFileTrack(trackNumber)
    }
}

// Labels of tracks that carry no dialogue — signs, on-screen text, songs. A track with one of
// these markers is never accepted as the carrier of a saved caption unless the saved caption's
// own label had the same marker: picking "Dialogue@EMBER+NekoYu" on one episode must not
// auto-select "Signs & Songs@EMBER" on the next one, which renders as "subtitles stopped
// persisting" (the menu shows a track selected, but no dialogue is ever displayed).
const NON_DIALOGUE_LABEL_RE = /\b(?:signs?|songs?|titles?|on[- ]?screen|credits?|forced)\b/i

/**
 * Scores how likely a candidate track is to be the same caption the user saved under
 * `savedLabel`, for use when no track carries the label verbatim. Release groups rename and
 * reorder tracks between episodes (e.g. "Dialogue@EMBER+NekoYu" becomes
 * "Dialogue@NekoYu+EMBER", or a batch switch renames the full track entirely), so exact
 * matching alone leaves the next episode to the first same-language track — often the
 * signs/songs one.
 *
 * The score counts shared word tokens ("dialogue", "full", the group names) and rewards one
 * label containing the other; a candidate whose label marks it as a non-dialogue track the
 * saved one was not is rejected outright.
 */
function labelSimilarityScore(savedLabel: string, candidateLabel: string): number | null {
    const saved = savedLabel.toLowerCase()
    const candidate = candidateLabel.toLowerCase()
    const savedIsNonDialogue = NON_DIALOGUE_LABEL_RE.test(saved)
    if (NON_DIALOGUE_LABEL_RE.test(candidate) !== savedIsNonDialogue) return null

    const tokenize = (label: string) => new Set(label.match(/[a-z0-9]+/g) ?? [])
    const savedTokens = tokenize(saved)
    const candidateTokens = tokenize(candidate)
    if (savedTokens.size === 0 || candidateTokens.size === 0) return null

    let shared = 0
    for (const token of savedTokens) {
        if (candidateTokens.has(token)) shared++
    }
    if (shared === 0) return null

    let score = shared * 2
    if (candidate.includes(saved) || saved.includes(candidate)) score += 2
    return score
}

/**
 * Resolves a per-media subtitle preference to a concrete track number against the given tracks.
 * Returns:
 * - `NO_TRACK_NUMBER` if the override is an explicit "off"
 * - the matching track number when a track matches the saved label/language/codec
 * - `null` when there is no override or no match (caller should fall back to defaults)
 *
 * Matching is ordered from most to least specific (label, then language preferring a codec
 * match, then the most label-similar same-language track) so the same caption a user picked
 * carries across episodes even when track numbers differ or the release group renamed the
 * track between episodes.
 */
export function resolveOverrideTrackNumber(
    override: PerMediaTrackOverride | undefined,
    tracks: { label?: string, language?: string, languageIETF?: string, codecID?: string, number: number }[] | null = null,
): number | null {
    if (!override) return null

    // Explicit "Off" — the user turned subtitles off and wants that to stick.
    if (override.subtitleLanguage === "none") return NO_TRACK_NUMBER

    const ts = tracks ?? []
    if (!ts.length) return null

    const normalizeLanguage = (language?: string, label?: string) => {
        const baseLanguage = language?.trim().toLowerCase().replace(/_/g, "-").split("-")[0]
        return detectTrackLanguage({ language: baseLanguage, label }) ?? baseLanguage ?? detectTrackLanguage({ label })
    }
    const wantedLang = override.subtitleLanguage
        ? normalizeLanguage(override.subtitleLanguage, override.subtitleLabel)
        : undefined

    // 1. Match by label, but do not let a repeated generic label (e.g. "Default") override
    // the saved language and silently switch the next episode to another language.
    if (override.subtitleLabel) {
        const wanted = override.subtitleLabel.trim().toLowerCase()
        const labelMatches = ts.filter(t => t.label?.trim().toLowerCase() === wanted)
        const byLabel = wantedLang
            ? labelMatches.find(t => normalizeLanguage(t.languageIETF, t.label) === wantedLang
                || normalizeLanguage(t.language, t.label) === wantedLang)
            : labelMatches[0]
        if (byLabel) return byLabel.number
    }

    // 2. Match by normalized language (including ISO 639 aliases and BCP 47 tags),
    // preferring the same codec when one was recorded.
    if (override.subtitleLanguage) {
        const sameLang = wantedLang
            ? ts.filter(t => normalizeLanguage(t.languageIETF, t.label) === wantedLang
                || normalizeLanguage(t.language, t.label) === wantedLang)
            : []
        if (sameLang.length) {
            if (override.subtitleCodecID) {
                const byCodec = sameLang.find(t => t.codecID === override.subtitleCodecID)
                if (byCodec) return byCodec.number
            }
            // The saved label doesn't exist on this episode (renamed between releases).
            // Among the same-language tracks, take the one most similar to the saved label —
            // falling back to the first track here used to land on the signs/songs track
            // whenever it was listed before the dialogue one.
            if (override.subtitleLabel && sameLang.length > 1) {
                let best: { track: (typeof sameLang)[number], score: number } | null = null
                for (const track of sameLang) {
                    if (!track.label) continue
                    const score = labelSimilarityScore(override.subtitleLabel, track.label)
                    if (score !== null && (!best || score > best.score)) {
                        best = { track, score }
                    }
                }
                if (best) return best.track.number
            }
            return sameLang[0].number
        }
    }

    return null
}

export function getDefaultSubtitleTrackNumber(
    settings: VideoCoreSettings,
    _tracks: { label?: string, language?: string, number: number, forced?: boolean, default?: boolean }[] | null = null,
): number {
    // Split preferred languages by comma and trim whitespace
    const preferredLanguages = settings.preferredSubtitleLanguage
        .split(",")
        .map(lang => lang.trim())
        .filter(lang => lang.length > 0)

    const blacklistLabels = (settings.preferredSubtitleBlacklist ?? "")
        .split(",")
        .map(label => label.trim().toLowerCase())
        .filter(label => label.length > 0)

    let tracks = _tracks ?? []
    // remove blacklisted tracks if there are more than one
    if (blacklistLabels.length && tracks.length > 1) {
        tracks = tracks?.filter?.(t => !t.label || !blacklistLabels.includes(t.label?.toLowerCase())) ?? []
    }

    // Try each preferred language in order
    for (const preferredLang of preferredLanguages) {
        let foundTracks = tracks?.filter?.(t => trackMatchesLanguage(t, preferredLang))
        if (foundTracks?.length) {
            // Prefer a complete caption track over a forced-only track for the same language.
            const preferredTrack = foundTracks.find(t => !t.forced && t.default)
                ?? foundTracks.find(t => !t.forced)
                ?? foundTracks[0]
            return preferredTrack.number
        }
        if (preferredLang === "none") {
            return NO_TRACK_NUMBER
        }
    }

    // No preferred tracks found, look for default or forced tracks
    const defaultOrForcedTracks = tracks?.filter?.(t => t.default || t.forced)
    if (defaultOrForcedTracks?.length) {
        // Prioritize default tracks over forced tracks
        const defaultIndex = defaultOrForcedTracks.findIndex(t => t.default)
        return defaultOrForcedTracks[defaultIndex >= 0 ? defaultIndex : 0].number
    }

    // No forced/default tracks found, select the first track
    return tracks?.[0]?.number ?? NO_TRACK_NUMBER
}
