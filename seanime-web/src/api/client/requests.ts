"use client"
import { isCacheMissError, showCacheMissToast } from "@/lib/helpers/cache-miss-toast"
import { getServerBaseUrl } from "@/api/client/server-url"
import { profileSessionEndedAtom, profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { formatErrorForToast } from "@/lib/helpers/error-details"
import { store } from "@/app/jotai-store"
import { useMutation, UseMutationOptions, useQuery, UseQueryOptions } from "@tanstack/react-query"
import axios, { AxiosError } from "axios"
import { useAtomValue } from "jotai"
import { useAtom } from "jotai/react"
import { usePathname } from "@/lib/navigation"
import { useEffect } from "react"
import { toast } from "sonner"

// CSRF token storage — updated from server response headers
let _csrfToken: string | null = null

// ─── AniList outage detection ───────────────────────────────────────────────
// Exported so the banner component can subscribe to it.
import { atom } from "jotai"
export const anilistOutageAtom = atom(false)

// Track consecutive AniList failures to avoid false positives from single blips
let _anilistFailCount = 0
const ANILIST_FAIL_THRESHOLD = 2

function isAnilistUrl(url: string | undefined): boolean {
    if (!url) return false
    return url.includes("/anilist/") || url.includes("/api/v1/anilist")
}

// Sliding window: when the server emits a refreshed profile token in the response header,
// update the in-memory atom and localStorage so the user stays logged in.
// Also detect expired profile sessions and clear the stale token.
/**
 * The profile token a request was sent with.
 *
 * After a backend update every token from the previous run is answered "expired". Requests sent
 * with the old token are still in flight (or are polls already queued) when you sign in again, and
 * their answers arrive afterwards: clearing the session on those cleared the token you had just
 * signed in with, and the app went back to the sign-in screen, over and over, until Denshi was
 * restarted. Only an answer about the token in use now may end the session.
 */
function sentProfileToken(config: any): string | undefined {
    const headers = config?.headers
    if (!headers) return undefined
    const v = typeof headers.get === "function" ? headers.get("X-Seanime-Profile-Token") : headers["X-Seanime-Profile-Token"]
    return typeof v === "string" && v ? v : undefined
}

axios.interceptors.response.use(response => {
    // Clear outage flag on any successful AniList response
    if (isAnilistUrl(response.config?.url)) {
        _anilistFailCount = 0
        if (store.get(anilistOutageAtom)) {
            store.set(anilistOutageAtom, false)
        }
    }
    // Capture CSRF token from response headers
    const csrfToken = response.headers["x-csrf-token"]
    if (csrfToken && typeof csrfToken === "string") {
        _csrfToken = csrfToken
    }

    const refreshed = response.headers["x-seanime-profile-token"]
    if (refreshed && typeof refreshed === "string") {
        store.set(profileSessionTokenAtom, refreshed)
    }

    // If the profile session expired, clear the stored token so the user
    // falls back to admin context and can re-authenticate.
    const expired = response.headers["x-seanime-profile-expired"]
    if (expired === "true") {
        const currentToken = store.get(profileSessionTokenAtom)
        if (currentToken && sentProfileToken(response.config) === currentToken) {
            store.set(profileSessionTokenAtom, undefined)
            // Take the app to the login screen by itself. On the desktop client there is no address
            // bar and no F5, so a message telling you to sign in again with nothing acting on it
            // leaves you looking at a dead session with no way to act on the advice.
            store.set(profileSessionEndedAtom, true)
            // Notify user — use setTimeout to avoid issues during axios interceptor chain
            setTimeout(() => {
                toast.error("Your profile session has expired. Please sign in again from Profile Selection.")
            }, 0)
        }
    }

    return response
})

// Error interceptor — detect AniList API outages (503, 504, network failure)
axios.interceptors.response.use(undefined, (error: AxiosError) => {
    const url = (error.config as any)?.url as string | undefined

    // A profile session is cleared only when the server explicitly says it expired or a guarded
    // route says it requires a profile session. Other 401s can be unrelated (for example, an
    // endpoint returning an authorization error during a backend restart); clearing the session on
    // those transient responses caused the app to bounce to profile selection after updates.
    if (error.response?.status === 401) {
        const data = error.response?.data as { error?: string, message?: string } | undefined
        const message = `${data?.error ?? ""} ${data?.message ?? ""}`.toLowerCase()
        const expired = error.response.headers?.["x-seanime-profile-expired"] === "true"

        const current = store.get(profileSessionTokenAtom)
        const sent = sentProfileToken(error.config)
        // An answer to a request sent with an older token says nothing about the current one.
        const aboutCurrentSession = !current || !sent || sent === current
        if ((expired || message.includes("profile session")) && aboutCurrentSession) {
            if (current) {
                store.set(profileSessionTokenAtom, undefined)
            }
            store.set(profileSessionEndedAtom, true)
        }
    }

    if (isAnilistUrl(url)) {
        const status = error.response?.status
        const isOutage = !status || status === 503 || status === 504 || status === 502
        if (isOutage) {
            _anilistFailCount++
            if (_anilistFailCount >= ANILIST_FAIL_THRESHOLD) {
                store.set(anilistOutageAtom, true)
            }
        }
    }
    return Promise.reject(error)
})

type SeaError = AxiosError<{ error: string }>

type SeaQuery<D> = {
    endpoint: string
    method: "POST" | "GET" | "PATCH" | "DELETE" | "PUT"
    data?: D
    params?: D
    password?: string
    profileToken?: string
    /**
     * Marks a request nobody is waiting on, so the server's AniList pacer lets anything the user
     * *is* waiting on go first. See `background` in buildSeaQuery.
     */
    background?: boolean
    /** Abort after this many milliseconds instead of waiting forever (axios `timeout`). */
    timeout?: number
}

export function useSeaQuery() {
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return {
        seaFetch: <T, D extends any = any>(endpoint: string, method: "POST" | "GET" | "PATCH" | "DELETE" | "PUT", data?: D, params?: D) => {
            return buildSeaQuery<T, D>({
                endpoint,
                method,
                data,
                params,
                password,
                profileToken,
            })
        },
    }
}

/**
 * Create axios query to the server
 * - First generic: Return type
 * - Second generic: Params/Data type
 */
export async function buildSeaQuery<T, D extends any = any>(
    {
        endpoint,
        method,
        data,
        params,
        background,
        timeout,
    }: SeaQuery<D>): Promise<T | undefined> {

    // Resolve auth credentials from the Jotai store at request time rather than trusting the
    // values captured in the calling hook's render closure. React Query refetches triggered
    // immediately after login/logout — e.g. `qc.invalidateQueries()` in `useProfileLogin` —
    // run before the components that read these atoms re-render, so the closure would still
    // hold the *previous* credentials. On login that means the just-issued profile token is
    // missing and the backend rejects the request with "profile session required" (silently,
    // since 401s are suppressed during login), which is why a second login was needed. On
    // logout it would mean the stale token keeps getting sent. `setProfileToken`/`setPassword`
    // update the shared store synchronously, so the store is always the freshest source. Every
    // caller derives `password`/`profileToken` from these same atoms, so the store value is
    // authoritative — we intentionally do not fall back to the closure values.
    const effectivePassword = store.get(serverAuthTokenAtom)
    const effectiveProfileToken = store.get(profileSessionTokenAtom)

    const res = await axios<T>({
        url: getServerBaseUrl() + endpoint,
        method,
        data,
        params,
        timeout,
        headers: {
            ...(effectivePassword ? { "X-Seanime-Token": effectivePassword } : {}),
            ...(effectiveProfileToken ? { "X-Seanime-Profile-Token": effectiveProfileToken } : {}),
            ...(_csrfToken && method !== "GET" ? { "X-CSRF-Token": _csrfToken } : {}),
            // The server treats every inbound request as one the user is waiting on, and pays for
            // it out of the AniList budget reserved for exactly that. Prefetching is not that: it
            // is work done on the chance it turns out to be useful, and hundreds of requests of it
            // will empty the budget and leave the thing you actually asked for waiting a minute
            // for a slot. This header is how a caller says so.
            ...(background ? { "X-Seanime-Background": "true" } : {}),
        },
    })
    const response = _handleSeaResponse<T>(res.data)

    // An error payload is a rejected query, not a silent one.
    //
    // This used to resolve with `undefined`, which React Query refuses: "query data cannot be
    // undefined" — an error about the plumbing instead of the thing that happened, toasted with a
    // query key for a description. Throwing the server's own message puts it where the rest of the
    // error handling already lives.
    if (response.error) {
        throw new Error(response.error)
    }

    return response.data
}

type ServerMutationProps<R, V = void> = UseMutationOptions<R | undefined, SeaError, V, unknown> & {
    endpoint: string
    method: "POST" | "GET" | "PATCH" | "DELETE" | "PUT"
}

/**
 * Create mutation hook to the server
 * - First generic: Return type
 * - Second generic: Params/Data type
 */
export function useServerMutation<R = void, V = void>(
    {
        endpoint,
        method,
        ...options
    }: ServerMutationProps<R, V>) {

    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    return useMutation<R | undefined, SeaError, V>({
        onError: error => {
            console.log("Mutation error", error)
            // A request the server never saw is one toast per attempted request if it is announced —
            // and the app makes dozens while the server is restarting or the connection drops, each
            // with its own toast, which is a wall of red over a screen that is already showing the
            // reconnect state. Network-level failures are console-only, here and in the query
            // handler below; the websocket atom is what tells the user the server is unreachable.
            if (!error?.response) return
            // 401 errors are always handled by the call-site's own onError (e.g. profile login
            // showing the AniList token modal). Showing a generic toast on top of that causes
            // duplicate noise, so bail out early and let the caller deal with it.
            if (error?.response?.status === 401) return
            // AniList didn't answer and nothing was cached: one shared, friendly toast.
            if (isCacheMissError(error)) {
                showCacheMissToast()
                return
            }
            // Use detailed error formatting for specific, actionable messages
            const { title, description } = formatErrorForToast(error, `${method} ${endpoint}`)
            if (title.includes("feature disabled") || description?.includes("feature disabled")) {
                toast.warning("This feature is disabled", {
                    description: "This functionality is currently turned off in settings.",
                })
                return
            }
            if (title) toast.error(title, { description })
        },
        mutationFn: async (variables) => {
            return buildSeaQuery<R, V>({
                endpoint: endpoint,
                method: method,
                data: variables,
                password: password,
                profileToken: profileToken,
            })
        },
        ...options,
    })
}


type ServerQueryProps<R, V> = UseQueryOptions<R | undefined, SeaError, R | undefined> & {
    endpoint: string
    method: "POST" | "GET" | "PATCH" | "DELETE" | "PUT"
    params?: V
    data?: V
    muteError?: boolean
    muteCacheMiss?: boolean
    /** Request timeout in ms; without one a stalled request leaves the query loading forever. */
    timeout?: number
}

/**
 * Create query hook to the server
 * - First generic: Return type
 * - Second generic: Params/Data type
 */
export function useServerQuery<R, V = any>(
    {
        endpoint,
        method,
        params,
        data,
        muteError,
        muteCacheMiss,
        timeout,
        ...options
    }: ServerQueryProps<R | undefined, V>) {

    const pathname = usePathname()
    const [password, setPassword] = useAtom(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)

    const props = useQuery<R | undefined, SeaError>({
        queryFn: async () => {
            return buildSeaQuery<R, V>({
                endpoint: endpoint,
                method: method,
                params: params,
                data: data,
                password: password,
                profileToken: profileToken,
                timeout,
            })
        },
        ...options,
    })

    useEffect(() => {
        if (!muteError && props.isError) {
            // Network-level failures are console-only: the app makes dozens of requests while the
            // server restarts or the link drops, and one toast each is a wall of red over a screen
            // that is already telling the user it cannot connect. See the mutation handler.
            if (!props.error?.response) return
            if (props.error?.response?.data?.error === "UNAUTHENTICATED" && pathname !== "/public/auth") {
                setPassword(undefined)
                window.location.href = "/public/auth"
                return
            }
            // Suppress 401 and "not authenticated" errors — these are expected during the
            // startup / login flow when queries fire before auth is fully established.
            if (props.error?.response?.status === 401) return
            const serverErrMsg = props.error?.response?.data?.error ?? ""
            if (serverErrMsg === "not authenticated" || serverErrMsg === "unauthorized") return
            if (isCacheMissError(props.error)) {
                if (!muteCacheMiss) showCacheMissToast(() => props.refetch())
                return
            }
            console.log("Server error", props.error)
            // Use detailed error formatting for specific, actionable messages
            const { title, description } = formatErrorForToast(props.error, `${method} ${endpoint}`)
            if (title.includes("feature disabled") || description?.includes("feature disabled")) {
                return
            }
            if (title) {
                toast.error(title, { description })
            }
        }
    }, [props.error, props.isError, muteError, muteCacheMiss, endpoint, method, setPassword, pathname])

    return props
}

//----------------------------------------------------------------------------------------------------------------------

function _handleSeaResponse<T>(res: unknown): { data: T | undefined, error: string | undefined } {

    if (typeof res === "object" && !!res && "error" in res && typeof res.error === "string") {
        return { data: undefined, error: res.error }
    }
    if (typeof res === "object" && !!res && "data" in res) {
        return { data: res.data as T, error: undefined }
    }

    return { data: undefined, error: "No response from the server" }

}
