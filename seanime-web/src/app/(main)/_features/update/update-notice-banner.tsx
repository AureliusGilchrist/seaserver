"use client"

import { useDismissUpdateNotice, useGetUpdateNotice, UpdateNotice } from "@/api/hooks/update-notice.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { IconButton } from "@/components/ui/button"
import { WSEvents } from "@/lib/server/ws-events"
import { __isDesktop__ } from "@/types/constants"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"
import { LuCircleCheck, LuClock3, LuGithub, LuX } from "react-icons/lu"

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
    return (
        <div
            role="status"
            aria-live="polite"
            className={`relative z-[1000] ${__isDesktop__ ? "mt-10" : "mt-4"} overflow-hidden rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-950/75 via-gray-950/90 to-gray-950/95 p-4 shadow-2xl shadow-black/30 backdrop-blur-md sm:p-5`}
        >
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-300 via-emerald-500 to-teal-600" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="relative flex items-start gap-3 sm:gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 shadow-inner shadow-emerald-200/5">
                    <LuCircleCheck className="size-5 text-emerald-300" />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                                    Backend update complete
                                </span>
                                {notice.commit && (
                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-[11px] text-gray-300">
                                        <LuGithub className="size-3 text-gray-400" />
                                        {notice.commit}
                                    </span>
                                )}
                            </div>
                            <h2 className="mt-2 break-words text-base font-semibold leading-snug text-white sm:text-lg">
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
                            className="shrink-0 text-gray-400 hover:text-white"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
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
                        <p className="max-w-4xl whitespace-pre-wrap break-words border-t border-white/10 pt-3 text-sm leading-relaxed text-gray-300">
                            {notice.description}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
