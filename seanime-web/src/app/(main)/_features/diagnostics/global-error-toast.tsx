"use client"
import React from "react"
import { toast } from "sonner"

/**
 * GlobalErrorToast — temporary diagnostic component.
 *
 * Surfaces uncaught JS errors and unhandled promise rejections as a
 * persistent toast (with a "Copy" action) so issues that only show in
 * DevTools become visible inside the app — useful for the Denshi
 * (Electron) build where opening DevTools mid-playback is awkward.
 *
 * Filtered to errors that look like the "apply" crash the user is
 * hitting in the player (matches "apply" in the message). Adjust the
 * regex below if you want to capture more.
 */
export function GlobalErrorToast() {
    React.useEffect(() => {
        if (typeof window === "undefined") return

        const FILTER = /apply|undefined|reading\s+'/i

        const formatStack = (err: unknown): { msg: string, stack: string } => {
            if (err instanceof Error) {
                return { msg: err.message || String(err), stack: err.stack || "" }
            }
            if (typeof err === "object" && err !== null) {
                try { return { msg: String((err as any).message ?? JSON.stringify(err)), stack: (err as any).stack ?? "" } }
                catch { return { msg: String(err), stack: "" } }
            }
            return { msg: String(err), stack: "" }
        }

        const showToast = (label: string, msg: string, stack: string, source?: string) => {
            const top = stack.split("\n").slice(0, 6).join("\n")
            const full = `[${label}] ${msg}\n${source ? `(${source})\n` : ""}${stack}`
            toast.error(`${label}: ${msg}`, {
                description: top || source || "(no stack)",
                duration: 30000,
                action: {
                    label: "Copy",
                    onClick: () => {
                        try { navigator.clipboard.writeText(full) } catch {}
                    },
                },
            })
            try { console.error(`[GlobalErrorToast] ${label}:`, msg, "\n", stack) } catch {}
        }

        const onError = (e: ErrorEvent) => {
            const msg = e.message || ""
            if (!FILTER.test(msg) && !(e.error && FILTER.test(String((e.error as any)?.message ?? "")))) return
            const { msg: m, stack } = formatStack(e.error ?? msg)
            const where = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined
            showToast("Error", m, stack, where)
        }

        const onRejection = (e: PromiseRejectionEvent) => {
            const { msg, stack } = formatStack(e.reason)
            if (!FILTER.test(msg) && !FILTER.test(stack)) return
            showToast("Promise rejection", msg, stack)
        }

        window.addEventListener("error", onError)
        window.addEventListener("unhandledrejection", onRejection)
        return () => {
            window.removeEventListener("error", onError)
            window.removeEventListener("unhandledrejection", onRejection)
        }
    }, [])

    return null
}
