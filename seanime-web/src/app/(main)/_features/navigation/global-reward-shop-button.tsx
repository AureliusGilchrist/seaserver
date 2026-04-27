"use client"
import React from "react"
import { useGetLevel } from "@/api/hooks/community.hooks"
import { RewardShop } from "@/app/(main)/profile/me/_components/reward-shop"
import { cn } from "@/components/ui/core/styling"
import { LuShoppingBag, LuX } from "react-icons/lu"
import { GiTrophyCup } from "react-icons/gi"

export function GlobalRewardShopButton() {
    const [open, setOpen] = React.useState(false)
    const { data: levelData } = useGetLevel()
    const level = levelData?.currentLevel ?? 0

    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => setOpen(true)}
                title="Reward Shop"
                className={cn(
                    "fixed bottom-5 left-5 z-50 flex items-center gap-2 px-3 py-2 rounded-2xl",
                    "bg-[--paper] border border-[--border] shadow-xl",
                    "hover:border-[--color-brand-500] hover:bg-[--color-brand-900] transition-all duration-200",
                    "text-[--foreground] text-sm font-semibold group",
                )}
            >
                <GiTrophyCup className="w-4 h-4 text-[--color-brand-400] group-hover:text-[--color-brand-300]" />
                <span className="text-xs tabular-nums text-[--muted] group-hover:text-[--foreground]">Lv.{level}</span>
                <LuShoppingBag className="w-3.5 h-3.5 text-[--muted] group-hover:text-[--color-brand-400]" />
            </button>

            {/* Full-screen modal drawer */}
            {open && (
                <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    />

                    {/* Panel */}
                    <div className="relative z-10 w-full max-w-5xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[--background] border border-[--border] shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[--border] shrink-0">
                            <div className="flex items-center gap-3">
                                <GiTrophyCup className="w-5 h-5 text-[--color-brand-400]" />
                                <h2 className="text-lg font-bold">Reward Shop</h2>
                                <span className="text-sm text-[--muted]">Level {level}</span>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-[--muted] hover:text-[--foreground] hover:bg-white/5 transition-colors"
                            >
                                <LuX className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="overflow-y-auto p-6">
                            <RewardShop currentLevel={level} />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
