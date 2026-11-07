// Controls a YouTube embed through its iframe API (postMessage), for card trailers: sound with a
// fade-in, mute, and captions.
//
// Trailers autoplay muted (browsers only autoplay silent video). With sound on, the volume starts at
// 0 and rises to the target over `fadeMs` once the player reports that it is actually playing — not
// when the page loads, which can be seconds earlier — so the sound eases in with the picture.
//
// The function is self-contained on purpose: Denshi runs it inside its trailer page (a webview) as
// `(fn.toString())(iframe, opts)`, so it may not reference anything outside itself.

export type YoutubeControlOptions = {
    /** true: fade in to `volume`; false: mute; undefined: leave the sound alone. */
    sound?: boolean
    volume: number
    fadeMs: number
    /** Caption language to turn on, e.g. "en". */
    captions?: string
}

/** Returns a function that stops the control (clears its timers and listener). */
export function controlYoutubeFrame(frame: HTMLIFrameElement | null, opts: YoutubeControlOptions): () => void {
    var w = frame && frame.contentWindow
    if (!w) return function () {}
    var win = w
    var host = window as any
    if (host.__seaYoutubeControlStop) host.__seaYoutubeControlStop()

    var post = function (func: string, args: unknown[]) {
        win.postMessage(JSON.stringify({ event: "command", func: func, args: args }), "*")
    }
    var playingAt = 0
    var configured = false
    var onMessage = function (e: MessageEvent) {
        if (e.source !== win) return
        var data: any
        try {
            data = typeof e.data === "string" ? JSON.parse(e.data) : e.data
        }
        catch (err) {
            return
        }
        if (!data || data.event !== "infoDelivery" || !data.info) return
        if (!playingAt && (data.info.playerState === 1 || data.info.currentTime > 0)) playingAt = Date.now()
    }
    window.addEventListener("message", onMessage)

    if (opts.sound === true) {
        post("setVolume", [0])
    } else if (opts.sound === false) {
        post("mute", [])
    }

    var started = Date.now()
    var timer = setInterval(function () {
        // The player only reports its state to a parent that has said it is listening.
        win.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*")
        // Some embeds never report; after a few seconds assume it is playing.
        if (!playingAt && Date.now() - started > 6000) playingAt = Date.now()
        if (!playingAt) return
        if (!configured) {
            configured = true
            if (opts.captions) {
                post("loadModule", ["captions"])
                post("setOption", ["captions", "track", { languageCode: opts.captions }])
            }
            if (opts.sound === false) post("mute", [])
        }
        if (opts.sound !== true) {
            stop()
            return
        }
        var p = Math.min(1, (Date.now() - playingAt) / Math.max(1, opts.fadeMs))
        // Eased in, so the start of the fade is gentle rather than a jump.
        post("setVolume", [Math.round(opts.volume * p * p)])
        post("unMute", [])
        if (p >= 1) stop()
    }, 80)

    var stop = function () {
        clearInterval(timer)
        window.removeEventListener("message", onMessage)
        if (host.__seaYoutubeControlStop === stop) host.__seaYoutubeControlStop = null
    }
    host.__seaYoutubeControlStop = stop
    return stop
}

/** The same control as a script for a webview page whose only iframe is the YouTube player. */
export function youtubeControlScript(opts: YoutubeControlOptions): string {
    return `(() => { const f = document.querySelector("iframe"); if (!f || !f.contentWindow) return false; (${controlYoutubeFrame.toString()})(f, ${JSON.stringify(opts)}); return true })()`
}

export const TRAILER_FADE_MS = 2500

export type YoutubePlaybackState = "playing" | "unavailable"

/**
 * Tells whether a YouTube embed really plays. A video that was removed, made private or blocked from
 * playing on other sites still loads the embed — it just shows YouTube's "Video unavailable" page.
 * The embed's iframe API reports which: `playing` once it plays, `unavailable` on a player error or
 * when the player talks but nothing has played after `timeoutMs`. A player that never says anything
 * (the API unreachable) counts as playing after a few seconds, as before, so a working trailer is
 * never hidden for want of an answer. Reported once. Self-contained like controlYoutubeFrame.
 */
export function watchYoutubeFrame(frame: HTMLIFrameElement | null, onState: (state: YoutubePlaybackState) => void, timeoutMs?: number): () => void {
    var w = frame && frame.contentWindow
    if (!w) return function () {}
    var win = w
    var done = false
    var finish = function (state: YoutubePlaybackState) {
        if (done) return
        done = true
        stop()
        onState(state)
    }
    var onMessage = function (e: MessageEvent) {
        if (e.source !== win) return
        var data: any
        try {
            data = typeof e.data === "string" ? JSON.parse(e.data) : e.data
        }
        catch (err) {
            return
        }
        if (!data) return
        heard = true
        if (data.event === "onError") {
            finish("unavailable")
            return
        }
        var info = data.info
        if (!info) return
        if (data.event === "onStateChange" && info === 1) finish("playing")
        if ((data.event === "infoDelivery" || data.event === "initialDelivery") && (info.playerState === 1 || info.currentTime > 0)) finish("playing")
    }
    window.addEventListener("message", onMessage)
    var heard = false
    var started = Date.now()
    var limit = timeoutMs || 10000
    var timer = setInterval(function () {
        // The player only reports to a parent that has said it is listening.
        win.postMessage(JSON.stringify({ event: "listening", id: 2, channel: "widget" }), "*")
        var elapsed = Date.now() - started
        if (!heard && elapsed > 4000) finish("playing")
        else if (elapsed > limit) finish("unavailable")
    }, 250)
    var stop = function () {
        clearInterval(timer)
        window.removeEventListener("message", onMessage)
    }
    return function () {
        done = true
        stop()
    }
}

/** The watcher as a webview script: it records the result on the page, read back with youtubeWatchResultScript. */
export function youtubeWatchScript(timeoutMs: number): string {
    return `(() => { const f = document.querySelector("iframe"); if (!f || !f.contentWindow) return false; if (window.__seaYtWatch) return true; window.__seaYtWatch = "pending"; (${watchYoutubeFrame.toString()})(f, s => { window.__seaYtWatch = s }, ${timeoutMs}); return true })()`
}

export const youtubeWatchResultScript = `window.__seaYtWatch || ""`
