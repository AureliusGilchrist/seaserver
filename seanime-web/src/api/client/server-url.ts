import { __DEV_SERVER_PORT, TESTONLY__DEV_SERVER_PORT2, TESTONLY__DEV_SERVER_PORT3 } from "@/lib/server/config"
import { __isDesktop__ } from "@/types/constants"

function devOrProd(dev: string, prod: string): string {
    return process.env.NODE_ENV === "development" ? dev : prod
}

/**
 * Read the remote server URL from localStorage (set by the desktop "Connect to" flow).
 * Returns undefined when not in remote mode.
 */
function getStoredRemoteUrl(): string | undefined {
    if (typeof window === "undefined") return undefined
    try {
        const raw = localStorage.getItem("sea-remote-server-url")
        if (!raw) return undefined
        const parsed = JSON.parse(raw) as string | undefined
        return parsed || undefined
    } catch {
        return undefined
    }
}

export function getServerBaseUrl(removeProtocol: boolean = false): string {
    if (__isDesktop__) {
        // Check if the user configured a remote server in the desktop app
        const remoteUrl = getStoredRemoteUrl()
        if (remoteUrl) {
            let ret = remoteUrl.replace(/\/+$/, "")
            if (removeProtocol) {
                ret = ret.replace("http://", "").replace("https://", "")
            }
            return ret
        }

        let ret = devOrProd(`http://127.0.0.1:${__DEV_SERVER_PORT}`, "http://127.0.0.1:43211")
        if (removeProtocol) {
            ret = ret.replace("http://", "").replace("https://", "")
        }
        return ret
    }

    // DEV ONLY: Hack to allow multiple development servers for the same web server
    // localhost:43210 -> 127.0.0.1:43001
    // 192.168.1.100:43210 -> 127.0.0.1:43002
    if (process.env.NODE_ENV === "development" && window.location.host.includes("localhost")) {
        let ret = `http://127.0.0.1:${TESTONLY__DEV_SERVER_PORT2}`
        if (removeProtocol) {
            ret = ret.replace("http://", "").replace("https://", "")
        }
        return ret
    }
    if (process.env.NODE_ENV === "development" && window.location.host.startsWith("192.168")) {
        let ret = `http://127.0.0.1:${TESTONLY__DEV_SERVER_PORT3}`
        if (removeProtocol) {
            ret = ret.replace("http://", "").replace("https://", "")
        }
        return ret
    }

    let ret = typeof window !== "undefined"
        ? (`${window?.location?.protocol}//` + devOrProd(`${window?.location?.hostname}:${__DEV_SERVER_PORT}`, window?.location?.host))
        : ""
    if (removeProtocol) {
        ret = ret.replace("http://", "").replace("https://", "")
    }
    return ret
}
