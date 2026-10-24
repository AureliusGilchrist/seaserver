const { app, BrowserWindow, Menu, ipcMain, shell, dialog, net, protocol, screen } = require("electron")
const path = require("path")
const fs = require("fs")
const http = require("http")
let stripAnsi
import("strip-ansi").then(module => {
    stripAnsi = module.default
})
const log = require("electron-log/main")
const { buildFrontend, getLiveWebDir } = require("./mobile-build")
log.initialize()

// Deterministic user-data folder (%APPDATA%/seanine-denshi-mobile), independent of how the app
// was packaged.
app.setName("seanine-denshi-mobile")

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Settings
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const MOBILE_SETTINGS_DEFAULTS = {
    openInBackground: false,
    windowBounds: null,
    windowMaximized: false,
    sourceRepoPath: "",
}

// A phone, on a desk: portrait-shaped by default, but never taller than the screen it opens on
// (getSafeWindowPlacement clamps to the work area).
const MAIN_WINDOW_DEFAULT_BOUNDS = {
    width: 430,
    height: 932,
}

const MIN_VISIBLE_WINDOW_EDGE = 120

function getSettingsPath() {
    return path.join(app.getPath("userData"), "denshi-mobile-settings.json")
}

function loadMobileSettings() {
    try {
        const settingsPath = getSettingsPath()
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
            return { ...MOBILE_SETTINGS_DEFAULTS, ...data }
        }
    } catch (err) {
        log.error("[Mobile] Failed to load settings:", err)
    }
    return { ...MOBILE_SETTINGS_DEFAULTS }
}

function saveMobileSettings(settings) {
    try {
        const settingsPath = getSettingsPath()
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8")
    } catch (err) {
        log.error("[Mobile] Failed to save settings:", err)
    }
}

let mobileSettings = { ...MOBILE_SETTINGS_DEFAULTS }

// validates and returns safe window bounds based on the provided raw bounds and current display configurations
function getSafeWindowPlacement(rawBounds) {
    const width = Number(rawBounds?.width)
    const height = Number(rawBounds?.height)
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return { bounds: { ...MAIN_WINDOW_DEFAULT_BOUNDS }, forceMaximize: false }
    }

    const x = Number(rawBounds?.x)
    const y = Number(rawBounds?.y)
    if (!app.isReady() || !Number.isFinite(x) || !Number.isFinite(y)) {
        return { bounds: { width, height }, forceMaximize: false }
    }

    const bounds = { x, y, width, height }
    if (screen.getAllDisplays().some(({ workArea }) => {
        const visibleWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
        const visibleHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
        return visibleWidth >= MIN_VISIBLE_WINDOW_EDGE && visibleHeight >= MIN_VISIBLE_WINDOW_EDGE
    })) {
        return { bounds, forceMaximize: false }
    }

    const { workArea } = screen.getPrimaryDisplay()
    const fallbackWidth = Math.min(width, workArea.width)
    const fallbackHeight = Math.min(height, workArea.height)

    return {
        bounds: {
            x: Math.round(workArea.x + (workArea.width - fallbackWidth) / 2),
            y: Math.round(workArea.y + (workArea.height - fallbackHeight) / 2),
            width: fallbackWidth,
            height: fallbackHeight,
        },
        forceMaximize: true,
    }
}

function saveMainWindowState() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    const { x, y, width, height } = mainWindow.getNormalBounds()
    mobileSettings = {
        ...mobileSettings,
        windowBounds: { x, y, width, height },
        windowMaximized: mainWindow.isMaximized(),
    }
    saveMobileSettings(mobileSettings)
}

// launchId identifies this run of the app. It is what lets the web app tell "the app was just
// started" from "the page reloaded", which it cannot otherwise do: the profile session is kept
// in sessionStorage, and sessionStorage survives a reload by design — deliberately so, because
// linking an AniList account navigates the page away and back, and a session that did not
// survive that would sign you out in the middle of it.
//
// Generated fresh on every start and never written to disk.
let launchId = require("crypto").randomUUID()

function newLaunchId() {
    launchId = require("crypto").randomUUID()
    return launchId
}

// Registered here, at module scope, rather than inside app.whenReady().
//
// The renderer asks for this synchronously, and ipcRenderer.sendSync blocks the renderer until the
// main process replies — with no listener registered there is nothing to reply, so it does not fail,
// it hangs. Module scope runs before any window exists, which is the only ordering that is safe
// for a synchronous channel.
ipcMain.on("session:getLaunchId", (event) => {
    event.returnValue = launchId
})

function hideMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    // Hiding without unloading the page is the one "close" the launch id alone cannot catch,
    // so the session ends here too, told directly.
    newLaunchId()
    if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send("session:end")
    }

    saveMainWindowState()
    mainWindow.hide()
}

function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }

    if (app.isReady() && !mainWindow.isMaximized()) {
        const { bounds } = getSafeWindowPlacement(mainWindow.getNormalBounds())
        const currentBounds = mainWindow.getBounds()
        if (currentBounds.x !== bounds.x
            || currentBounds.y !== bounds.y
            || currentBounds.width !== bounds.width
            || currentBounds.height !== bounds.height) {
            mainWindow.setBounds(bounds)
        }
    }

    mainWindow.show()
    mainWindow.focus()
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Server connection config (connect-only: always remote)
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const SERVER_CONFIG_FILE = "server-connection.json"

/**
 * Loads the main React app into mainWindow if its load was deferred during boot.
 * Idempotent and safe to call multiple times.
 */
function ensureMainWindowLoaded() {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (!mainWindow.__deferLoad) return
    mainWindow.__deferLoad = false
    logStartupEvent("Loading production build with custom protocol (deferred)")
    mainWindow.loadURL("app://-")
}

function getServerConfigPath() {
    return path.join(app.getPath("userData"), SERVER_CONFIG_FILE)
}

function loadServerConfig() {
    try {
        const p = getServerConfigPath()
        if (fs.existsSync(p)) {
            const cfg = JSON.parse(fs.readFileSync(p, "utf-8"))
            // Connect-only: the only mode this shell knows is remote. A config pointing at a
            // local server (copied from Denshi, say) is treated as no config.
            if (cfg && cfg.mode === "remote") return cfg
        }
    } catch (err) {
        log.error("[ServerConfig] Failed to load:", err)
    }
    return null
}

