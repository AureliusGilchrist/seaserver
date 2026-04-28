"use client"
import React from "react"
import { useGetLevel } from "@/api/hooks/community.hooks"
import { RewardShop } from "@/app/(main)/profile/me/_components/reward-shop"
import { useRewards } from "@/lib/rewards/reward-provider"
import { cn } from "@/components/ui/core/styling"
import { LuShoppingBag, LuX } from "react-icons/lu"
import { GiTrophyCup } from "react-icons/gi"
import { useAtomValue } from "jotai"
import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"

export function GlobalRewardShopButton() {
    const [open, setOpen] = React.useState(false)
    const { data: levelData } = useGetLevel()
    const level = levelData?.currentLevel ?? 0
    const { activeXPBarSkin } = useRewards()
    const isFullscreen = useAtomValue(vc_isFullscreen)

    // Extract a solid color from the XP bar fill CSS for use as the badge background
    const badgeBg = React.useMemo(() => {
        const fill = activeXPBarSkin?.fillCss
        if (!fill) return null
        if (fill.startsWith("linear-gradient")) {
            const stops = fill.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g)
            return stops?.[0] ?? null
        }
        return fill
    }, [activeXPBarSkin])

    const badgeStyle: React.CSSProperties = badgeBg
        ? { background: activeXPBarSkin?.fillCss ?? badgeBg, borderColor: "transparent" }
        : {}

    // In fullscreen: raise the button up from the bottom (animated)
    const bottomPosition = isFullscreen ? "bottom-16" : "bottom-5"

    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => setOpen(true)}
                title="Reward Shop"
                style={badgeStyle}
                className={cn(
                    "fixed left-5 z-50 flex items-center gap-2 px-3 py-2 rounded-2xl",
                    "border shadow-xl transition-all duration-300 ease-out",
                    !badgeBg && "bg-[--paper] border-[--border] hover:border-[--color-brand-500] hover:bg-[--color-brand-900]",
                    badgeBg && "hover:opacity-90",
                    "text-[--foreground] text-sm font-semibold group",
                    bottomPosition,
                )}
            >
                <GiTrophyCup className="w-4 h-4 text-white/80 group-hover:text-white" />
                <span className="text-xs tabular-nums text-white/80 group-hover:text-white">Lv.{level}</span>
                <LuShoppingBag className="w-3.5 h-3.5 text-white/60 group-hover:text-white" />
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
