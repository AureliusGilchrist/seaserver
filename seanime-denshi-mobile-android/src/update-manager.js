/**
 * Denshi Mobile — the shell layer that rides in every frontend bundle.
 *
 * Two jobs, both invisible when things are healthy:
 *
 *  1. Connection. The app reads its server URL from localStorage (the same contract the Electron
 *     splash writes). This script seeds it — synchronously on cold boot, from the native side,
 *     before the app's first status fetch — and shows a setup overlay on first run or whenever
 *     the configured server stops answering, so the user is never stranded.
 *
 *  2. Updates. It asks the server for the published frontend manifest; a version newer than the
 *     one running is downloaded, unzipped natively, hot-swapped via Capacitor's WebView plugin
 *     (setServerBasePath + persistServerBasePath, restored automatically on cold start), and the
 *     app reloads into it. The shell updates along with the app: every bundle carries this file.
 *
 * Every failure is silent by design — the frontend already on screen is always good enough to
 * keep running, and the next check happens soon enough.
 */
;(function () {
    "use strict"

    var REMOTE_URL_KEY = "sea-remote-server-url"
    var CONNECTION_MODE_KEY = "sea-server-connection-mode"
    var VERSION_KEY = "sea-apk-frontend-version"
    var LAST_ATTEMPT_KEY = "sea-apk-update-last-attempt"
    var PILL_DISMISS_KEY = "sea-apk-pill-dismissed-at"
    var DEFAULT_SERVER_URL = "http://169.254.119.91:43211"

    var CHECK_INTERVAL_MS = 30 * 60 * 1000
    var FIRST_CHECK_DELAY_MS = 8000
    var MIN_RETRY_MS = 60 * 1000

    function log() {
        try { console.log.apply(console, ["[DenshiShell]"].concat(Array.prototype.slice.call(arguments))) } catch (e) {}
    }

    // Native-registered plugins live at Capacitor.Plugins.<name>; some builds also mirror them
    // onto window.<name>. Resolve either way, so the shell never depends on which one is real.
    function plugin(name) {
        try {
            var cap = window.Capacitor
            if (cap && cap.Plugins && cap.Plugins[name]) return cap.Plugins[name]
        } catch (e) {}
        return window[name] || null
    }

    function lsGet(key) {
        try { return localStorage.getItem(key) } catch (e) { return null }
    }
    function lsSet(key, value) {
        try { localStorage.setItem(key, value) } catch (e) {}
    }

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise(function (_, reject) { window.setTimeout(function () { reject(new Error("timed out")) }, ms) }),
        ])
    }

    // -----------------------------------------------------------------------------------------
    // Connection
    // -----------------------------------------------------------------------------------------

    function getServerUrl() {
        var raw = lsGet(REMOTE_URL_KEY)
        if (!raw) return null
        try {
            var url = JSON.parse(raw)
            return typeof url === "string" && url ? url.replace(/\/+$/, "") : null
        } catch (e) {
            return null
        }
    }

    function writeServerKeys(url) {
        lsSet(REMOTE_URL_KEY, JSON.stringify(url))
        lsSet(CONNECTION_MODE_KEY, JSON.stringify("remote"))
    }

    function persistServerUrlNatively(url) {
        var shell = plugin("MobileShell")
        if (shell && shell.saveServerUrl) {
            shell.saveServerUrl({ url: url }).catch(function () {})
        }
    }

    // The native shell exposes the saved URL synchronously (addJavascriptInterface). Because this
    // script runs as a synchronous head script — ahead of the app's deferred scripts — seeding
    // localStorage here means the app's very first status fetch already points at the server.
    // Returns true when a seed happened.
    function seedServerUrlSync() {
        try {
            if (lsGet(REMOTE_URL_KEY)) return false
            var iface = window.DenshiShellConfig
            if (!iface || typeof iface.getServerUrl !== "function") return false
            var url = iface.getServerUrl()
            if (!url) return false
            writeServerKeys(String(url))
            log("seeded server url from native prefs")
            return true
        } catch (e) {
            return false
        }
    }

    // Belt and braces for builds without the sync interface: seed via the plugin bridge, then
    // reload once so the app re-reads localStorage with the URL in place.
    function seedServerUrlAsync() {
        if (lsGet(REMOTE_URL_KEY)) return
        var shell = plugin("MobileShell")
        if (!shell || !shell.getServerUrl) return
        shell.getServerUrl().then(function (r) {
            var url = r && r.url ? String(r.url).replace(/\/+$/, "") : null
            if (!url || lsGet(REMOTE_URL_KEY)) return
            writeServerKeys(url)
            log("seeded server url via plugin; reloading")
            window.setTimeout(function () { window.location.reload() }, 250)
        }).catch(function () {})
    }

    function checkServerReachable(url) {
        if (!url) return Promise.resolve(false)
        var request = fetch(url + "/api/v1/status", { method: "GET", disableCache: true }).then(function (res) {
            // Any real response means a server is there; a seanime status endpoint answers 200.
            return res.ok || res.status === 401 || res.status === 403
        })
        return withTimeout(request, 6000).catch(function () { return false })
    }

    // -----------------------------------------------------------------------------------------
    // Setup overlay — first run, and the way back when a server disappears
    // -----------------------------------------------------------------------------------------

    var overlayEl = null

    function buildOverlay() {
        var el = document.createElement("div")
        el.id = "denshi-shell-setup"
        el.setAttribute("style", [
            "position:fixed", "inset:0", "z-index:2147483647",
            "background:radial-gradient(120% 90% at 50% 0%, #0a1220 0%, #04060a 60%)",
            "display:flex", "flex-direction:column", "align-items:center", "justify-content:center",
            "font-family:-apple-system,'Segoe UI',Roboto,sans-serif", "color:#e5e7eb",
            "padding:32px", "box-sizing:border-box", "opacity:0", "transition:opacity .35s ease",
        ].join(";"))

        el.innerHTML = [
            '<img src="/deus-ex-aeternae-emblem.svg" alt="" style="width:84px;height:84px;margin-bottom:18px;filter:drop-shadow(0 0 24px rgba(56,189,248,.25))"/>',
            '<div style="font-size:13px;letter-spacing:.55em;color:#9ca3af;margin-bottom:6px;text-indent:.55em">DENSHI</div>',
            '<div style="font-size:12px;color:#6b7280;margin-bottom:40px">Connect to your server</div>',
            '<input id="denshi-shell-url" type="url" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%;max-width:340px;box-sizing:border-box;padding:13px 14px;border-radius:12px;border:1px solid #1f2937;background:#0c1017;color:#f3f4f6;font-size:15px;outline:none;text-align:center"/>',
            '<button id="denshi-shell-connect" style="width:100%;max-width:340px;margin-top:12px;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#0ea5e9,#38bdf8);color:#04060a;font-size:15px;font-weight:600;cursor:pointer">Connect</button>',
            '<div id="denshi-shell-error" style="min-height:20px;margin-top:14px;font-size:12.5px;color:#f87171;text-align:center"></div>',
        ].join("")

        document.body.appendChild(el)

        var input = el.querySelector("#denshi-shell-url")
        var button = el.querySelector("#denshi-shell-connect")
        var error = el.querySelector("#denshi-shell-error")
        var busy = false

        function attempt() {
            if (busy) return
            var url = (input.value || "").trim()
            if (!url) return
            if (!/^https?:\/\//i.test(url)) url = "http://" + url
            url = url.replace(/\/+$/, "")

            busy = true
            button.textContent = "Connecting…"
            error.textContent = ""

            checkServerReachable(url).then(function (ok) {
                if (!ok) {
                    busy = false
                    button.textContent = "Connect"
                    error.textContent = "Couldn't reach a server there — check the address and your network."
                    return
                }
                writeServerKeys(url)
                persistServerUrlNatively(url)
                button.textContent = "Connected"
                el.style.opacity = "0"
                window.setTimeout(function () {
                    if (el && el.parentNode) el.parentNode.removeChild(el)
                    overlayEl = null
                    window.location.reload()
                }, 350)
            })
        }

        button.addEventListener("click", attempt)
        input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") attempt() })

        return el
    }

    function showSetupOverlay(prefill) {
        if (overlayEl) return
        if (!document.body) return
        overlayEl = buildOverlay()
        var input = overlayEl.querySelector("#denshi-shell-url")
        input.value = prefill || DEFAULT_SERVER_URL
        window.setTimeout(function () { overlayEl.style.opacity = "1" }, 30)
        window.setTimeout(function () { input.focus(); input.select() }, 350)
    }

    function maybeShowSetup() {
        if (overlayEl) return
        if (getServerUrl()) return
        log("no server configured — showing setup")
        showSetupOverlay(null)
    }

    // A quiet escape hatch for when a previously-working server goes away: after the app has
    // settled, a couple of failed status checks raise a small tappable pill offering setup.
    function watchReachability() {
        var failures = 0
        var checks = 0

        var timer = window.setInterval(function () {
            checks += 1
            var url = getServerUrl()
            if (!url || overlayEl) {
                if (checks >= 30) window.clearInterval(timer)
                return
            }
            checkServerReachable(url).then(function (ok) {
                if (ok) {
                    failures = 0
                } else {
                    failures += 1
                    if (failures >= 2) {
                        failures = 0
                        var dismissed = 0
                        try { dismissed = Number(lsGet(PILL_DISMISS_KEY) || 0) } catch (e) {}
                        if (Date.now() - dismissed > 10 * 60 * 1000) showUnreachablePill()
                    }
                }
                if (checks >= 30) window.clearInterval(timer)
            })
        }, 8000)
    }

    function showUnreachablePill() {
        if (document.getElementById("denshi-shell-pill")) return
        var pill = document.createElement("div")
        pill.id = "denshi-shell-pill"
        pill.setAttribute("style", [
            "position:fixed", "left:16px", "right:16px", "bottom:88px", "z-index:2147483646",
            "display:flex", "align-items:center", "justify-content:space-between", "gap:12px",
            "padding:12px 16px", "border-radius:14px", "box-sizing:border-box",
            "background:rgba(10,15,25,.92)", "border:1px solid #1e293b",
            "backdrop-filter:blur(8px)", "-webkit-backdrop-filter:blur(8px)",
            "font-family:-apple-system,'Segoe UI',Roboto,sans-serif", "font-size:13px", "color:#cbd5e1",
            "box-shadow:0 8px 30px rgba(0,0,0,.5)", "transform:translateY(16px)", "opacity:0",
            "transition:all .3s ease",
        ].join(";"))
        pill.innerHTML = [
            '<span style="flex:1">Server unreachable — connect to a different one?</span>',
            '<span id="denshi-shell-pill-go" style="color:#38bdf8;font-weight:600;cursor:pointer">Change</span>',
        ].join("")
        document.body.appendChild(pill)

        window.setTimeout(function () {
            pill.style.transform = "translateY(0)"
            pill.style.opacity = "1"
        }, 30)

        pill.querySelector("#denshi-shell-pill-go").addEventListener("click", function () {
            removePill()
            showSetupOverlay(getServerUrl())
        })
        window.setTimeout(removePill, 15000)
        function removePill() {
            lsSet(PILL_DISMISS_KEY, String(Date.now()))
            var p = document.getElementById("denshi-shell-pill")
            if (p && p.parentNode) p.parentNode.removeChild(p)
        }
    }

    // -----------------------------------------------------------------------------------------
    // Updates
    // -----------------------------------------------------------------------------------------

    function getActiveVersion() {
        return lsGet(VERSION_KEY) || "bundled"
    }

    // Ask the native plugin which version directory is actually being served, so a cleared
    // localStorage doesn't cause a pointless re-download of what is already installed.
    function nativeActiveVersion() {
        var shell = plugin("MobileShell")
        if (!shell || !shell.activeFrontendVersion) return Promise.resolve(null)
        return shell.activeFrontendVersion().then(function (r) {
            return r && r.version ? r.version : null
        }).catch(function () { return null })
    }

    function fetchManifest(serverUrl) {
        var url = serverUrl + "/api/v1/mobile-frontend/manifest"
        // CapacitorHttp is enabled, so window.fetch runs through the native layer — no CORS.
        return fetch(url, { method: "GET", disableCache: true }).then(function (res) {
            if (!res.ok) throw new Error("manifest fetch " + res.status)
            return res.json()
        })
    }

    // The bundle download does NOT go through window.fetch: Capacitor's fetch patch never
    // forwards responseType to the native layer, so a zip comes back as a lossy text decode.
    // The native plugin called directly with responseType "arraybuffer" returns base64, which
    // decodes byte-exact.
    function downloadBundle(serverUrl) {
        var http = plugin("CapacitorHttp")
        if (!http || !http.get) throw new Error("CapacitorHttp plugin unavailable")
        return http
            .get({ url: serverUrl + "/api/v1/mobile-frontend/bundle", responseType: "arraybuffer" })
            .then(function (res) {
                if (res.status < 200 || res.status >= 300) throw new Error("bundle fetch " + res.status)
                return base64ToBytes(res.data)
            })
    }

    function base64ToBytes(b64) {
        var raw = atob(b64)
        var bytes = new Uint8Array(raw.length)
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
        return bytes.buffer
    }

    function bytesToBase64(buffer) {
        var bytes = new Uint8Array(buffer)
        var chunk = 0x8000
        var binary = ""
        for (var i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
        }
        return btoa(binary)
    }

    var running = false

    function checkForUpdate(trigger) {
        if (running) return Promise.resolve(false)
        running = true

        lsSet(LAST_ATTEMPT_KEY, String(Date.now()))

        var serverUrl = getServerUrl()
        if (!serverUrl) {
            running = false
            return Promise.resolve(false)
        }

        return Promise.all([nativeActiveVersion(), fetchManifest(serverUrl)])
            .then(function (results) {
                var nativeVersion = results[0]
                var manifest = results[1]

                if (!manifest || !manifest.version) throw new Error("bad manifest")
                if (manifest.version === nativeVersion || manifest.version === getActiveVersion()) {
                    log("up to date (" + String(manifest.version).slice(0, 12) + ")")
                    return false
                }

                log("new version available " + String(getActiveVersion()).slice(0, 12) + " -> " + String(manifest.version).slice(0, 12) + " (" + trigger + ")")
                return installUpdate(serverUrl, manifest)
            })
            .catch(function (err) {
                log("check skipped:", err && err.message ? err.message : err)
                return false
            })
            .then(function (applied) {
                running = false
                return applied
            })
    }

    function installUpdate(serverUrl, manifest) {
        return downloadBundle(serverUrl)
            .then(function (buffer) {
                // Write the zip into app storage (one bridge call), then let the native
                // plugin unzip, validate and activate it.
                var zipPath = "frontend-update.zip"
                var FS = plugin("Filesystem")
                if (!FS) throw new Error("Filesystem plugin unavailable")
                return FS.writeFile({
                    path: zipPath,
                    data: bytesToBase64(buffer),
                    directory: "DATA",
                    recursive: true,
                }).then(function () {
                    var shell = plugin("MobileShell")
                    if (!shell || !shell.installFrontend) throw new Error("MobileShell plugin unavailable")
                    return shell.installFrontend({
                        zipPath: zipPath,
                        version: manifest.version,
                    })
                })
            })
            .then(function (result) {
                if (!result || !result.ok) throw new Error((result && result.error) || "install failed")
                log("installed " + String(manifest.version).slice(0, 12) + " at " + result.path)

                lsSet(VERSION_KEY, manifest.version)

                // Swap the local server over to the installed directory and come back fresh.
                var WV = plugin("WebView")
                if (!WV) throw new Error("WebView plugin unavailable")
                return WV.setServerBasePath({ path: result.path }).then(function () {
                    return WV.persistServerBasePath({})
                }).then(function () {
                    log("reloading into the new frontend")
                    window.setTimeout(function () { window.location.reload() }, 150)
                })
            })
    }

    function scheduleUpdateLoop() {
        window.setTimeout(function () { checkForUpdate("startup") }, FIRST_CHECK_DELAY_MS)
        window.setInterval(function () { checkForUpdate("interval") }, CHECK_INTERVAL_MS)

        // And whenever the phone returns to the app — the natural moment a user would want
        // last night's update to appear.
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") {
                var last = 0
                try { last = Number(lsGet(LAST_ATTEMPT_KEY) || 0) } catch (e) {}
                if (Date.now() - last > MIN_RETRY_MS) checkForUpdate("resume")
            }
        })
    }

    // -----------------------------------------------------------------------------------------
    // Boot
    // -----------------------------------------------------------------------------------------

    function boot() {
        // Seed (async path may reload once on the very first launch of old builds).
        var seeded = seedServerUrlSync()
        if (!seeded) seedServerUrlAsync()

        if (getServerUrl()) {
            scheduleUpdateLoop()
            watchReachability()
        } else {
            // First run: let the app paint its loading state underneath, then present setup.
            window.setTimeout(maybeShowSetup, 600)
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot)
    } else {
        boot()
    }
})()
