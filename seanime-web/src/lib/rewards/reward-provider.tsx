"use client"

import React from "react"
import { useAtomValue } from "jotai"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import {
    TITLE_REWARDS,
    NAME_COLOR_REWARDS,
    BORDER_REWARDS,
    BACKGROUND_REWARDS,
    XP_BAR_SKIN_REWARDS,
    PARTICLE_SET_REWARDS,
    type TitleReward,
    type NameColorReward,
    type BorderReward,
    type BackgroundReward,
    type XPBarSkinReward,
    type ParticleSetReward,
} from "@/lib/rewards/reward-definitions"

// ─────────────────────────────────────────────────────────────────────────────

interface ActiveRewards {
    titleId: string
    nameColorId: string
    borderId: string
    backgroundId: string
    xpBarSkinId: string
    particleSetId: string
}

const DEFAULTS: ActiveRewards = {
    titleId: "title-newbie",
    nameColorId: "nc-default",
    borderId: "border-none",
    backgroundId: "bg-default",
    xpBarSkinId: "xpbar-default",
    particleSetId: "particles-none",
}

interface RewardContextValue {
    activeTitle: TitleReward | null
    activeNameColor: NameColorReward | null
    activeBorder: BorderReward | null
    activeBackground: BackgroundReward | null
    activeXPBarSkin: XPBarSkinReward | null
    activeParticleSet: ParticleSetReward | null
    setActiveTitle: (id: string) => void
    setActiveNameColor: (id: string) => void
    setActiveBorder: (id: string) => void
    setActiveBackground: (id: string) => void
    setActiveXPBarSkin: (id: string) => void
    setActiveParticleSet: (id: string) => void
}

const RewardContext = React.createContext<RewardContextValue>({
    activeTitle: null,
    activeNameColor: null,
    activeBorder: null,
    activeBackground: null,
    activeXPBarSkin: null,
    activeParticleSet: null,
    setActiveTitle: () => {},
    setActiveNameColor: () => {},
    setActiveBorder: () => {},
    setActiveBackground: () => {},
    setActiveXPBarSkin: () => {},
    setActiveParticleSet: () => {},
})

export function useRewards() {
    return React.useContext(RewardContext)
}

// ─────────────────────────────────────────────────────────────────────────────

function lookupTitle(id: string): TitleReward | null {
    return TITLE_REWARDS.find(r => r.id === id) ?? null
}

function lookupNameColor(id: string): NameColorReward | null {
    return NAME_COLOR_REWARDS.find(r => r.id === id) ?? null
}

function lookupBorder(id: string): BorderReward | null {
    return BORDER_REWARDS.find(r => r.id === id) ?? null
}

function lookupBackground(id: string): BackgroundReward | null {
    return BACKGROUND_REWARDS.find(r => r.id === id) ?? null
}

function lookupXPBarSkin(id: string): XPBarSkinReward | null {
    return XP_BAR_SKIN_REWARDS.find(r => r.id === id) ?? null
}

function lookupParticleSet(id: string): ParticleSetReward | null {
    return PARTICLE_SET_REWARDS.find(r => r.id === id) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────

export function RewardProvider({ children }: { children: React.ReactNode }) {
    const currentProfile = useAtomValue(currentProfileAtom)
    const profileKey = currentProfile?.id ? String(currentProfile.id) : "default"
    const storageKey = `sea-rewards-${profileKey}`

    const [active, setActive] = React.useState<ActiveRewards>(() => {
        if (typeof window === "undefined") return DEFAULTS
        try {
            const raw = localStorage.getItem(storageKey)
            if (!raw) return DEFAULTS
            return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ActiveRewards>) } as ActiveRewards
        } catch {
            return DEFAULTS
        }
    })

    // Reload when profile changes
    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey)
            if (!raw) {
                setActive(DEFAULTS)
            } else {
                setActive({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<ActiveRewards>) } as ActiveRewards)
            }
        } catch { /* noop */ }
    }, [storageKey])

    function persist(next: ActiveRewards) {
        setActive(next)
        try {
            localStorage.setItem(storageKey, JSON.stringify(next))
        } catch { /* noop */ }
    }

    const setActiveTitle       = React.useCallback((id: string) => persist({ ...active, titleId: id }), [active, storageKey])
    const setActiveNameColor   = React.useCallback((id: string) => persist({ ...active, nameColorId: id }), [active, storageKey])
    const setActiveBorder      = React.useCallback((id: string) => persist({ ...active, borderId: id }), [active, storageKey])
    const setActiveBackground  = React.useCallback((id: string) => persist({ ...active, backgroundId: id }), [active, storageKey])
    const setActiveXPBarSkin   = React.useCallback((id: string) => persist({ ...active, xpBarSkinId: id }), [active, storageKey])
    const setActiveParticleSet = React.useCallback((id: string) => persist({ ...active, particleSetId: id }), [active, storageKey])

    // ── CSS injection ──────────────────────────────────────────────────────────
    const nameColorDef = lookupNameColor(active.nameColorId)
    const borderDef    = lookupBorder(active.borderId)
    const bgDef        = lookupBackground(active.backgroundId)
    const xpBarDef     = lookupXPBarSkin(active.xpBarSkinId)

    React.useEffect(() => {
        const root = document.documentElement
        if (nameColorDef?.gradientCss) {
            root.style.setProperty("--sea-name-color", nameColorDef.color)
            root.style.setProperty("--sea-name-gradient", nameColorDef.gradientCss)
        } else if (nameColorDef) {
            root.style.setProperty("--sea-name-color", nameColorDef.color)
            root.style.removeProperty("--sea-name-gradient")
        } else {
            root.style.setProperty("--sea-name-color", "#ffffff")
            root.style.removeProperty("--sea-name-gradient")
        }
    }, [nameColorDef])

    React.useEffect(() => {
        const root = document.documentElement
        if (borderDef && borderDef.borderCss !== "none") {
            root.style.setProperty("--sea-profile-border", borderDef.borderCss)
            root.style.setProperty("--sea-profile-glow", borderDef.glowCss ?? "none")
        } else {
            root.style.removeProperty("--sea-profile-border")
            root.style.removeProperty("--sea-profile-glow")
        }
    }, [borderDef])

    React.useEffect(() => {
        const root = document.documentElement
        if (bgDef && bgDef.backgroundCss !== "transparent") {
            root.style.setProperty("--sea-profile-bg", bgDef.backgroundCss)
        } else {
            root.style.removeProperty("--sea-profile-bg")
        }
    }, [bgDef])

    React.useEffect(() => {
        const root = document.documentElement
        if (xpBarDef) {
            root.style.setProperty("--sea-xpbar-fill", xpBarDef.fillCss)
            root.style.setProperty("--sea-xpbar-track", xpBarDef.trackCss ?? "rgba(255,255,255,0.1)")
        } else {
            root.style.removeProperty("--sea-xpbar-fill")
            root.style.removeProperty("--sea-xpbar-track")
        }
    }, [xpBarDef])

    const value: RewardContextValue = {
        activeTitle:       lookupTitle(active.titleId),
        activeNameColor:   nameColorDef,
        activeBorder:      borderDef,
        activeBackground:  bgDef,
        activeXPBarSkin:   xpBarDef,
        activeParticleSet: lookupParticleSet(active.particleSetId),
        setActiveTitle,
        setActiveNameColor,
        setActiveBorder,
        setActiveBackground,
        setActiveXPBarSkin,
        setActiveParticleSet,
    }

    return (
        <RewardContext.Provider value={value}>
            {children}
        </RewardContext.Provider>
    )
}