function saveServerConfig(cfg) {
    try {
        const sanitized = {
            mode: "remote",
            remote_url: String(cfg?.remote_url || "").replace(/\/+$/, ""),
        }
        fs.writeFileSync(getServerConfigPath(), JSON.stringify(sanitized, null, 2), "utf-8")
        return true
    } catch (err) {
        log.error("[ServerConfig] Failed to save:", err)
        return false
    }
}

function validateRemoteServer(url) {
    return new Promise((resolve, reject) => {
        try {
            const cleanUrl = String(url || "").replace(/\/+$/, "")
            if (!cleanUrl) {
                reject(new Error("Empty URL"))
                return
            }
            const target = `${cleanUrl}/api/v1/status`
            const lib = target.startsWith("https://") ? require("https") : require("http")
            const req = lib.get(target, { timeout: 5000, rejectUnauthorized: false }, (res) => {
                res.resume()
                resolve(true)
            })
            req.on("timeout", () => {
                req.destroy()
                reject(new Error("Connection timed out"))
            })
            req.on("error", (e) => {
                if (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND" || e.code === "EHOSTUNREACH") {
                    reject(new Error("Could not connect to server"))
                } else {
                    reject(new Error(`Connection failed: ${e.message || e.code || "unknown"}`))
                }
            })
        } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)))
        }
    })
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Chromium flags
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function setupChromiumFlags() {
    app.commandLine.appendSwitch("no-zygote")

    app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")
    app.commandLine.appendSwitch("force_high_performance_gpu")

    app.commandLine.appendSwitch("disk-cache-size", (400 * 1000 * 1000).toString())
    app.commandLine.appendSwitch("force-effective-connection-type", "4g")

    // Disable features that can interfere with playback
    app.commandLine.appendSwitch("disable-features", [
        "WidgetLayering",
        "ColorProviderRedirection",
        "WebContentsForceDarkMode",
        "HardwareMediaKeyHandling"
    ].join(","))

    // Hardware acceleration and GPU optimizations
    app.commandLine.appendSwitch("force-high-performance-gpu")
    app.commandLine.appendSwitch("enable-zero-copy")
    app.commandLine.appendSwitch("enable-hardware-overlays", "single-fullscreen,single-on-top,underlay")
    app.commandLine.appendSwitch("ignore-gpu-blocklist")

    // Video-specific optimizations
    app.commandLine.appendSwitch("enable-accelerated-video-decode")

    // Enable advanced features
    app.commandLine.appendSwitch("enable-features", [
        "WebAssemblyLazyCompilation",
        "ThrottleDisplayNoneAndVisibilityHiddenCrossOriginIframes",
        "CanvasOopRasterization",
        "UseSkiaRenderer",
        "PlatformEncryptedDolbyVision",
    ].join(","))

    app.commandLine.appendSwitch("enable-unsafe-webgpu")
    app.commandLine.appendSwitch("enable-gpu-rasterization")
    app.commandLine.appendSwitch("enable-oop-rasterization")

    // Background processing optimizations
    app.commandLine.appendSwitch("disable-background-timer-throttling")
    app.commandLine.appendSwitch("disable-backgrounding-occluded-windows")
    app.commandLine.appendSwitch("disable-renderer-backgrounding")
    app.commandLine.appendSwitch("disable-background-media-suspend")

    app.commandLine.appendSwitch("double-buffer-compositing")
    // NOTE: Do NOT disable DirectComposition video overlays. On Windows this is the
    // zero-copy hardware path that presents decoded video frames straight to an overlay
    // plane. Disabling it forces every frame through the GPU compositor, which is cheap
    // windowed but drops frames at full-screen size — perceived as constant buffering/
    // stutter in fullscreen. It also contradicts the enable-hardware-overlays /
    // enable-zero-copy switches above.
    // app.commandLine.appendSwitch("disable-direct-composition-video-overlays")

    // Cap camera capture without disabling Chromium's display frame pacing.
    app.commandLine.appendSwitch("max-gum-fps", "120")

    if (process.platform === "linux") {
        log.info(`Passing --gtk-version=3 to Electron`)
        app.commandLine.appendSwitch("gtk-version", "3")
    }
}

log.transports.file.level = "debug"

// Redirect console logging to electron-log
console.log = log.info
console.error = log.error

const SMOKE_TEST = process.argv.includes("--smoke") || process.env.SEANIME_MOBILE_SMOKE === "1"

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Local server for youtube player embeds
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let localServerPort

const LOCAL_EMBED_HOST = "127.0.0.1"

// The only webviews the app may spawn are YouTube embeds proxied through the local server.
function isAllowedLocalEmbedURL(rawURL) {
    if (!localServerPort) {
        return false
    }

    try {
        const parsed = new URL(rawURL)
        return parsed.protocol === "http:"
            && parsed.hostname === LOCAL_EMBED_HOST
            && parsed.port === String(localServerPort)
            && parsed.pathname.startsWith("/player/")
    } catch {
        return false
    }
}

// Start local server for youtube player embeds
// Used by webviews inside React to load youtube embed and bypass 153 errors
function startLocalServer() {
    const server = http.createServer((req, res) => {
        // serve /player/:id
        const match = req.url.match(/^\/player\/([\w-]+)/)
        if (match) {
            const id = match[1]
            let url = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=1&autoplay=1&playsinline=1&modestbranding=1&rel=0e`
            if (id.startsWith("compact_")) {
                url = `https://www.youtube-nocookie.com/embed/${id.substring(8)}?autoplay=1&controls=0&mute=1&disablekb=1&loop=1&vq=medium&playlist=${id.substring(8)}&cc_lang_pref=ja&enablejsapi=true`
            }
            if (id.startsWith("banner_")) {
                url = `https://www.youtube-nocookie.com/embed/${id.substring(7)}?autoplay=1&controls=0&mute=1&disablekb=1&loop=1&playlist=${id.substring(7)}&cc_lang_pref=ja&enablejsapi=true`
            }
            const html = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        background-color: black;
      }
      iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
      }
    </style>
  </head>
        <body style="margin:0;background:black;">
          <iframe
            src="${url}"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
            >
          </iframe>
        </body>
        </html>
      `
            res.writeHead(200, { "Content-Type": "text/html" })
            res.end(html)
            return
        }

        res.writeHead(404)
        res.end("Not found")
    })

    server.listen(0) // random free port
    const port = server.address().port
    console.log(`Local server running at http://127.0.0.1:${port}`)
    localServerPort = port
    return port
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Custom protocol for web content
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Registered at module scope, before app ready, as Electron requires.
function setupCustomProtocol() {
    protocol.registerSchemesAsPrivileged([{
        scheme: "app", privileges: {
            standard: true,
            secure: true,
            allowServiceWorkers: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
        }
    }
    ])
}

setupCustomProtocol()

// Chromium flags only take effect when they are on the command line before the app is ready.
setupChromiumFlags()

// The staged "live" build (written by the launch build) wins, then the bundled copy shipped with
// a packaged install, then nothing — with no frontend at all, the splash page is served for
// everything, because the splash is the only screen that can build one or explain what failed.
function getWebPath() {
    const liveWebPath = getLiveWebDir(app)
    if (fs.existsSync(path.join(liveWebPath, "index.html"))) return liveWebPath
    const bundledWebPath = path.join(__dirname, "../web-mobile")
    if (fs.existsSync(path.join(bundledWebPath, "index.html"))) return bundledWebPath
    return null
}

function withHeader(response) {
    const newHeaders = new Headers(response.headers)
    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin")
    newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless")
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    })
}

