"use client"
import { WebsocketProvider } from "@/app/websocket-provider"
import { CustomCSSProvider } from "@/components/shared/custom-css-provider"
import { CustomThemeProvider } from "@/components/shared/custom-theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { QueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { createStore } from "jotai"
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

export const store = createStore()

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
                            buster: "seanime-v1",
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
