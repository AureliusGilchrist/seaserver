"use client"

import { useDismissUpdateNotice, useGetUpdateNotice, UpdateNotice } from "@/api/hooks/update-notice.hooks"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { IconButton } from "@/components/ui/button"
import { WSEvents } from "@/lib/server/ws-events"
import { useQueryClient } from "@tanstack/react-query"
import React from "react"
import { LuGithub, LuX } from "react-icons/lu"

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
        <div className="border border-gray-800 rounded-xl bg-gray-900/70 px-4 py-3 flex items-start gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-800/70 flex-shrink-0">
                <LuGithub className="w-4 h-4 text-brand-300" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">{notice.title || "The server was updated"}</p>
                <p className="text-xs text-[--muted] mt-0.5">
                    The server updated itself
                    {notice.commit && <> to <span className="text-gray-300 font-mono text-[11px]">{notice.commit}</span></>}
                    {notice.updatedAt && <> · {new Date(notice.updatedAt).toLocaleString()}</>}
                </p>
                {notice.description && (
                    <p className="text-xs text-gray-300 leading-relaxed mt-1.5 whitespace-pre-wrap break-words max-w-3xl">
                        {notice.description}
                    </p>
                )}
            </div>
            <IconButton
                icon={<LuX />}
                intent="gray-basic"
                size="sm"
                onClick={onDismiss}
                title="Dismiss"
            />
        </div>
    )
}