function fetchFile(filePath) {
    return net.fetch(`file://${filePath}`)
}

async function serveFromDir(dir, urlPath) {
    let filePath = path.join(dir, urlPath)

    const resolvedPath = path.resolve(filePath)
    const resolvedDir = path.resolve(dir)
    if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
        filePath = path.join(dir, "index.html")
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return withHeader(await fetchFile(filePath))
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        const indexPath = path.join(filePath, "index.html")
        if (fs.existsSync(indexPath)) {
            return withHeader(await fetchFile(indexPath))
        }
    }
    return null
}

// Unlike Denshi, the protocol is always registered: there is no dev server to fall back to, and
// the splash page (which the boot depends on) is itself served through it.
function setupAppProtocol() {
    const splashPath = path.join(__dirname, "../splash")

    protocol.handle("app", async (request) => {
        const requestUrl = new URL(request.url)
        const urlPath = requestUrl.pathname

        // The splash is a self-contained page served from the same app://- origin, so the
        // localStorage it writes during setup is the web app's localStorage.
        if (urlPath === "/splash.html" || urlPath === "/splash" || urlPath === "/splashscreen") {
            return withHeader(await fetchFile(path.join(splashPath, "splash.html")))
        }

        const webPath = getWebPath()
        if (!webPath) {
            // No frontend yet (or none built): the splash stands in for the whole app.
            return withHeader(await fetchFile(path.join(splashPath, "splash.html")))
        }

        const served = await serveFromDir(webPath, urlPath)
        if (served) return served

        const ext = path.extname(urlPath)
        if (!ext || ext === ".html") {
            const fallback = await serveFromDir(webPath, "/index.html")
            if (fallback) return fallback
        }

        console.error(`[App Protocol] 404 Not Found: ${urlPath}`)
        return new Response("Not Found", { status: 404 })
    })
}

/////////////////
// Cast
/////////////////

const __CAST_ENABLED__ = true
const CastSender = __CAST_ENABLED__ ? require("./cast/sender").CastSender : null
let castSender = null

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Startup logs
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function logStartupEvent(stage, detail = "") {
    const message = `[STARTUP] ${stage}: ${detail}`
    log.info(message)
}

process.on("uncaughtException", (error) => {
    log.error("Uncaught Exception:", error)

    if (app.isReady()) {
        dialog.showErrorBox("An error occurred", `Uncaught Exception: ${error.message}\n\nCheck the logs for more details.`)
    }

    logStartupEvent("UNCAUGHT EXCEPTION", error.stack || error.message)
})

process.on("unhandledRejection", (reason, promise) => {
    log.error("Unhandled Rejection at:", promise, "reason:", reason)
    logStartupEvent("UNHANDLED REJECTION", reason?.stack || reason?.message || JSON.stringify(reason))
})

function logEnvironmentInfo() {
    logStartupEvent("NODE_ENV", process.env.NODE_ENV || "not set")
    logStartupEvent("Platform", process.platform)
    logStartupEvent("Architecture", process.arch)
    logStartupEvent("Node version", process.version)
    logStartupEvent("Electron version", process.versions.electron)
    logStartupEvent("App path", app.getAppPath())
    logStartupEvent("Dir name", __dirname)
    logStartupEvent("User data path", app.getPath("userData"))
}

let mainWindow = null
let splashScreen = null
let popoutPlayerWindow = null
let isShutdown = false
let mainWindowStartupReady = false

let bootState = "building" // building | ready | failed
let bootPromise = null

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Single instance
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on("second-instance", (event, commandLine, workingDirectory, additionalData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            if (!mainWindow.isVisible()) {
                showMainWindow()
            }
            mainWindow.focus()
        }
    })
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Main window
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function showEditableContextMenu(webContents, params) {
    if (!params.isEditable) return

    const template = [
        { role: "undo", enabled: params.editFlags.canUndo },
        { role: "redo", enabled: params.editFlags.canRedo },
        { type: "separator" },
        { role: "cut", enabled: params.editFlags.canCut },
        { role: "copy", enabled: params.editFlags.canCopy },
        { role: "paste", enabled: params.editFlags.canPaste },
        { role: "selectAll", enabled: params.editFlags.canSelectAll },
    ]

    Menu.buildFromTemplate(template).popup({
        window: BrowserWindow.fromWebContents(webContents) ?? undefined,
    })
}

