"use client"

import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { TextInput } from "@/components/ui/text-input"
import { useQueryClient } from "@tanstack/react-query"
import React, { useState } from "react"
import { LuKeyRound, LuLockOpen, LuRefreshCw, LuShieldAlert, LuShieldCheck } from "react-icons/lu"
import { toast } from "sonner"

type AnimePaheAccess = {
    unlocked: boolean
    savedAt?: string
    userAgent?: string
    working?: boolean
    error?: string
    checkedAt?: string
}

const endpoint = "/api/v1/onlinestream/animepahe/access"
const key = ["animepahe-access"]

/**
 * AnimePahe sits behind Cloudflare's "verify you are human" check. The user passes it once in a
 * real browser (Denshi opens one) and the server reuses the clearance it earns.
 */
export function AnimePaheAccessCard({ className }: { className?: string }) {
    const qc = useQueryClient()
    const { data } = useServerQuery<AnimePaheAccess>({ endpoint, method: "GET", queryKey: key })
    const { mutate: save, isPending: saving } = useServerMutation<AnimePaheAccess, { cookie: string, userAgent: string }>({
        endpoint, method: "POST", mutationKey: ["animepahe-access-save"],
        onSuccess: (res) => {
            qc.setQueryData(key, res)
            if (res?.working) toast.success("AnimePahe unlocked")
            else toast.error(res?.error ? `AnimePahe still refused: ${res.error}` : "AnimePahe still refused the server")
        },
    })
    const { mutate: recheck, isPending: checking } = useServerMutation<AnimePaheAccess>({
        endpoint: endpoint + "?check=true", method: "GET", mutationKey: ["animepahe-access-check"],
        onSuccess: (res) => qc.setQueryData(key, res),
    })
    const [opening, setOpening] = useState(false)
    const [manual, setManual] = useState(false)
    const [cookie, setCookie] = useState("")
    const [ua, setUa] = useState(() => typeof navigator !== "undefined" ? navigator.userAgent : "")
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

    const state = !data?.unlocked ? "locked" : data.working === false ? "failing" : "unlocked"

    return (
        <div className={cn("rounded-3xl border border-white/[0.07] bg-gray-950/60 backdrop-blur-xl p-5 sm:p-6 space-y-4", className)} data-animepahe-access>
            <div className="flex items-start gap-3">
                <span className={cn("size-9 rounded-xl flex items-center justify-center text-lg flex-none",
                    state === "unlocked" ? "bg-emerald-400/10 text-emerald-300" : state === "failing" ? "bg-amber-400/10 text-amber-300" : "bg-white/[0.05] text-gray-400")}>
                    {state === "unlocked" ? <LuShieldCheck /> : <LuShieldAlert />}
                </span>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold leading-tight">AnimePahe access</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {state === "unlocked" ? "Unlocked: the server gets through Cloudflare's check."
                            : state === "failing" ? "The saved unlock no longer works. Unlock it again."
                                : "Cloudflare checks every visitor. Pass the check once yourself and the server can use it."}
                    </p>
                </div>
            </div>
            {state === "failing" && !!data?.error && <p className="text-xs text-amber-300/90 line-clamp-2">{data.error}</p>}

            <div className="flex flex-wrap gap-2">
                {canOpen && <Button size="sm" intent="white" className="rounded-xl" leftIcon={<LuLockOpen />} loading={opening || saving} onClick={unlock}>
                    {data?.unlocked ? "Unlock again" : "Unlock AnimePahe"}
                </Button>}
                {data?.unlocked && <Button size="sm" intent="gray-subtle" className="rounded-xl" leftIcon={<LuRefreshCw />} loading={checking} onClick={() => recheck()}>
                    Check
                </Button>}
                <Button size="sm" intent="gray-link" leftIcon={<LuKeyRound />} onClick={() => setManual(m => !m)}>
                    Paste a cookie
                </Button>
            </div>

            {manual && <div className="space-y-2">
                <p className="text-xs text-gray-400">
                    Open animepahe.pw in this browser, pass the check, then copy the <code>cf_clearance</code> cookie from the developer tools
                    (Application → Cookies). The server must use the same internet connection as this browser.
                </p>
                <TextInput value={cookie} onValueChange={setCookie} placeholder="cf_clearance=…" size="sm" />
                <TextInput value={ua} onValueChange={setUa} placeholder="User agent" size="sm" />
                <Button size="sm" intent="primary-subtle" loading={saving} disabled={!cookie.trim()} onClick={() => save({ cookie, userAgent: ua })}>
                    Save and check
                </Button>
            </div>}
        </div>
    )
}
