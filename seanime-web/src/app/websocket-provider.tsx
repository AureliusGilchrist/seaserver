import { getServerBaseUrl } from "@/api/client/server-url"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { websocketAtom, WebSocketContext } from "@/app/(main)/_atoms/websocket.atoms"
import { ElectronRestartServerPrompt } from "@/app/(main)/_electron/electron-restart-server-prompt"
import { __openDrawersAtom } from "@/components/ui/drawer"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import { useMainTab } from "@/hooks/use-main-tab"
import { logger } from "@/lib/helpers/debug"
import { usePathname } from "@/lib/navigation.ts"
import { useRouter } from "@/lib/navigation.ts"
import { __isElectronDesktop__ } from "@/types/constants"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import React, { useRef } from "react"
import { useCookies } from "react-cookie"
import { ImSpinner5 } from "react-icons/im"
import { ImSpinner6 } from "react-icons/im"
import { ImSpinner3 } from "react-icons/im"
import { ImSpinner4 } from "react-icons/im"
import { ImSpinner2 } from "react-icons/im"
import { RemoveScrollBar } from "react-remove-scroll-bar"
import { useEffectOnce } from "react-use"


export function uuidv4(): string {
    // @ts-ignore
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
    )
}

export const websocketConnectedAtom = atom(false)
export const websocketConnectionErrorCountAtom = atom(0)

export const clientIdAtom = atom<string | null>(null)

/**
 * The id this window's websocket (and its player requests) use.
 *
 * The desktop popout player shares the main window's cookies, so it used to share its client id
 * too — and the server sends a client's events to every connection with that id. The popout's
 * stream therefore also opened in the main window's full-window player, out of sight behind the
 * popout, playing the same file a second time; "Return to Denshi" then brought the main window
 * forward onto that player instead of the page the stream came from. The popout gets its own id;
 * the cookie (sessions, rate limits) stays the shared one.
 */
function socketClientId(cookieId: string): string {
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/popout-player")) {
        return `${cookieId}-popout`
    }
    return cookieId
}

const isMainTabAtom = atom(false)

export function useIsMainTab() {
    return useAtomValue(isMainTabAtom)
}

export function useIsMainTabRef() {
    const isMainTab = useIsMainTab()
    const isMainTabRef = useRef(isMainTab)

    React.useLayoutEffect(() => {
        isMainTabRef.current = isMainTab
    }, [isMainTab])

    return isMainTabRef
}

export function WebsocketProvider({ children }: { children: React.ReactNode }) {
    const [socket] = useAtom(websocketAtom)
    const [isConnected] = useAtom(websocketConnectedAtom)

    // Splashscreen runs before any server is reachable (e.g. first-time setup, remote-mode boot).
    // Do NOT mount the websocket manager, the "Connecting..." overlay, or the Electron restart-server
    // prompt here — otherwise the splash window will spam connection attempts and auto-fire a
    // server restart after a few errors, which crashes the desktop boot flow.
    //
    // We can't use usePathname() here because WebsocketProvider is rendered above the TanStack
    // Router in the tree (inside ClientProviders). Use window.location directly instead.
    // The pathname can be "/splashscreen", "/splashscreen/", or "/splashscreen/index.html"
    // depending on how the custom app:// protocol resolves the URL, so use a regex.
    const isSplashscreen = typeof window !== "undefined"
        && (/(^|\/)splashscreen(\/|$)/.test(window.location.pathname)
            || /(^|\/)splashscreen(\/|$)/.test(window.location.hash))

    if (isSplashscreen) {
        return (
            <WebSocketContext.Provider value={null}>
                {children}
            </WebSocketContext.Provider>
        )
    }

    return (
        <>
            <WebsocketManagement />
            <ManageOpenDrawers />
            {__isElectronDesktop__ && <ElectronRestartServerPrompt />}
            <WebSocketContext.Provider value={socket}>
                <ServerDownModal />
                {!isConnected && <div
                    className="sea-float-bottom-2 fixed right-4 bottom-4 bg-gray-950 border text-sm py-2 px-4 font-semibold rounded-xl z-[100] flex gap-2 items-center opacity-70"
                >
                    <ImSpinner2 className="animate-spin text-base" />
                    Connecting...
                </div>}
                {children}
            </WebSocketContext.Provider>
        </>
    )
}