function createMainWindow() {
    logStartupEvent("Creating main window")
    mainWindowStartupReady = false
    const savedPlacement = getSafeWindowPlacement(mobileSettings.windowBounds)

    const windowOptions = {
        ...savedPlacement.bounds, show: false,
        backgroundColor: "#0b0d12",
        acceptFirstMouse: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, "preload.js"),
            webSecurity: true,
            allowRunningInsecureContent: true,
            enableBlinkFeatures: "FontAccess, AudioVideoTracks",
            backgroundThrottling: false,
            webviewTag: true,
        }
    }

    // Set title bar style based on platform — the app draws its own phone chrome.
    if (process.platform === "darwin") {
        windowOptions.titleBarStyle = "hiddenInset"
    }

    if (process.platform === "win32") {
        windowOptions.titleBarStyle = "hidden"
    }

    mainWindow = new BrowserWindow(windowOptions)

    mainWindow.webContents.on("context-menu", (event, params) => {
        if (!params.isEditable) return

        event.preventDefault()
        showEditableContextMenu(mainWindow.webContents, params)
    })

    if (process.platform === "win32" || process.platform === "linux") {
        mainWindow.setMenuBarVisibility(false)
    }

    mainWindow.on("render-process-gone", (event, details) => {
        console.log("[Main] Render process gone", details)
        log.error("[MainWindow] render-process-gone", details)
    })

    // Diagnostics: surface main-window load failures + console messages to main-process log
    mainWindow.webContents.on("preload-error", (_e, preloadPath, err) => {
        log.error("[MainWindow] preload-error", preloadPath, err)
    })
    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
        log.error("[MainWindow] did-fail-load", code, desc, url)
    })
    mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
        if (level >= 2) {
            log.warn(`[MainWindow console L${level}] ${message} (${sourceId}:${line})`)
        }
    })

    if (SMOKE_TEST) {
        mainWindow.webContents.openDevTools({ mode: "detach" })
    }

    mainWindow.webContents.on("will-attach-webview", (event, webPreferences, params) => {
        if (!isAllowedLocalEmbedURL(params.src)) {
            log.warn(`[Mobile] Blocked unexpected webview src ${params.src}`)
            event.preventDefault()
            return
        }

        delete webPreferences.preload
        delete webPreferences.preloadURL
        delete params.preload

        webPreferences.nodeIntegration = false
        webPreferences.contextIsolation = true
        webPreferences.sandbox = true
        webPreferences.webSecurity = true
        webPreferences.allowRunningInsecureContent = true

        params.allowpopups = false
    })

    mainWindow.webContents.setWindowOpenHandler(({ webContents, frameName, url }) => {
        // Open external links in the default browser
        if (url.startsWith("http://") || url.startsWith("https://")) {
            shell.openExternal(url)
            return { action: "deny" }
        }

        // For internal app:// links, do not spawn a new renderer, navigate the main window
        // so it remains a single renderer.
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.loadURL(url)
            }
        } catch (e) {
            console.warn("setWindowOpenHandler fallback loadURL failed", e)
        }

        return { action: "deny" }
    })

    // Load the web content.
    // When global.__seaDeferMainLoad is set (no server config yet), the load is skipped; the
    // boot flow loads the main app after the user resolves setup, preventing the hidden window
    // from spamming WS retries during setup.
    if (global.__seaDeferMainLoad) {
        mainWindow.__deferLoad = true
        logStartupEvent("Main window load deferred until server config is resolved")
    } else {
        logStartupEvent("Loading production build with custom protocol")
        mainWindow.loadURL("app://-")
    }

    mainWindow.on("close", (event) => {
        if (!isShutdown) {
            event.preventDefault()
            // A phone app closes like a phone app: the window goes away and the app exits.
            // (State is saved by cleanupAndExit via before-quit.)
            cleanupAndExit()
        }
    })
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Splash screen (static page, served through app:// so its localStorage is the app's)
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function createSplashScreen() {
    logStartupEvent("Creating splash screen")
    splashScreen = new BrowserWindow({
        // The splash always shows: with no tray, an invisible launch would leave the app
        // unreachable until the process is killed.
        width: 430, height: 760, frame: false, resizable: false, show: true,
        backgroundColor: "#0b0d12", webPreferences: {
            nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js")
        }
    })

    splashScreen.webContents.on("render-process-gone", (_e, details) => {
        log.error("[Splash] render-process-gone", details)
    })
    splashScreen.webContents.on("preload-error", (_e, preloadPath, err) => {
        log.error("[Splash] preload-error", preloadPath, err)
    })
    splashScreen.webContents.on("did-fail-load", (_e, code, desc, url) => {
        log.error("[Splash] did-fail-load", code, desc, url)
    })
    splashScreen.webContents.on("console-message", (_e, level, message, line, sourceId) => {
        if (level >= 2) {
            log.warn(`[Splash console L${level}] ${message} (${sourceId}:${line})`)
        }
    })

    if (SMOKE_TEST || process.env.SEANIME_MOBILE_DEBUG_SPLASH) {
        splashScreen.webContents.openDevTools({ mode: "detach" })
    }

    logStartupEvent("Loading splash screen with custom protocol")
    splashScreen.loadURL("app://-/splash.html")
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Exit
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function cleanupAndExit() {
    console.log("[Main] Cleaning up and exiting")
    if (isShutdown) return
    isShutdown = true

    saveMainWindowState()

    if (__CAST_ENABLED__ && castSender) {
        castSender.destroy()
        castSender = null
    }

    setTimeout(() => {
        app.exit(0)
    }, 300)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Boot: build the frontend, then wire up the server connection
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const sendToSplash = (channel, payload) => {
    const send = () => {
        if (splashScreen && !splashScreen.isDestroyed()) {
            splashScreen.webContents.send(channel, payload)
        }
    }
    if (splashScreen && !splashScreen.isDestroyed()) {
        if (splashScreen.webContents.isLoading()) {
            splashScreen.webContents.once("did-finish-load", send)
        } else {
            send()
        }
    }
}

function proceedToConnection() {
    const cfg = loadServerConfig()
    if (cfg && cfg.remote_url) {
        logStartupEvent("Boot: remote mode", cfg.remote_url)
        sendToSplash("remote-ready", { remote_url: cfg.remote_url })
        // The splash normally acks within milliseconds and loads the main window itself. If it
        // never does — a wedged or closed splash — load it here anyway: the config is on disk and
        // localStorage carries the URL from the previous run, so nothing is lost by not waiting.
        setTimeout(ensureMainWindowLoaded, 5000)
    } else {
        logStartupEvent("Boot: no server config — show setup")
        sendToSplash("show-setup", {})
    }
}

async function runBoot() {
    if (bootPromise) return bootPromise
    bootState = "building"
    sendToSplash("build-progress", { percent: 0, label: "Preparing" })

    bootPromise = (async () => {
        try {
            const result = await buildFrontend({
                app,
                log,
                configuredRepoPath: mobileSettings.sourceRepoPath,
                onProgress: (p) => sendToSplash("build-progress", p),
            })
            bootState = "ready"
            logStartupEvent("Frontend build finished", result.skipped ? "up to date" : "rebuilt")
        } catch (err) {
            bootState = "failed"
            log.error("[Mobile] Frontend build failed:", err)
            const canContinue = !!getWebPath()
            sendToSplash("build-failed", { message: err?.message ?? String(err), canContinue })
            if (!canContinue) return // nothing to load; wait for a retry
        }
        proceedToConnection()
    })().finally(() => {
        bootPromise = null
    })

    return bootPromise
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialization
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.whenReady().then(async () => {
    logStartupEvent("App ready")

    mobileSettings = loadMobileSettings()
    log.info("[Mobile] Loaded settings:", JSON.stringify(mobileSettings))

    logEnvironmentInfo()

    ipcMain.on("startup:renderer-ready", (event) => {
        if (!mainWindow || event.sender !== mainWindow.webContents || mainWindowStartupReady) {
            return
        }

        mainWindowStartupReady = true
        logStartupEvent("RENDERER READY", "main window committed first frame")
    })

    setupAppProtocol()
    startLocalServer()

    // The main app's load is ALWAYS deferred until the boot flow hands over, not just when there
    // is no server config: launch rebuilds the frontend when the source changed, and a window that
    // loads before that finishes serves the previous build — the live directory is then swapped out
    // from under it and every lazily-loaded route chunk 404s (ChunkLoadError), leaving the renderer
    // crash-looping on whatever screen is up, which is the login screen. ensureMainWindowLoaded()
    // runs once the build has been staged and the splash has handed over.
    global.__seaDeferMainLoad = true

    createMainWindow()
    global.__seaDeferMainLoad = false
    createSplashScreen()

    if (SMOKE_TEST) {
        logStartupEvent("SMOKE TEST", "will exit 8 seconds after the main window loads")
        let exited = false
        const smokeExit = (code) => {
            if (exited) return
            exited = true
            logStartupEvent("SMOKE TEST DONE", `exit ${code}`)
            app.exit(code)
        }
        mainWindow.webContents.on("did-finish-load", () => {
            logStartupEvent("SMOKE TEST", "main window finished loading")
            setTimeout(() => smokeExit(0), 8000)
        })
        // If the main window never loads (e.g. no config), still exit — successfully if the
        // frontend built, since that was the part under test.
        setTimeout(() => smokeExit(bootState === "failed" ? 1 : 0), 45000)
    }

    // Register Window Control IPC handlers.
    // These act on the window that sent the request, not unconditionally on the main window:
    // the main window and the popout player window both draw the app's own title bar.
    function senderWindow(event) {
        try {
            const win = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null
            if (win && !win.isDestroyed()) return win
        } catch {
        }
        return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    }

    ipcMain.on("window:minimize", (event) => {
        senderWindow(event)?.minimize()
    })

    ipcMain.on("window:maximize", (event) => {
        senderWindow(event)?.maximize()
    })

    ipcMain.on("window:close", (event) => {
        senderWindow(event)?.close()
    })

    ipcMain.on("window:toggleMaximize", (event) => {
        const win = senderWindow(event)
        if (!win) return
        if (win.isMaximized()) {
            win.unmaximize()
        } else {
            win.maximize()
        }
    })

    ipcMain.on("window:hide", (event) => {
        const win = senderWindow(event)
        if (!win) return
        if (win === mainWindow) {
            hideMainWindow()
        } else {
            win.hide()
        }
    })

    ipcMain.on("window:show", (event) => {
        const win = senderWindow(event)
        if (!win) return
        if (win === mainWindow) {
            showMainWindow()
        } else {
            win.show()
        }
    })

    ipcMain.handle("window:getCurrentWindow", (event) => {
        const win = senderWindow(event)
        return win?.id
    })

    ipcMain.handle("window:isMainWindow", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        return win === mainWindow
    })

    ipcMain.handle("window:isMaximized", (event) => {
        return senderWindow(event)?.isMaximized() ?? false
    })

    ipcMain.handle("window:isMinimizable", (event) => {
        return senderWindow(event)?.minimizable ?? false
    })

    ipcMain.handle("window:isMaximizable", (event) => {
        return senderWindow(event)?.maximizable ?? false
    })

    ipcMain.handle("window:isClosable", (event) => {
        return senderWindow(event)?.closable ?? false
    })

    ipcMain.handle("window:isFullscreen", (event) => {
        return senderWindow(event)?.isFullScreen() ?? false
    })

    ipcMain.on("window:setFullscreen", (event, fullscreen) => {
        senderWindow(event)?.setFullScreen(!!fullscreen)
    })

    ipcMain.handle("window:isVisible", (event) => {
        return senderWindow(event)?.isVisible() ?? false
    })

    // ── Popout player window ────────────────────────────────────────────────────────
    // A separate always-on-top window that takes over playback ("pop out of the app").
    // The renderer hands playback off to it, so it plays the stream directly — native
    // decoding and the app's own subtitle/controls rendering, with no canvas pipeline.
    ipcMain.handle("window:open-player-popout", (event, url) => {
        if (typeof url !== "string" || !mainWindow || mainWindow.isDestroyed()) {
            throw new Error("Popout unavailable")
        }

        // Only allow URLs on the same scheme+host as the main window's current page, so the
        // renderer can never make the shell load arbitrary web content.
        let target
        let mainUrl
        try {
            target = new URL(url)
            mainUrl = new URL(mainWindow.webContents.getURL())
        } catch {
            throw new Error("Invalid popout URL")
        }
        if (target.protocol !== mainUrl.protocol || target.host !== mainUrl.host) {
            throw new Error("Blocked non-app popout URL")
        }

        if (popoutPlayerWindow && !popoutPlayerWindow.isDestroyed()) {
            popoutPlayerWindow.loadURL(url)
            popoutPlayerWindow.show()
            popoutPlayerWindow.focus()
            return
        }

        popoutPlayerWindow = new BrowserWindow({
            width: 430,
            height: 320,
            minWidth: 320,
            minHeight: 240,
            resizable: true,
            alwaysOnTop: true,
            frame: false,
            backgroundColor: "#111111",
            title: "Seaserver",
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                preload: path.join(__dirname, "preload.js"),
                webSecurity: true,
                allowRunningInsecureContent: true,
                enableBlinkFeatures: "FontAccess, AudioVideoTracks",
                backgroundThrottling: false,
            },
        })

        if (process.platform === "win32" || process.platform === "linux") {
            popoutPlayerWindow.setMenuBarVisibility(false)
        }

        popoutPlayerWindow.webContents.on("preload-error", (_e, preloadPath, err) => {
            log.error("[PopoutWindow] preload-error", preloadPath, err)
        })
        popoutPlayerWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
            log.error("[PopoutWindow] did-fail-load", code, desc, url)
        })
        popoutPlayerWindow.webContents.on("render-process-gone", (_e, details) => {
            log.error("[PopoutWindow] render-process-gone", details)
        })
        popoutPlayerWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
            if (level >= 2) {
                log.warn(`[PopoutWindow console L${level}] ${message} (${sourceId}:${line})`)
            }
        })

        popoutPlayerWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
            if (openUrl.startsWith("http://") || openUrl.startsWith("https://")) {
                shell.openExternal(openUrl)
            }
            return { action: "deny" }
        })

        popoutPlayerWindow.on("maximize", () => {
            if (popoutPlayerWindow && !popoutPlayerWindow.isDestroyed()) {
                popoutPlayerWindow.webContents.send("window:maximized")
            }
        })
        popoutPlayerWindow.on("unmaximize", () => {
            if (popoutPlayerWindow && !popoutPlayerWindow.isDestroyed()) {
                popoutPlayerWindow.webContents.send("window:unmaximized")
            }
        })

        popoutPlayerWindow.once("ready-to-show", () => {
            if (popoutPlayerWindow && !popoutPlayerWindow.isDestroyed()) {
                popoutPlayerWindow.show()
            }
        })

        popoutPlayerWindow.on("closed", () => {
            popoutPlayerWindow = null
        })

        popoutPlayerWindow.loadURL(url)
    })

    // ── Popout player aspect ratio ───────────────────────────────────────────────────
    // The renderer reports the video's aspect ratio once the stream's metadata is known, and
    // the window is locked to it.
    ipcMain.handle("window:set-player-popout-aspect-ratio", (event, ratio) => {
        const aspect = Number(ratio)
        if (!popoutPlayerWindow || popoutPlayerWindow.isDestroyed()) return
        if (!Number.isFinite(aspect) || aspect <= 0) return

        if (popoutPlayerWindow.__aspectRatio === aspect) return
        popoutPlayerWindow.__aspectRatio = aspect

        popoutPlayerWindow.setAspectRatio(aspect)

        const { width, height } = popoutPlayerWindow.getBounds()
        let wanted = Math.round(width / aspect)
        try {
            const wa = require("electron").screen.getPrimaryDisplay().workArea
            wanted = Math.min(wanted, wa.height - 80)
        } catch {}
        if (wanted > 0 && Math.abs(wanted - height) > 2) {
            popoutPlayerWindow.setBounds({ width, height: wanted })
        }
    })

    // ── Popout player dragging ───────────────────────────────────────────────────────
    // The popout is frameless and has no OS drag region, so the page reports drags itself:
    // a start message pins the window's bounds, and each move applies the pointer delta to them.
    let popoutDragOrigin = null
    ipcMain.on("window:popout-drag-start", (event) => {
        if (!popoutPlayerWindow || popoutPlayerWindow.isDestroyed()) return
        if (event.sender !== popoutPlayerWindow.webContents) return
        if (popoutPlayerWindow.isMaximized()) {
            popoutDragOrigin = null
            return
        }
        popoutDragOrigin = popoutPlayerWindow.getBounds()
    })
    ipcMain.on("window:popout-drag-move", (event, dx, dy) => {
        if (!popoutDragOrigin || !popoutPlayerWindow || popoutPlayerWindow.isDestroyed()) return
        if (event.sender !== popoutPlayerWindow.webContents) return
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
        popoutPlayerWindow.setBounds({
            x: Math.round(popoutDragOrigin.x + dx),
            y: Math.round(popoutDragOrigin.y + dy),
            width: popoutDragOrigin.width,
            height: popoutDragOrigin.height,
        })
    })
    ipcMain.on("window:popout-drag-end", () => {
        popoutDragOrigin = null
    })

    // ── Return from popout ───────────────────────────────────────────────────────────
    // Sends the file and playback position back to the main window, which restarts the stream
    // there and seeks to the same time; then the popout closes.
    ipcMain.handle("window:return-player-from-popout", (event, state) => {
        if (!popoutPlayerWindow || popoutPlayerWindow.isDestroyed()) return
        if (event.sender !== popoutPlayerWindow.webContents) return
        if (!mainWindow || mainWindow.isDestroyed()) return
        if (!state || typeof state.path !== "string") return

        const time = Number(state.time)
        mainWindow.webContents.send("player:return-from-popout", {
            path: state.path,
            time: Number.isFinite(time) && time > 0 ? time : 0,
            paused: !!state.paused,
        })

        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
        popoutPlayerWindow.close()
    })

    // Clipboard handler
    ipcMain.handle("clipboard:writeText", (_, text) => {
        if (text) {
            return require("electron").clipboard.writeText(text)
        }
        return false
    })

    // In remote mode the server lives on another machine and this shell has no process to
    // restart. Reloading the window lets the client reconnect to the remote server on its own.
    ipcMain.on("restart-server", () => {
        console.log("EVENT restart-server")
        console.log("[Main] Remote mode: reloading the window to reconnect")
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.reload()
        }
    })

    // Watch for window events to notify renderer
    if (mainWindow) {
        mainWindow.on("minimize", () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("window:minimized")
            }
        })

        mainWindow.on("hide", () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("window:hidden")
            }
        })

        mainWindow.on("maximize", () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("window:maximized")
            }
        })

        mainWindow.on("unmaximize", () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("window:unmaximized")
            }
        })
    }

    ipcMain.on("quit-app", () => {
        console.log("EVENT quit-app")
        cleanupAndExit()
    })

    ipcMain.handle("get-local-server-port", () => localServerPort)

    ////////////////////////////////////////////////////////////////////////////////////
    // Frontend build IPC ("live update" surface, adapted for the mobile shell)
    //
    // The settings page's "Update frontend" button and the build-on-launch engine share the
    // same pipeline. Backend updates do not exist here: the backend runs on the server.
    ////////////////////////////////////////////////////////////////////////////////////

    let rebuildBusy = false

    async function rebuildFrontend(force) {
        if (rebuildBusy) {
            return { ok: false, error: "Another build is already running." }
        }
        rebuildBusy = true
        try {
            const result = await buildFrontend({
                app,
                log,
                configuredRepoPath: mobileSettings.sourceRepoPath,
                onProgress: (p) => {
                    for (const win of BrowserWindow.getAllWindows()) {
                        if (!win.isDestroyed()) {
                            win.webContents.send("live-update:progress", { target: "frontend", percent: p.percent, step: p.label, line: p.line ?? p.label })
                        }
                    }
                },
                force,
            })
            // Stage changed → reload everything so the new build is picked up.
            if (!result.skipped || force) {
                setTimeout(() => {
                    for (const win of BrowserWindow.getAllWindows()) {
                        if (!win.isDestroyed() && /^(app|http):/.test(win.webContents.getURL())) {
                            win.webContents.reloadIgnoringCache()
                        }
                    }
                }, 400)
            }
            return { ok: true, message: result.skipped ? "Frontend is already up to date." : "Frontend rebuilt; reloading." }
        } catch (err) {
            return { ok: false, error: err?.message ?? String(err) }
        } finally {
            rebuildBusy = false
        }
    }

    ipcMain.handle("live-update:frontend", () => rebuildFrontend(true))
    ipcMain.handle("live-update:check-frontend", async () => {
        try {
            const { hashSourceTree } = require("./mobile-build")
            const root = require("./mobile-build").resolveRepoRoot(mobileSettings.sourceRepoPath, [__dirname, app.getAppPath(), process.cwd()])
            if (!root) return { ok: false, error: "Frontend source not found." }
            const hash = hashSourceTree(path.join(root, "seanime-web"))
            const statePath = path.join(app.getPath("userData"), "mobile-build-state.json")
            let state = {}
            try { state = JSON.parse(fs.readFileSync(statePath, "utf8")) } catch {}
            return { ok: true, upToDate: state.hash === hash && !!getWebPath() }
        } catch (err) {
            return { ok: false, error: err?.message ?? String(err) }
        }
    })
    ipcMain.handle("live-update:backend", async () => ({ ok: false, error: "The backend runs on the server; update it there." }))
    ipcMain.handle("live-update:check-backend", async () => ({ ok: false, error: "The backend runs on the server; check it there." }))
    ipcMain.handle("live-update:info", () => {
        const { resolveRepoRoot } = require("./mobile-build")
        const root = resolveRepoRoot(mobileSettings.sourceRepoPath, [__dirname, app.getAppPath(), process.cwd()])
        return {
            repoRoot: root,
            remote: true,
            busy: rebuildBusy,
            hasLiveFrontend: fs.existsSync(path.join(getLiveWebDir(app), "index.html")),
        }
    })

    // Mobile settings IPC (same channel names Denshi's frontend already calls)
    ipcMain.handle("denshi:getSettings", () => {
        return { ...mobileSettings }
    })

    ipcMain.handle("denshi:setSettings", (_, newSettings) => {
        mobileSettings = { ...MOBILE_SETTINGS_DEFAULTS, ...mobileSettings, ...newSettings }
        saveMobileSettings(mobileSettings)
        log.info("[Mobile] Settings updated:", JSON.stringify(mobileSettings))
        return { ...mobileSettings }
    })

    //////////////////////////////////////////////////////////////////////////////////
    // Discord Rich Presence (LOCAL bridge for remote-server setups)
    //
    // The seanime Go server normally talks to Discord's IPC pipe on the SAME
    // machine as the server. When the server runs on a different machine than
    // Electron + Discord, that path is unavailable. The server therefore also
    // broadcasts every activity change over WebSocket; the renderer forwards
    // those events here so we can update Discord on THIS machine instead.
    //////////////////////////////////////////////////////////////////////////////////
    let _discordRPC = null
    let _discordRPCClientId = null
    let _discordRPCReady = false
    let _discordRPCConnecting = null
    let _discordRPCLastFailLog = 0

    async function ensureDiscordRPC(clientId) {
        if (!clientId) return null
        if (_discordRPC && _discordRPCReady && _discordRPCClientId === clientId) {
            return _discordRPC
        }
        if (_discordRPC && _discordRPCClientId !== clientId) {
            try { _discordRPC.destroy() } catch { /* ignore */ }
            _discordRPC = null
            _discordRPCReady = false
        }
        if (_discordRPCConnecting) return _discordRPCConnecting
        _discordRPCConnecting = (async () => {
            try {
                const { Client: DiscordRPCClient } = require("@xhayper/discord-rpc")
                const client = new DiscordRPCClient({ clientId, transport: { type: "ipc" } })
                client.on("ready", () => {
                    log.info("[DiscordRPC] Ready (clientId=" + clientId + ")")
                })
                client.on("disconnected", () => {
                    log.info("[DiscordRPC] Disconnected")
                    _discordRPCReady = false
                })
                await client.login()
                _discordRPC = client
                _discordRPCClientId = clientId
                _discordRPCReady = true
                return client
            } catch (err) {
                const now = Date.now()
                if (now - _discordRPCLastFailLog > 30000) {
                    _discordRPCLastFailLog = now
                    log.warn("[DiscordRPC] Failed to connect: " + (err && err.message ? err.message : err))
                }
                _discordRPC = null
                _discordRPCReady = false
                return null
            } finally {
                _discordRPCConnecting = null
            }
        })()
        return _discordRPCConnecting
    }

    function mapDiscordPayload(p) {
        if (!p || typeof p !== "object") return null
        const activity = {}
        if (p.name) activity.name = String(p.name)
        if (p.details) activity.details = String(p.details)
        if (p.state) activity.state = String(p.state)
        if (typeof p.startTimestamp === "number") activity.startTimestamp = p.startTimestamp
        if (typeof p.endTimestamp === "number") activity.endTimestamp = p.endTimestamp
        if (p.largeImage) activity.largeImageKey = String(p.largeImage)
        if (p.largeText) activity.largeImageText = String(p.largeText)
        if (p.smallImage) activity.smallImageKey = String(p.smallImage)
        if (p.smallText) activity.smallImageText = String(p.smallText)
        if (Array.isArray(p.buttons) && p.buttons.length > 0) {
            activity.buttons = p.buttons
                .filter(b => b && b.label && b.url)
                .slice(0, 2)
                .map(b => ({ label: String(b.label), url: String(b.url) }))
            if (activity.buttons.length === 0) delete activity.buttons
        }
        if (typeof p.type === "number") activity.type = p.type
        if (typeof p.statusDisplayType === "number") activity.statusDisplayType = p.statusDisplayType
        activity.instance = !!p.instance
        return activity
    }

    ipcMain.handle("discord:setActivity", async (_, payload) => {
        try {
            if (!payload || typeof payload !== "object") return false
            const clientId = payload.applicationId
            if (!clientId) return false
            const client = await ensureDiscordRPC(clientId)
            if (!client || !_discordRPCReady) return false
            const activity = mapDiscordPayload(payload)
            if (!activity) return false
            if (!client.user) return false
            await client.user.setActivity(activity)
            log.info("[DiscordRPC] setActivity applied")
            return true
        } catch (err) {
            log.warn("[DiscordRPC] setActivity failed:", err && err.message ? err.message : err)
            return false
        }
    })

    ipcMain.handle("discord:clearActivity", async () => {
        try {
            if (_discordRPC && _discordRPCReady && _discordRPC.user) {
                await _discordRPC.user.clearActivity()
            }
            return true
        } catch (err) {
            log.warn("[DiscordRPC] clearActivity failed:", err && err.message ? err.message : err)
            return false
        }
    })

    app.on("before-quit", () => {
        try {
            if (_discordRPC) {
                _discordRPC.destroy()
                _discordRPC = null
                _discordRPCReady = false
            }
        } catch { /* ignore */ }
    })

    // Server connection IPC (connect-only)
    ipcMain.handle("server-config:get", () => {
        return loadServerConfig()
    })

    ipcMain.handle("server-config:save", (_, cfg) => {
        if (!cfg || cfg.mode !== "remote") {
            // A mobile client does not host the server; a "local" request is refused, not
            // silently converted, so whoever sent it learns the rule.
            throw new Error("Denshi Mobile connects to a server; it does not host one. Use remote mode.")
        }
        const remote_url = String(cfg.remote_url || "").replace(/\/+$/, "")
        if (!remote_url) {
            throw new Error("remote_url is required")
        }
        const ok = saveServerConfig({ mode: "remote", remote_url })
        if (!ok) throw new Error("Failed to write server config")
        return { mode: "remote", remote_url }
    })

    ipcMain.handle("server-config:validate", async (_, url) => {
        try {
            await validateRemoteServer(url)
            return { ok: true }
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
    })

    ipcMain.on("server-config:launch-local", () => {
        logStartupEvent("server-config:launch-local — refused (connect-only client)")
    })

    ipcMain.on("server-config:remote-ready-ack", () => {
        logStartupEvent("server-config:remote-ready-ack — closing splash, showing main")
        ensureMainWindowLoaded()
        // If the main window booted before any frontend was staged, it was served the splash
        // fallback page; swap in the real app now that a build exists.
        try {
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.__deferLoad && getWebPath()) {
                const currentUrl = mainWindow.webContents.getURL() || ""
                if (/^app:\/\/-\/splash(\.html)?$/i.test(currentUrl)) {
                    logStartupEvent("Main window was showing the splash fallback; loading the frontend")
                    mainWindow.loadURL("app://-")
                }
            }
        } catch { /* best effort */ }
        if (splashScreen && !splashScreen.isDestroyed()) {
            splashScreen.close()
            splashScreen = null
        }
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (mobileSettings.windowMaximized) {
                    mainWindow.maximize()
                }
                mainWindow.show()
                mainWindow.focus()
            }
            if (SMOKE_TEST) {
                logStartupEvent("SMOKE TEST", "setup resolved; main window shown")
            }
        }, 300)
    })

    // Build engine retry / continue, driven from the splash screen
    ipcMain.on("build:retry", () => {
        logStartupEvent("build:retry")
        sendToSplash("build:reset")
        void runBoot()
    })

    ipcMain.on("build:continue", () => {
        logStartupEvent("build:continue — proceeding with the existing frontend")
        bootState = "ready"
        proceedToConnection()
    })

    // Chromecast

    if (__CAST_ENABLED__) {

        function ensureCastSender() {
            if (!castSender) {
                castSender = new CastSender()

                castSender.on("deviceFound", (device) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send("cast:deviceFound", device)
                    }
                })
                castSender.on("sessionUpdate", (state) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send("cast:sessionUpdate", state)
                    }
                })
                castSender.on("mediaStatus", (status) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send("cast:mediaStatus", status)
                    }
                })
                castSender.on("receiverReady", () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send("cast:receiverReady")
                    }
                })
                castSender.on("error", (err) => {
                    log.error("[Cast] Error:", err)
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send("cast:error", err)
                    }
                })
            }
            return castSender
        }

        ipcMain.handle("cast:discover", async () => {
            const sender = ensureCastSender()
            sender.startDiscovery()
        })

        ipcMain.handle("cast:stopDiscovery", async () => {
            if (castSender) castSender.stopDiscovery()
        })

        ipcMain.handle("cast:getDevices", async () => {
            if (!castSender) return []
            return castSender.getDevices()
        })

        ipcMain.handle("cast:connect", async (_, deviceId) => {
            const sender = ensureCastSender()
            return await sender.connect(deviceId)
        })

        ipcMain.handle("cast:disconnect", async () => {
            if (castSender) castSender.disconnect()
        })

        ipcMain.handle("cast:getStatus", async () => {
            if (!castSender) return { connected: false, device: null, sessionId: null, mediaStatus: null }
            return castSender.getStatus()
        })

        ipcMain.handle("cast:loadMedia", async (_, opts) => {
            if (!castSender) throw new Error("Cast sender not initialized")
            return castSender.loadMedia(opts)
        })

        ipcMain.handle("cast:play", async () => {
            if (castSender) castSender.play()
        })

        ipcMain.handle("cast:pause", async () => {
            if (castSender) castSender.pause()
        })

        ipcMain.handle("cast:seek", async (_, time) => {
            if (castSender) castSender.seek(time)
        })

        ipcMain.handle("cast:stop", async () => {
            if (castSender) castSender.stop()
        })

        ipcMain.handle("cast:setVolume", async (_, level) => {
            if (castSender) castSender.setVolume(level)
        })

        ipcMain.handle("cast:setMuted", async (_, muted) => {
            if (castSender) castSender.setMuted(muted)
        })

        ipcMain.handle("cast:sendSubtitleEvents", async (_, events) => {
            if (castSender) castSender.sendSubtitleEvents(events)
        })

        ipcMain.handle("cast:sendSubtitleTracks", async (_, tracks) => {
            if (castSender) castSender.sendSubtitleTracks(tracks)
        })

        ipcMain.handle("cast:switchSubtitleTrack", async (_, trackNumber) => {
            if (castSender) castSender.switchSubtitleTrack(trackNumber)
        })

        ipcMain.handle("cast:sendFonts", async (_, fontUrls, serverPort) => {
            if (castSender) castSender.sendFonts(fontUrls, serverPort)
        })

        ipcMain.handle("cast:sendSubtitleHeader", async (_, header) => {
            if (castSender) castSender.sendSubtitleHeader(header)
        })

        ipcMain.handle("cast:disableSubtitles", async () => {
            if (castSender) castSender.disableSubtitles()
        })

        ipcMain.handle("cast:getLanIP", async () => {
            const sender = ensureCastSender()
            return sender.getLanIP()
        })

    }

    app.on("window-all-closed", () => {
        app.quit()
    })

    app.on("before-quit", () => {
        cleanupAndExit()
    })

    // Kick off the boot: build the frontend, then wire the connection.
    void runBoot()
})
