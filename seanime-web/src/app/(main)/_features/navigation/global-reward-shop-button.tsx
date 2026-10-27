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
import { __seaMediaPlayer_isFullscreenAtom } from "@/app/(main)/_features/sea-media-player/sea-media-player.atoms"

export function GlobalRewardShopButton() {
    const [open, setOpen] = React.useState(false)
    const { data: levelData } = useGetLevel()
    const level = levelData?.currentLevel ?? 0
    const { activeXPBarSkin } = useRewards()
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const isSeaPlayerFullscreen = useAtomValue(__seaMediaPlayer_isFullscreenAtom)

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

    const badgeStyle: React.CSSProperties = {
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        background: badgeBg
            ? `color-mix(in srgb, ${badgeBg} 30%, transparent)`
            : "rgba(255,255,255,0.08)",
        borderColor: badgeBg
            ? `color-mix(in srgb, ${badgeBg} 50%, transparent)`
            : "rgba(255,255,255,0.12)",
    }

    // Hide the floating reward-shop / level pill entirely while any player is fullscreen — it would
    // otherwise overlap the video. (After every hook: returning before useMemo broke hook order.)
    if (isFullscreen || isSeaPlayerFullscreen) return null

    const bottomPosition = "bottom-5"

    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => setOpen(true)}
                title="Reward Shop"
                style={badgeStyle}
                className={cn(
                    "sea-float-bottom fixed left-5 lg:left-[5.5rem] z-50 flex items-center gap-2 px-3 py-2 rounded-2xl",
                    "border shadow-xl transition-all duration-300 ease-out",
                    "hover:brightness-125",
                    "text-[--foreground] text-sm font-semibold group",
                    bottomPosition,
                )}
            >
                <GiTrophyCup className="w-4 h-4 text-white/80 group-hover:text-white" />
                <span className="text-xs tabular-nums text-white/80 group-hover:text-white">Lv.{level}</span>
                <LuShoppingBag className="w-3.5 h-3.5 text-white/60 group-hover:text-white" />
            </button>

            {open && <RewardShopSheet level={level} levelData={levelData} onClose={() => setOpen(false)} />}
        </>
    )
}

function RewardShopSheet({ level, levelData, onClose }: { level: number, levelData: any, onClose: () => void }) {
    const { activeXPBarSkin, effectiveXPBarFill } = useRewards()
    const xpIn = levelData?.xpInCurrentLevel ?? 0
    const xpNeeded = levelData?.xpNeededForLevel ?? 0
    const pct = xpNeeded > 0 ? Math.min(100, Math.max(0, (xpIn / xpNeeded) * 100)) : 0
    const fill = effectiveXPBarFill || activeXPBarSkin?.fillCss || "rgb(var(--color-brand-400))"

    // Escape closes; the page behind doesn't scroll while the sheet is open.
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        window.addEventListener("keydown", onKey)
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            window.removeEventListener("keydown", onKey)
            document.body.style.overflow = prevOverflow
        }
    }, [onClose])

    return (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Reward Shop">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in-0 duration-200" onClick={onClose} />

            <div
                className={cn(
                    "relative z-10 flex h-[92dvh] w-full max-w-6xl flex-col overflow-hidden sm:h-[min(860px,88vh)]",
                    "rounded-t-3xl sm:rounded-3xl border border-white/[0.08] bg-[--background]/95 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl",
                    "animate-in fade-in-0 slide-in-from-bottom-4 sm:zoom-in-[0.97] sm:slide-in-from-bottom-0 duration-300",
                )}
            >
                {/* Accent glow behind the header */}
                <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[70%] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />

                {/* Grab handle on phones */}
                <div className="flex justify-center pt-2 sm:hidden">
                    <span className="h-1 w-10 rounded-full bg-white/20" />
                </div>

                <header className="relative flex shrink-0 items-center gap-4 border-b border-white/[0.06] px-4 py-3.5 sm:px-6 sm:py-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 shadow-lg shadow-brand-900/50 ring-1 ring-white/20">
                        <GiTrophyCup className="size-5 text-white" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-bold leading-tight sm:text-xl">Reward Shop</h2>
                        <p className="truncate text-xs text-[--muted]">Make the app and your profile yours.</p>
                    </div>

                    <div className="hidden w-56 shrink-0 sm:block">
                        <div className="mb-1.5 flex items-baseline justify-between">
                            <span className="text-sm font-semibold">Level {level}</span>
                            {xpNeeded > 0 && (
                                <span className="text-[11px] tabular-nums text-[--muted]">
                                    {xpIn.toLocaleString()} / {xpNeeded.toLocaleString()} XP
                                </span>
                            )}
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10" style={activeXPBarSkin?.trackCss ? { background: activeXPBarSkin.trackCss } : undefined}>
                            <div
                                className={cn("h-full rounded-full transition-[width] duration-700", activeXPBarSkin?.animClass)}
                                style={{ width: `${pct}%`, background: fill, backgroundSize: activeXPBarSkin?.animClass ? "300% 100%" : undefined }}
                            />
                        </div>
                    </div>
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold ring-1 ring-white/10 sm:hidden">Lv {level}</span>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[--muted] transition-colors hover:bg-white/[0.07] hover:text-white"
                    >
                        <LuX className="size-4" />
                    </button>
                </header>

                <div className="relative min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
                    <RewardShop currentLevel={level} variant="modal" />
                </div>
            </div>
        </div>
    )
}
