"use client"

import { cn } from "@/components/ui/core/styling"
import {
    AVATAR_FRAMES,
    BANNER_OVERLAYS,
    PROFILE_LAYOUTS,
    type ProfileStyleReward,
} from "@/lib/rewards/profile-style-definitions"
import { useRewards } from "@/lib/rewards/reward-provider"
import React from "react"
import { LuCheck, LuLock } from "react-icons/lu"

/**
 * Profile Style rewards: avatar frame, banner overlay, header layout. Everything here is published,
 * so it is what other people see on your profile too.
 */
export function ProfileStyleTab({ currentLevel }: { currentLevel: number }) {
    const { avatarFrameId, bannerOverlayId, profileLayoutId, setProfileStyle } = useRewards()

    return (
        <div className="space-y-6">
            <Section title="Avatar Frames" description="An animated ring around your avatar.">
                {AVATAR_FRAMES.map(f => (
                    <StyleCard
                        key={f.id}
                        reward={f}
                        currentLevel={currentLevel}
                        active={avatarFrameId === f.id}
                        onSelect={() => setProfileStyle({ avatarFrameId: f.id })}
                        preview={
                            <div className="h-14 flex items-center justify-center">
                                <div className={cn("rounded-full size-10 bg-gradient-to-br from-gray-600 to-gray-800", f.className)} />
                            </div>
                        }
                    />
                ))}
            </Section>

            <Section title="Banner Overlays" description="A tint or texture laid over your profile banner.">
                {BANNER_OVERLAYS.map(o => (
                    <StyleCard
                        key={o.id}
                        reward={o}
                        currentLevel={currentLevel}
                        active={bannerOverlayId === o.id}
                        onSelect={() => setProfileStyle({ bannerOverlayId: o.id })}
                        preview={
                            <div className="h-14 rounded-md relative overflow-hidden bg-gradient-to-br from-indigo-700 via-purple-600 to-pink-500">
                                {o.overlayCss && <div className="absolute inset-0" style={{ background: o.overlayCss, mixBlendMode: o.blend as any }} />}
                            </div>
                        }
                    />
                ))}
            </Section>

            <Section title="Header Layouts" description="How your profile header is arranged.">
                {PROFILE_LAYOUTS.map(l => (
                    <StyleCard
                        key={l.id}
                        reward={l}
                        currentLevel={currentLevel}
                        active={profileLayoutId === l.id}
                        onSelect={() => setProfileStyle({ profileLayoutId: l.id })}
                        preview={<LayoutPreview id={l.id} />}
                    />
                ))}
            </Section>
        </div>
    )
}

function Section({ title, description, children }: { title: string, description: string, children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <div>
                <h3 className="font-semibold text-sm">{title}</h3>
                <p className="text-xs text-[--muted]">{description}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">{children}</div>
        </div>
    )
}

function StyleCard({ reward, currentLevel, active, onSelect, preview }: {
    reward: ProfileStyleReward
    currentLevel: number
    active: boolean
    onSelect: () => void
    preview: React.ReactNode
}) {
    const unlocked = currentLevel >= reward.requiredLevel
    return (
        <button
            disabled={!unlocked}
            onClick={() => unlocked && onSelect()}
            title={reward.description}
            className={cn(
                "sea-hoverable relative flex flex-col gap-1.5 p-2.5 rounded-xl border text-left transition-all",
                active
                    ? "border-[--color-brand-500] bg-[--color-brand-900]/30"
                    : unlocked
                        ? "border-[--border] bg-[--paper] hover:border-[--color-brand-600]"
                        : "border-[--border] bg-[--paper]/50 opacity-50 cursor-not-allowed",
            )}
        >
            {preview}
            <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold truncate">{reward.name}</span>
                {active && <LuCheck className="w-3 h-3 text-[--color-brand-400] shrink-0" />}
                {!unlocked && <LuLock className="w-3 h-3 text-gray-500 shrink-0" />}
            </div>
            {!unlocked && <p className="text-[10px] text-[--muted]">Lv. {reward.requiredLevel}</p>}
        </button>
    )
}

function LayoutPreview({ id }: { id: string }) {
    const dot = <div className="size-5 rounded-full bg-gray-500 shrink-0" />
    const lines = <div className="space-y-1 flex-1"><div className="h-1.5 w-3/4 rounded bg-gray-500" /><div className="h-1.5 w-1/2 rounded bg-gray-600" /></div>
    switch (id) {
        case "layout-centered":
            return <div className="h-14 flex flex-col items-center justify-center gap-1">{dot}<div className="h-1.5 w-1/2 rounded bg-gray-500" /></div>
        case "layout-reversed":
            return <div className="h-14 flex items-center gap-2 px-1 flex-row-reverse">{dot}{lines}</div>
        case "layout-showcase":
            return <div className="h-14 flex items-center gap-2 px-1 rounded-md bg-white/5 ring-1 ring-white/10"><div className="size-8 rounded-full bg-gray-500 shrink-0" />{lines}</div>
        case "layout-compact":
            return <div className="h-14 flex items-center gap-2 px-1"><div className="size-3 rounded-full bg-gray-500 shrink-0" /><div className="h-1.5 w-2/3 rounded bg-gray-500" /></div>
        default:
            return <div className="h-14 flex items-center gap-2 px-1">{dot}{lines}</div>
    }
}
