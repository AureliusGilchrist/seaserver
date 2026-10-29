import { __isElectronDesktop__ } from "@/types/constants"
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

/** Script run inside the trailer page: tells its YouTube player to play with sound at a volume. */
function youtubeSoundScript(sound: boolean | undefined, volume: number, captions?: string) {
    const commands = sound === undefined
        ? []
        : sound
            ? [`{"event":"command","func":"unMute","args":[]}`, `{"event":"command","func":"setVolume","args":[${Math.round(volume)}]}`, `{"event":"command","func":"playVideo","args":[]}`]
            : [`{"event":"command","func":"mute","args":[]}`]
    if (captions) {
        commands.push(`{"event":"command","func":"loadModule","args":["captions"]}`)
        commands.push(`{"event":"command","func":"setOption","args":["captions","track",{"languageCode":"${captions}"}]}`)
    }
    return `(() => { const f = document.querySelector("iframe"); if (!f || !f.contentWindow) return false; ${commands.map(c => `f.contentWindow.postMessage('${c}', "*");`).join(" ")} return true })()`
}

export function ElectronYoutubeEmbed({ trailerId, isCompact, isBanner, sound, volume = 50, captions, ...props }: {
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

    // Sound: sent a few times after load, since YouTube's player takes a moment to listen.
    const loadedRef = React.useRef(false)
    React.useEffect(() => {
        const webview = webviewRef.current as any
        if (!webview || (sound === undefined && !captions)) return
        const timers: ReturnType<typeof setTimeout>[] = []
        const send = () => {
            try {
                void webview.executeJavaScript?.(youtubeSoundScript(sound, volume, captions))
            }
            catch {
                // Not ready yet; a later attempt follows.
            }
        }
        const schedule = () => {
            for (const ms of [300, 1200, 2500, 4500]) timers.push(setTimeout(send, ms))
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