const serverDownReasonAtom = atom<string | null>(null)

// An in-place pop-up while the server is unreachable. It never navigates anywhere, and it goes
// away on its own once the websocket reconnects (which also refreshes the data).
function ServerDownModal() {
    const isConnected = useAtomValue(websocketConnectedAtom)
    const errorCount = useAtomValue(websocketConnectionErrorCountAtom)
    const [reason, setReason] = useAtom(serverDownReasonAtom)
    const queryClient = useQueryClient()
    const wasDown = React.useRef(false)

    useWebsocketMessageListener<{ reason?: string }>({
        type: WSEvents.SERVER_GOING_DOWN,
        onMessage: (data) => setReason(data?.reason || "maintenance"),
    })

    React.useEffect(() => {
        if (!isConnected) {
            wasDown.current = true
            return
        }
        setReason(null)
        if (wasDown.current) {
            wasDown.current = false
            queryClient.invalidateQueries()
        }
    }, [isConnected])

    const visible = !isConnected && (!!reason || errorCount >= 1)
    if (!visible) return null

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="max-w-md mx-4 rounded-2xl border border-white/10 bg-gray-950/90 p-6 text-center space-y-3 shadow-2xl">
                <ImSpinner2 className="animate-spin text-2xl mx-auto" />
                <p className="text-lg font-semibold">
                    Server is down due to {reason || "an unexpected problem"}, please wait or contact Aurelius.
                </p>
                <p className="text-sm text-[--muted]">Attempting to reconnect every 5 seconds…</p>
            </div>
        </div>
    )
}

function ManageOpenDrawers() {
    const openDrawers = useAtomValue(__openDrawersAtom)
    if (openDrawers.length > 0) return <RemoveScrollBar />
    return null
}

