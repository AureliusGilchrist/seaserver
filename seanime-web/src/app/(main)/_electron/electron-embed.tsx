import { __isElectronDesktop__ } from "@/types/constants"
import {
    TRAILER_FADE_MS,
    youtubeControlScript,
    type YoutubePlaybackState,
    youtubeWatchResultScript,
    youtubeWatchScript,
} from "@/app/(main)/_electron/youtube-control"
import React from "react"

export function useElectronYoutubeEmbed() {
    const [localServerPort, setLocalServerPort] = React.useState<number | null>(null)

    React.useEffect(() => {
        (async () => {
            if (__isElectronDesktop__) {
                setLocalServerPort(await window.electron?.localServer?.getPort?.() ?? null)
            }
        })()
    }, [])

    return {
        // 127.0.0.1, not localhost: Denshi only lets a trailer webview attach when its host is exactly
        // 127.0.0.1 (main.js, isAllowedLocalEmbedURL), and cancelled every localhost one — no card
        // trailer played at all.
        electronEmbedAddress: localServerPort ? `http://127.0.0.1:${localServerPort}/player/` : null,
    }
}

export function ElectronYoutubeEmbed({ trailerId, isCompact, isBanner, sound, volume = 50, captions, onPlaybackState, ...props }: {
    isCompact?: boolean,
    isBanner?: boolean,
    trailerId: string | null | undefined
    /** Play with sound. The trailer page starts muted (autoplay needs it); the player is unmuted
     * through YouTube's iframe API once it has loaded. Left undefined, the page's own muting stays. */
    sound?: boolean
    /** 0–100, with sound on. */
    volume?: number
    /** Caption language to turn on (e.g. "en"), when the video has it. */
    captions?: string
    /** Told once whether the video really plays, or shows YouTube's "Video unavailable" page. */
    onPlaybackState?: (state: YoutubePlaybackState) => void
} & React.HTMLAttributes<HTMLWebViewElement>) {
    const { electronEmbedAddress } = useElectronYoutubeEmbed()

    const webviewRef = React.useRef<HTMLWebViewElement | null>(null)

    React.useEffect(() => {
        const webview = webviewRef.current
        if (!webview) return

        const handleFinishLoad = (e: any) => {
            props.onLoad?.(e)
        }

        const handleFailLoad = (e: any) => {
            props.onError?.(e)
        }

        // const handleDomReady = () => {
        //     console.log("dom ready")
        //     // we can inject JS if needed:
        //     // webview.executeJavaScript("console.log('Hello from inside webview')")
        // }

        webview.addEventListener("did-finish-load", handleFinishLoad)
        webview.addEventListener("did-fail-load", handleFailLoad)
        // webview.addEventListener("dom-ready", handleDomReady)

        return () => {
            webview.removeEventListener("did-finish-load", handleFinishLoad)
            webview.removeEventListener("did-fail-load", handleFailLoad)
            // webview.removeEventListener("dom-ready", handleDomReady)
        }
    }, [electronEmbedAddress, trailerId])

    // Sound (faded in), mute and captions go to the player inside the trailer page. The script runs
    // until the player reports playing, so it is sent once the page has its iframe.
    const loadedRef = React.useRef(false)
    React.useEffect(() => {
        const webview = webviewRef.current as any
        if (!webview || (sound === undefined && !captions)) return
        const timers: ReturnType<typeof setTimeout>[] = []
        let done = false
        const send = () => {
            if (done) return
            try {
                Promise.resolve(webview.executeJavaScript?.(youtubeControlScript({ sound, volume, fadeMs: TRAILER_FADE_MS, captions })))
                    .then((ok: unknown) => {
                        if (ok === true) done = true
                    })
                    .catch(() => {})
            }
            catch {
                // Not ready yet; a later attempt follows.
            }
        }
        const schedule = () => {
            done = false
            for (const ms of [200, 800, 1800, 3500]) timers.push(setTimeout(send, ms))
        }
        const onLoad = () => {
            loadedRef.current = true
            schedule()
        }
        if (loadedRef.current) schedule()
        webview.addEventListener("did-finish-load", onLoad)
        return () => {
            timers.forEach(clearTimeout)
            webview.removeEventListener("did-finish-load", onLoad)
        }
    }, [electronEmbedAddress, trailerId, sound, volume, captions])

    // Whether the video really plays (see watchYoutubeFrame), asked of the player inside the trailer page.
    const onPlaybackStateRef = React.useRef(onPlaybackState)
    onPlaybackStateRef.current = onPlaybackState
    React.useEffect(() => {
        const webview = webviewRef.current as any
        if (!webview || !onPlaybackState) return
        let timer: ReturnType<typeof setInterval> | null = null
        let finished = false
        const startedAt = Date.now()
        const run = (script: string) => Promise.resolve(webview.executeJavaScript?.(script)).catch(() => undefined)
        const onLoad = () => {
            if (timer) clearInterval(timer)
            let installed = false
            timer = setInterval(async () => {
                if (finished) return
                if (!installed) installed = (await run(youtubeWatchScript(10000))) === true
                const state = installed ? await run(youtubeWatchResultScript) : ""
                // A page the watcher never gets into plays as before rather than hiding a working trailer.
                const result = state === "playing" || state === "unavailable" ? state : (Date.now() - startedAt > 8000 ? "playing" : null)
                if (!result) return
                finished = true
                if (timer) clearInterval(timer)
                onPlaybackStateRef.current?.(result)
            }, 300)
        }
        webview.addEventListener("did-finish-load", onLoad)
        return () => {
            finished = true
            if (timer) clearInterval(timer)
            webview.removeEventListener("did-finish-load", onLoad)
        }
    }, [electronEmbedAddress, trailerId, !!onPlaybackState])

    if (!electronEmbedAddress) return null

    return <webview
        ref={webviewRef}
        src={`${electronEmbedAddress}${isCompact ? "compact_" : isBanner ? "banner_" : ""}${trailerId}`}
        style={(!isCompact || isBanner) ? { width: "100%", height: "100%" } : {
            width: "180%",
            height: "180%",
            translate: "-25% -20%",
        }}
        allowFullScreen
    />
}
