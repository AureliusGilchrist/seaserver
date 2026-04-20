"use client"
import { getServerBaseUrl } from "@/api/client/server-url"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useMutation, UseMutationOptions, useQuery, UseQueryOptions } from "@tanstack/react-query"
import axios, { AxiosError } from "axios"
import { getDefaultStore } from "jotai"
import { useAtomValue } from "jotai"
import { useAtom } from "jotai/react"
import { usePathname } from "@/lib/navigation"
import { useEffect } from "react"
import { toast } from "sonner"

// CSRF token storage — updated from server response headers
let _csrfToken: string | null = null

// Sliding window: when the server emits a refreshed profile token in the response header,
// update the in-memory atom and localStorage so the user stays logged in.
// Also detect expired profile sessions and clear the stale token.
axios.interceptors.response.use(response => {
    // Capture CSRF token from response headers
    const csrfToken = response.headers["x-csrf-token"]
    if (csrfToken && typeof csrfToken === "string") {
        _csrfToken = csrfToken
    }

    const refreshed = response.headers["x-seanime-profile-token"]
    if (refreshed && typeof refreshed === "string") {
        getDefaultStore().set(profileSessionTokenAtom, refreshed)
    }

    // If the profile session expired, clear the stored token so the user
    // falls back to admin context and can re-authenticate.
    const expired = response.headers["x-seanime-profile-expired"]
    if (expired === "true") {
        const currentToken = getDefaultStore().get(profileSessionTokenAtom)
        if (currentToken) {
            getDefaultStore().set(profileSessionTokenAtom, undefined)
            // Notify user — use setTimeout to avoid issues during axios interceptor chain
            setTimeout(() => {
                toast.error("Your profile session has expired. Please sign in again from Profile Selection.")
            }, 0)
        }
    }

    return response
})

type SeaError = AxiosError<{ error: string }>

type SeaQuery<D> = {
    endpoint: string
    method: "POST" | "GET" | "PATCH" | "DELETE" | "PUT"
    data?: D
    params?: D
    password?: string
    profileToken?: string
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
        password,
        profileToken,
    }: SeaQuery<D>): Promise<T | undefined> {

    const res = await axios<T>({
        url: getServerBaseUrl() + endpoint,
        method,
        data,
        params,
        headers: {
            ...(password ? { "X-Seanime-Token": password } : {}),
            ...(profileToken ? { "X-Seanime-Profile-Token": profileToken } : {}),
            ...(_csrfToken && method !== "GET" ? { "X-CSRF-Token": _csrfToken } : {}),
        },
    })
    const response = _handleSeaResponse<T>(res.data)
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
            const errorMsg = _handleSeaError(error.response?.data)
            if (errorMsg.includes("feature disabled")) {
                toast.warning("This feature is disabled")
                return
            }
            toast.error(errorMsg)
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
            })
        },
        ...options,
    })

    useEffect(() => {
        if (!muteError && props.isError) {
            if (props.error?.response?.data?.error === "UNAUTHENTICATED" && pathname !== "/public/auth") {
                setPassword(undefined)
                window.location.href = "/public/auth"
                return
            }
            console.log("Server error", props.error)
            const errorMsg = _handleSeaError(props.error?.response?.data)
            if (errorMsg.includes("feature disabled")) {
                return
            }
            if (!!errorMsg) {
                toast.error(errorMsg)
            }
        }
    }, [props.error, props.isError, muteError])

    return props
}

//----------------------------------------------------------------------------------------------------------------------

function _handleSeaError(data: any): string {
    if (typeof data === "string") return "Server Error: " + data

    const err = data?.error as string

    if (!err) return "Unknown error"

    if (err.includes("Too many requests"))
        return "AniList: Too many requests, please wait a moment and try again."

    try {
        const graphqlErr = JSON.parse(err) as any
        console.log("AniList error", graphqlErr)
        if (graphqlErr.graphqlErrors && graphqlErr.graphqlErrors.length > 0 && !!graphqlErr.graphqlErrors[0]?.message) {
            return "AniList error: " + graphqlErr.graphqlErrors[0]?.message
        }
        return "AniList error"
    }
    catch (e) {
        if (err.includes("no cached data") || err.includes("cache lookup failed")) {
            return ""
        }
        return "Error: " + err
    }
}

function _handleSeaResponse<T>(res: unknown): { data: T | undefined, error: string | undefined } {

    if (typeof res === "object" && !!res && "error" in res && typeof res.error === "string") {
        return { data: undefined, error: res.error }
    }
    if (typeof res === "object" && !!res && "data" in res) {
        return { data: res.data as T, error: undefined }
    }

    return { data: undefined, error: "No response from the server" }

}