function WebsocketManagement() {
    const [socket, setSocket] = useAtom(websocketAtom)
    const [isConnected, setIsConnected] = useAtom(websocketConnectedAtom)
    const setConnectionErrorCount = useSetAtom(websocketConnectionErrorCountAtom)

    const [cookies, setCookie, removeCookie] = useCookies(["Seanime-Client-Id"])

    // Password set, user not yet logged in → ws connection fails (401), reconnect loop retries. Once the user logs in, serverAuthTokenRef updates,
    // next reconnect succeeds.
    const serverAuthToken = useAtomValue(serverAuthTokenAtom)
    const serverAuthTokenRef = React.useRef(serverAuthToken)
    const prevServerTokenRef = React.useRef(serverAuthToken)
    React.useEffect(() => {
        serverAuthTokenRef.current = serverAuthToken
    }, [serverAuthToken])

    // Reconnect websocket when server auth token changes
    React.useEffect(() => {
        if (serverAuthToken !== prevServerTokenRef.current) {
            logger("WebsocketProvider").info("Server auth token changed, reconnecting websocket")
            prevServerTokenRef.current = serverAuthToken
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.close(1000, "Server auth token changed")
            }
        }
    }, [serverAuthToken])

    // Profile session token for profile-scoped WS events
    const profileSessionToken = useAtomValue(profileSessionTokenAtom)
    const profileSessionTokenRef = React.useRef(profileSessionToken)
    const prevProfileTokenRef = React.useRef(profileSessionToken)
    React.useEffect(() => {
        profileSessionTokenRef.current = profileSessionToken
    }, [profileSessionToken])

    // Reconnect websocket when profile token changes to establish correct profile context
    React.useEffect(() => {
        // Only reconnect if token actually changed and we had a previous value
        if (profileSessionToken !== prevProfileTokenRef.current) {
            logger("WebsocketProvider").info("Profile token changed, reconnecting websocket")
            prevProfileTokenRef.current = profileSessionToken
            // Trigger reconnection by closing current socket
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.close(1000, "Profile token changed")
            }
        }
    }, [profileSessionToken])

    const [, setClientId] = useAtom(clientIdAtom)
    const setMainTab = useSetAtom(isMainTabAtom)

    const isMainTab = useMainTab()
    React.useLayoutEffect(() => {
        setMainTab(isMainTab)
    }, [isMainTab])

    // Refs to manage connection state
    const heartbeatRef = React.useRef<NodeJS.Timeout | null>(null)
    const pingIntervalRef = React.useRef<NodeJS.Timeout | null>(null)
    const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
    const immediateRetryUsedRef = React.useRef(false)
    const lastPongRef = React.useRef<number>(Date.now())
    const socketRef = React.useRef<WebSocket | null>(null)
    const wasDisconnected = React.useRef<boolean>(false)
    const initialConnection = React.useRef<boolean>(true)

    React.useEffect(() => {
        logger("WebsocketProvider").info("Seanime-Client-Id", cookies["Seanime-Client-Id"])
        if (cookies["Seanime-Client-Id"]) {
            setClientId(socketClientId(cookies["Seanime-Client-Id"]))
        }
    }, [cookies])

    // Effect to handle page reload on reconnection
    /* React.useEffect(() => {
     // If we're connected now and were previously disconnected (not the first connection)
     if (isConnected && wasDisconnected.current && !initialConnection.current) {
     logger("WebsocketProvider").info("Connection re-established, reloading page")
     // Add a small delay to allow for other components to process the connection status
     setTimeout(() => {
     window.location.reload()
     }, 100)
     }

     // Update the wasDisconnected ref when connection status changes
     if (!isConnected && !initialConnection.current) {
     wasDisconnected.current = true
     }

     // After first connection, set initialConnection to false
     if (isConnected && initialConnection.current) {
     initialConnection.current = false
     }
     }, [isConnected]) */

    useEffectOnce(() => {
        function clearAllIntervals(keepReconnect = false) {
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current)
                heartbeatRef.current = null
            }
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current)
                pingIntervalRef.current = null
            }
            if (!keepReconnect && reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current)
                reconnectTimeoutRef.current = null
            }
        }

        function connectWebSocket() {
            // Clear existing connection attempts
            clearAllIntervals()

            // Close any existing socket
            if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
                try {
                    socketRef.current.close()
                }
                catch (e) {
                    // Ignore errors on closing
                }
            }

            // The scheme follows the *server's* address, not the page's. The Android shell serves its
            // pages from https://localhost while talking to a plain-http server, so keying off the
            // page made it dial wss:// at an http server: every HTTP call worked (they go through the
            // native HTTP plugin) but the websocket never connected, and the "server is down" overlay
            // sat on top of the login screen.
            const serverBase = getServerBaseUrl(false)
            const wsScheme = /^https:/i.test(serverBase) ? "wss"
                : /^http:/i.test(serverBase) ? "ws"
                    : (document.location.protocol == "https:" ? "wss" : "ws")
            const wsUrl = `${wsScheme}://${getServerBaseUrl(true)}/events`
            const clientId = cookies["Seanime-Client-Id"] || uuidv4()

            try {
                const tokenParam = serverAuthTokenRef.current ? `&token=${encodeURIComponent(serverAuthTokenRef.current)}` : ""
                const profileTokenParam = profileSessionTokenRef.current ? `&profileToken=${encodeURIComponent(profileSessionTokenRef.current)}` : ""
                socketRef.current = new WebSocket(`${wsUrl}?id=${socketClientId(clientId)}${tokenParam}${profileTokenParam}`)

                // Reset the last pong timestamp whenever we connect
                lastPongRef.current = Date.now()

                socketRef.current.addEventListener("open", () => {
                    logger("WebsocketProvider").info("WebSocket connection opened")
                    setIsConnected(true)
                    setConnectionErrorCount(0)
                    immediateRetryUsedRef.current = false

                    // Set cookie if it doesn't exist
                    if (!cookies["Seanime-Client-Id"]) {
                        setCookie("Seanime-Client-Id", clientId, {
                            path: "/",
                            sameSite: "lax",
                            secure: false,
                            maxAge: 14 * 24 * 60 * 60, // 14 days
                        })
                    }

                    // Start heartbeat interval to detect silent disconnections
                    heartbeatRef.current = setInterval(() => {
                        const timeSinceLastPong = Date.now() - lastPongRef.current

                        // If no pong received for 45 seconds (3 missed pings), consider connection dead
                        if (timeSinceLastPong > 45000) {
                            logger("WebsocketProvider").error(`No pong response for ${Math.round(timeSinceLastPong / 1000)}s, reconnecting`)
                            reconnectSocket()
                            return
                        }

                        if (socketRef.current?.readyState !== WebSocket.OPEN) {
                            logger("WebsocketProvider").error("Heartbeat check failed, reconnecting")
                            reconnectSocket()
                        }
                    }, 15000) // check every 15 seconds

                    // Implement a ping mechanism to keep the connection alive
                    // Start the ping interval slightly offset from the heartbeat to avoid race conditions
                    setTimeout(() => {
                        pingIntervalRef.current = setInterval(() => {
                            if (socketRef.current?.readyState === WebSocket.OPEN) {
                                try {
                                    const timestamp = Date.now()
                                    // Send a ping message to keep the connection alive
                                    socketRef.current?.send(JSON.stringify({
                                        type: "ping",
                                        payload: { timestamp },
                                        clientId: clientId,
                                    }))
                                }
                                catch (e) {
                                    logger("WebsocketProvider").error("Failed to send ping", e)
                                    reconnectSocket()
                                }
                            } else {
                                logger("WebsocketProvider").error("Failed to send ping, WebSocket not open", socketRef.current?.readyState)
                                // reconnectSocket()
                            }
                        }, 15000) // ping every 15 seconds
                    }, 5000) // Start ping interval 5 seconds after heartbeat to offset them
                })

                // Add message handler for pong responses
                socketRef.current?.addEventListener("message", (event) => {
                    try {
                        const data = JSON.parse(event.data) as { type: string; payload?: any }
                        if (data.type === "pong") {
                            // Update the last pong timestamp
                            lastPongRef.current = Date.now()
                            // For debugging purposes
                            // logger("WebsocketProvider").info("Pong received, timestamp updated", lastPongRef.current)
                        }
                    }
                    catch (e) {
                    }
                })

                const thisSocket = socketRef.current
                socketRef.current?.addEventListener("close", (event) => {
                    if (thisSocket !== socketRef.current) return
                    // Warn, not info: the desktop shell only forwards console warnings and
                    // errors to the app log, and a disconnect is exactly the kind of event
                    // that needs to be visible there when something goes wrong.
                    logger("WebsocketProvider").warning(`WebSocket connection closed: ${event.code} ${event.reason}`)
                    handleDisconnection()
                })

                socketRef.current?.addEventListener("error", (event) => {
                    if (thisSocket !== socketRef.current) return
                    logger("WebsocketProvider").error("WebSocket encountered an error:", event)
                    reconnectSocket()
                })

                setSocket(socketRef.current)
            }
            catch (e) {
                logger("WebsocketProvider").error("Failed to create WebSocket connection:", e)
                handleDisconnection()
            }
        }

        function handleDisconnection() {
            // error and close both report one drop; keep a retry that is already pending
            clearAllIntervals(true)
            setIsConnected(false)
            scheduleReconnect()
        }

        function reconnectSocket() {
            if (socketRef.current) {
                try {
                    socketRef.current.close()
                }
                catch (e) {
                    // Ignore errors on closing
                }
            }
            handleDisconnection()
        }

        function scheduleReconnect() {
            // error and close both land here for one drop; keep the retry already pending
            if (reconnectTimeoutRef.current) return
            // The first retry after a drop is immediate; later ones wait 5s.
            const backoffTime = immediateRetryUsedRef.current ? 5000 : 0
            immediateRetryUsedRef.current = true
            setConnectionErrorCount(count => count + 1)

            logger("WebsocketProvider").warning(`Reconnecting in ${backoffTime}ms`)

            reconnectTimeoutRef.current = setTimeout(() => {
                reconnectTimeoutRef.current = null
                connectWebSocket()
            }, backoffTime)
        }

        if (!socket || socket.readyState === WebSocket.CLOSED) {
            // If the socket is not set or the connection is closed, initiate a new connection
            connectWebSocket()
        }

        return () => {
            if (socketRef.current) {
                try {
                    socketRef.current.close()
                }
                catch (e) {
                    // Ignore errors on closing
                }
            }
            setIsConnected(false)
            // Cleanup all intervals on unmount
            clearAllIntervals()
        }
    })

    return null
}
