"use client"

import { useDismissUpdateNotice, useGetUpdateNotice, UpdateNotice } from "@/api/hooks/update-notice.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { WSEvents } from "@/lib/server/ws-events"
import { __isDesktop__ } from "@/types/constants"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"
import { LuChevronDown, LuCircleCheck, LuClock3, LuGithub, LuX } from "react-icons/lu"

/**
 * What the last update was, said once and kept until it is dismissed.
 *
 * The server updates itself underneath the client, so the notice is the one thing that says what
 * arrived: the commit's message and its description. It shows as soon as the app is signed in —
 * never at the PIN screen, which is the one place somebody cannot do anything about it — and it
 * stays until the person looking at it presses the X. Nothing dismisses it on their behalf.
 */
export function UpdateNoticeBanner() {
    const { data: notice } = useGetUpdateNotice({ enabled: true })
    const { mutate: dismiss } = useDismissUpdateNotice()
    const queryClient = useQueryClient()

    // The server pushes when a notice lands, so a client that was open while the update happened
    // sees it now rather than at the next poll.
    useWebsocketMessageListener({
        type: WSEvents.UPDATE_NOTICE_AVAILABLE,
        onMessage: () => {
            (async () => {
                await queryClient.invalidateQueries({ queryKey: ["update-notice"] })
            })()
        },
    })

    const [dismissed, setDismissed] = React.useState(false)
    if (!notice || dismissed) return null

    return <UpdateNoticeBannerInner notice={notice} onDismiss={() => { setDismissed(true); dismiss({}) }} />
}

function UpdateNoticeBannerInner({ notice, onDismiss }: { notice: UpdateNotice, onDismiss: () => void }) {
    // On a phone this is a card floating above the navigation, with the details a tap away, so a
    // long commit message never pushes the page down.
    const [expanded, setExpanded] = React.useState(false)

    return (
        <div
            role="status"
            aria-live="polite"
            data-update-notice
            className={cn(
                "fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[1000] max-h-[60dvh] overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-950/95 via-gray-950/95 to-gray-950 p-3.5 shadow-2xl shadow-black/50 backdrop-blur-md",
                "sm:relative sm:inset-x-auto sm:bottom-auto sm:max-h-none sm:overflow-hidden sm:from-emerald-950/75 sm:via-gray-950/90 sm:to-gray-950/95 sm:p-5 sm:shadow-black/30",
                __isDesktop__ ? "sm:mt-10" : "sm:mt-4",
            )}
        >
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-300 via-emerald-500 to-teal-600" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="relative flex items-start gap-3 sm:gap-4">
                <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 shadow-inner shadow-emerald-200/5">
                    <LuCircleCheck className="size-5 text-emerald-300" />
                </div>

                <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                                    Backend update complete
                                </span>
                                {notice.commit && (
                                    <span className="hidden items-center gap-1.5 rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-[11px] text-gray-300 sm:inline-flex">
                                        <LuGithub className="size-3 text-gray-400" />
                                        {notice.commit}
                                    </span>
                                )}
                            </div>
                            <h2 className={cn("mt-1.5 break-words text-sm font-semibold leading-snug text-white sm:mt-2 sm:line-clamp-none sm:text-lg", !expanded && "line-clamp-2")}>
                                {notice.title || "The server was updated"}
                            </h2>
                        </div>

                        <IconButton
                            icon={<LuX />}
                            intent="gray-basic"
                            size="sm"
                            onClick={onDismiss}
                            title="Dismiss update notice"
                            aria-label="Dismiss update notice"
                            className="-mr-1 -mt-1 shrink-0 text-gray-400 hover:text-white sm:m-0"
                        />
                    </div>

                    <div className={cn("flex-wrap items-center gap-2 text-xs text-gray-300 sm:flex", expanded ? "flex" : "hidden")}>
                        {notice.updatedAt && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 backdrop-blur-md">
                                <LuClock3 className="size-3.5 text-gray-400" />
                                {new Date(notice.updatedAt).toLocaleString()}
                            </span>
                        )}
                        {!!notice.filesChanged && (
                            <>
                                <span className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 backdrop-blur-md">
                                    {notice.filesChanged} file{notice.filesChanged === 1 ? "" : "s"} changed
                                </span>
                                <span className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.07] px-2.5 py-1.5 font-medium text-emerald-300">
                                    +{notice.insertions ?? 0} added
                                </span>
                                <span className="rounded-lg border border-rose-400/15 bg-rose-400/[0.07] px-2.5 py-1.5 font-medium text-rose-300">
                                    -{notice.deletions ?? 0} removed
                                </span>
                            </>
                        )}
                    </div>

                    {notice.description && (
                        <p className={cn("max-w-4xl whitespace-pre-wrap break-words border-t border-white/10 pt-2 text-sm leading-relaxed text-gray-300 sm:block sm:pt-3", expanded ? "block" : "hidden")}>
                            {notice.description}
                        </p>
                    )}

                    {(!!notice.description || !!notice.updatedAt || !!notice.filesChanged) && (
                        <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setExpanded(v => !v)}
                            className="flex items-center gap-1 text-xs font-medium text-emerald-300 sm:hidden"
                        >
                            {expanded ? "Show less" : "What changed"}
                            <LuChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
