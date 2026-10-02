"use client"
import { WebsocketProvider } from "@/app/websocket-provider"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { CustomCSSProvider } from "@/components/shared/custom-css-provider"
import { CustomThemeProvider } from "@/components/shared/custom-theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { QueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { store } from "@/app/jotai-store"
import { Provider as JotaiProvider } from "jotai/react"
import { ThemeProvider } from "next-themes"
import React from "react"
import { CookiesProvider } from "react-cookie"

interface ClientProvidersProps {
    children?: React.ReactNode
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 0,
            // 30 min stale time — backend syncs every 10 min, persisted cache is the source of truth
            staleTime: 30 * 60 * 1000,
            // 24 hours gc time — must exceed the persister maxAge to avoid cache churn
            gcTime: 24 * 60 * 60 * 1000,
        },
    },
})

// IndexedDB persister — survives app restarts; throttled to avoid excessive writes
const asyncStoragePersister = createAsyncStoragePersister({
    storage: typeof window !== "undefined"
        ? {
            getItem: async (key: string) => {
                const { get } = await import("idb-keyval")
                return get(key) as Promise<string | undefined>
            },
            setItem: async (key: string, value: string) => {
                const { set } = await import("idb-keyval")
                return set(key, value)
            },
            removeItem: async (key: string) => {
                const { del } = await import("idb-keyval")
                return del(key)
            },
        }
        : undefined,
    key: "seanime-rq-v1",
    throttleTime: 2000,
})

// Re-exported for existing importers (e.g. main.tsx). The instance lives in
// `@/app/jotai-store` so non-React modules can share it without an import cycle.
export { store }

// Per-entry detail queries (the library prefetch, plus the same endpoints loaded on demand)
// are deliberately NOT persisted.
//
// They are the bulk of the cache on a large library — four queries per series — and they are
// cheap to refetch the moment a series is actually opened. Persisting them means every cache
// change re-serializes the whole set on the renderer's main thread, which on a library of a
// few thousand entries is a blob large enough to block the UI for seconds at a time, over and
// over. The persisted cache is meant to make the app open instantly, not to freeze it.
const NON_PERSISTED_QUERY_KEYS = new Set<string>([
    API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key,
    API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.key,
    API_ENDPOINTS.METADATA.GetMediaMetadataParent.key,
    API_ENDPOINTS.ANIME.GetAnimeEpisodeCollection.key,
    API_ENDPOINTS.MANGA.GetMangaEntry.key,
    API_ENDPOINTS.MANGA.GetMangaEntryDetails.key,
])

export const ClientProviders: React.FC<ClientProvidersProps> = ({ children }) => {

    return (
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme={"dark"}>
            <CookiesProvider>
                <JotaiProvider store={store}>
                    <PersistQueryClientProvider
                        client={queryClient}
                        persistOptions={{
                            persister: asyncStoragePersister,
                            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                            // Tied to the app version (injected via rsbuild define) so every
                            // update busts stale persisted cache automatically.
                            //
                            // The suffix is a one-time bust: caches written before the
                            // per-entry prefetch was bounded and excluded from persistence
                            // can be hundreds of megabytes (the app would spend the first
                            // minutes of every boot hydrating and re-serializing them).
                            // Dropping them once is cheaper than carrying them forward.
                            buster: `seanime-${process.env.SEA_APP_VERSION || "v2"}-lean`,
                            dehydrateOptions: {
                                shouldDehydrateQuery: (query) => {
                                    // See NON_PERSISTED_QUERY_KEYS: the per-entry details are the
                                    // bulk of the cache and the reason persisting it froze the app.
                                    return !NON_PERSISTED_QUERY_KEYS.has(query.queryKey?.[0] as string)
                                },
                            },
                        }}
                    >
                        <WebsocketProvider>
                            {children}
                            <CustomThemeProvider />
                            <Toaster />
                        </WebsocketProvider>
                        <CustomCSSProvider />
                        {/*{process.env.NODE_ENV === "development" && <React.Suspense fallback={null}>*/}
                        {/*    <ReactQueryDevtools />*/}
                        {/*</React.Suspense>}*/}
                    </PersistQueryClientProvider>
                </JotaiProvider>
            </CookiesProvider>
        </ThemeProvider>
    )

}
