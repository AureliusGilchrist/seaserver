import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { ErrorBoundary } from "react-error-boundary"
import React from "react"

// A compact crash fence for an embedded section of the page — a settings card, the video
// player, a panel. Without one of these, a single component throwing during render unmounts
// the entire React tree: the whole app goes down with it (which is how a bad NumberInput
// once killed the player mid-episode). With one, only the section it wraps is replaced by a
// small retry box, and the rest of the page — including playback — keeps running.
//
// Resetting remounts the children, so a transient crash recovers right on the spot; a
// crash from genuinely broken code will throw again immediately, but it stays contained.

type WidgetErrorBoundaryProps = {
    children: React.ReactNode
    /** Names the fenced section in the fallback, e.g. the settings card title or "Player". */
    label?: string
    className?: string
}

function WidgetErrorFallback({ error, resetErrorBoundary, label, className }: {
    error: unknown
    resetErrorBoundary: () => void
    label?: string
    className?: string
}) {
    return (
        <div
            data-widget-error-boundary
            className={cn("rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-2", className)}
        >
            <p className="text-sm font-semibold text-red-300">
                {label ? `${label} crashed` : "This section crashed"}
            </p>
            <p className="text-xs break-all text-[--muted] select-text">
                {(error as Error)?.message || "An unexpected error occurred."}
            </p>
            <div className="flex gap-2">
                <Button size="sm" intent="warning-subtle" onClick={resetErrorBoundary}>
                    Retry
                </Button>
                <Button size="sm" intent="gray-outline" onClick={() => window.location.reload()}>
                    Reload app
                </Button>
            </div>
        </div>
    )
}

export function WidgetErrorBoundary({ children, label, className }: WidgetErrorBoundaryProps) {
    return (
        <ErrorBoundary
            fallbackRender={({ error, resetErrorBoundary }) => (
                <WidgetErrorFallback
                    error={error}
                    resetErrorBoundary={resetErrorBoundary}
                    label={label}
                    className={className}
                />
            )}
        >
            {children}
        </ErrorBoundary>
    )
}
