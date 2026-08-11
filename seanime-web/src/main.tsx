import { ClientProviders, queryClient, store } from "@/app/client-providers"
import "./app/globals.css"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import React from "react"
import ReactDOM from "react-dom/client"
import { ErrorBoundary, FallbackProps } from "react-error-boundary"
import { LuffyError } from "./components/shared/luffy-error"
import { Button } from "./components/ui/button"
import { routeTree } from "./routeTree.gen"
import "@fontsource-variable/inter/index.css"

const router = createRouter({
    routeTree,
    // defaultPreload: import.meta.env.PROD ? "intent" : false,
    defaultPreload: false, // anilist rate limits
    context: {
        queryClient,
        store,
    },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
})

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}

/**
 * The last thing standing between a render error and a black window.
 *
 * There are error boundaries inside the app already, but they live *below* the providers and the
 * router — so anything that throws in ClientProviders, in the router itself, or during the first
 * render has nothing above it to catch it. React then unmounts the whole tree, and what is left is
 * an empty page: no sidebar, no message, no way back except reloading, which on the desktop client
 * means getting up and pressing Ctrl+R.
 *
 * Ported from upstream's "fix(denshi): blank screen after server reconnection", which is the same
 * failure by a different trigger. Two additions to their version, both aimed at not having to walk
 * to the machine: the error is reported to the main process where it lands in the log, and the app
 * reloads itself once, automatically, before ever showing this screen — a crash on reconnection is
 * usually cleared by exactly the reload the user would have done by hand.
 */
function RootErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
    const message = (error as Error)?.message ?? ""

    React.useEffect(() => {
        // Put it somewhere it can be read later. A black screen at 3am is otherwise unattributable.
        console.error("[Root] Renderer error", error)
        try {
            (window as any)?.electron?.diagnostics?.reportError?.(String(message))
        }
        catch {}

        // Reload itself, once. Sessions where this has already been tried are marked so a genuinely
        // broken build shows the message below rather than reloading forever.
        try {
            const key = "sea-root-error-reloaded"
            if (!window.sessionStorage.getItem(key)) {
                window.sessionStorage.setItem(key, "1")
                window.location.reload()
            }
        }
        catch {}
    }, [])

    return (
        <div className="min-h-screen bg-[#0c0c0c] text-white flex items-center justify-center p-6">
            <div className="w-full max-w-lg rounded-2xl border bg-black/60 p-6 text-center backdrop-blur-sm space-y-4">
                <LuffyError title="Client error">
                    Seanime hit an unexpected error and could not draw the page.
                </LuffyError>

                {!!message && (
                    <pre className="max-h-48 overflow-auto rounded-xl bg-black/50 p-3 text-left text-xs text-red-200 whitespace-pre-wrap break-words">
                        {message}
                    </pre>
                )}

                <div className="flex items-center justify-center gap-3">
                    <Button type="button" intent="gray-outline" className="rounded-full" onClick={resetErrorBoundary}>
                        Retry
                    </Button>
                    <Button
                        type="button"
                        intent="gray-outline"
                        className="rounded-full"
                        onClick={() => {
                            try {
                                window.sessionStorage.removeItem("sea-root-error-reloaded")
                            }
                            catch {}
                            window.location.reload()
                        }}
                    >
                        Reload
                    </Button>
                </div>
            </div>
        </div>
    )
}

// if (import.meta.env.DEV) {
//     const script = document.createElement("script")
//     script.src = "https://unpkg.com/react-scan/dist/auto.global.js"
//     script.crossOrigin = "anonymous"
//     document.head.appendChild(script)
// }
// A run that stays up is a run that recovered, so the one-reload guard is lifted and the *next*
// crash gets its own automatic reload too. Without this only the first crash of a session would
// recover by itself, and the one at 3am would be the second.
setTimeout(() => {
    try {
        window.sessionStorage.removeItem("sea-root-error-reloaded")
    }
    catch {}
}, 15_000)

ReactDOM.createRoot(document.getElementById("root")!, {
    onUncaughtError: (error, errorInfo) => {
        console.error("[Root] Uncaught renderer error", error, errorInfo)
    },
    onCaughtError: (error, errorInfo) => {
        console.error("[Root] Caught renderer error", error, errorInfo)
    },
}).render(
    <ErrorBoundary FallbackComponent={RootErrorFallback}>
        <ClientProviders>
            <RouterProvider router={router} />
        </ClientProviders>
    </ErrorBoundary>,
)
