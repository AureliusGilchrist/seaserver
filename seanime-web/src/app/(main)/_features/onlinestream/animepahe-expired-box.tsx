"use client"

import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { SeaLink } from "@/components/shared/sea-link"
import { Button } from "@/components/ui/button"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import React, { useState } from "react"
import { LuArrowRight, LuLockOpen, LuShieldAlert } from "react-icons/lu"
import { toast } from "sonner"

type AnimePaheAccess = {
    unlocked: boolean
    expired?: boolean
    expiredAt?: string
}

const endpoint = "/api/v1/onlinestream/animepahe/access"

/** How often the server is asked; the server notices an expired token from any AnimePahe request. */
const CHECK_INTERVAL_MS = 60_000

/**
 * Stays on screen, on every page, while AnimePahe refuses the saved Cloudflare clearance: the token
 * has expired and AnimePahe is skipped until the check is passed again. It goes away by itself as
 * soon as AnimePahe answers, after an unlock or otherwise. Only the admin sees it.
 */
export function AnimePaheExpiredBox() {
    const serverStatus = useServerStatus()
    const isAdmin = !!serverStatus && (!serverStatus.profilesEnabled || !serverStatus.profiles?.length || !!serverStatus.currentProfile?.isAdmin)
    const qc = useQueryClient()
    const { data } = useServerQuery<AnimePaheAccess>({
        endpoint,
        method: "GET",
        queryKey: ["animepahe-access"],
        enabled: isAdmin,
        refetchInterval: CHECK_INTERVAL_MS,
    })
    const { mutate: save, isPending: saving } = useServerMutation<AnimePaheAccess, { cookie: string, userAgent: string }>({
        endpoint, method: "POST", mutationKey: ["animepahe-access-save"],
        onSuccess: (res) => {
            qc.setQueryData(["animepahe-access"], res)
            if (res?.expired) toast.error("AnimePahe still refuses the new token")
            else toast.success("AnimePahe unlocked")
        },
    })
    const [opening, setOpening] = useState(false)
    const canOpen = typeof window !== "undefined" && !!window.electron?.animepahe?.unlock

    async function unlock() {
        if (!window.electron?.animepahe) return
        setOpening(true)
        try {
            const res = await window.electron.animepahe.unlock()
            if (res.error || !res.cookie) {
                toast.error(res.error || "No clearance was earned")
                return
            }
            save({ cookie: res.cookie, userAgent: res.userAgent || "" })
        } finally {
            setOpening(false)
        }
    }

    const show = isAdmin && !!data?.unlocked && !!data?.expired
    const since = data?.expiredAt ? new Date(data.expiredAt) : null

    return (
        <AnimatePresence>
            {show && <motion.div
                key="animepahe-expired"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.3 }}
                role="alert"
                className="fixed bottom-16 right-4 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-amber-400/30 bg-gray-950/90 backdrop-blur-xl shadow-2xl shadow-black/50 p-4"
                data-animepahe-expired-box
            >
                <div className="flex gap-3">
                    <span className="size-9 rounded-xl bg-amber-400/15 text-amber-300 flex items-center justify-center text-lg flex-none">
                        <LuShieldAlert />
                    </span>
                    <div className="min-w-0 space-y-1">
                        <p className="font-semibold leading-tight">AnimePahe token expired</p>
                        <p className="text-sm text-gray-300">
                            Cloudflare no longer accepts the saved token, so AnimePahe is skipped until you pass its check again.
                        </p>
                        {!!since && <p className="text-xs text-gray-500">
                            Since {since.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </p>}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 pl-12">
                    {canOpen && <Button size="sm" intent="white" className="rounded-xl" leftIcon={<LuLockOpen />} loading={opening || saving} onClick={unlock}>
                        Unlock again
                    </Button>}
                    <SeaLink href="/enmasse-anime">
                        <Button size="sm" intent="gray-subtle" className="rounded-xl" rightIcon={<LuArrowRight />}>
                            {canOpen ? "Paste a token" : "Unlock on En Masse"}
                        </Button>
                    </SeaLink>
                </div>
            </motion.div>}
        </AnimatePresence>
    )
}
