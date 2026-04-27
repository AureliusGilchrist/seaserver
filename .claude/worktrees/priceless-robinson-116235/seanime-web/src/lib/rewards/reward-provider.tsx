"use client"

import React from "react"
import { useAtomValue } from "jotai"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useServerMutation } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import {
    TITLE_REWARDS,
    NAME_COLOR_REWARDS,
    BORDER_REWARDS,
    BACKGROUND_REWARDS,
    XP_BAR_SKIN_REWARDS,
    PARTICLE_SET_REWARDS,
    ALL_EGG_REWARDS,
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
    /** Array of active particle set IDs — up to 3 can run simultaneously */
    particleSetIds: string[]
}

const DEFAULTS: ActiveRewards = {
    titleId: "title-newbie",
    nameColorId: "nc-default",
    borderId: "border-none",
    backgroundId: "bg-default",
    xpBarSkinId: "xpbar-default",
    particleSetIds: [],
}

interface RewardContextValue {
    activeTitle: TitleReward | null
    activeNameColor: NameColorReward | null
    activeBorder: BorderReward | null
    activeBackground: BackgroundReward | null
    activeXPBarSkin: XPBarSkinReward | null
    /** Set of reward IDs that have been unlocked via easter eggs */
    eggUnlockedRewards: Set<string>
    /** Unlock a reward by easter egg ID */
    unlockEggReward: (rewardId: string) => void
    /** True if this reward was unlocked by an easter egg */
    isEggUnlocked: (rewardId: string) => boolean
    /** Active particle sets — multiple can be active simultaneously */
    activeParticleSets: ParticleSetReward[]
    /** Legacy single-set accessor (first active set, or null) */
    activeParticleSet: ParticleSetReward | null
    setActiveTitle: (id: string) => void
    setActiveNameColor: (id: string) => void
    setActiveBorder: (id: string) => void
    setActiveBackground: (id: string) => void
    setActiveXPBarSkin: (id: string) => void
    /** Toggle a particle set on/off. Max 3 active at once. */
    setActiveParticleSet: (id: string) => void
    toggleParticleSet: (id: string) => void
    isParticleSetActive: (id: string) => boolean
}

const RewardContext = React.createContext<RewardContextValue>({
    activeTitle: null,
    activeNameColor: null,
    activeBorder: null,
    activeBackground: null,
    activeXPBarSkin: null,
    activeParticleSets: [],
    activeParticleSet: null,
    setActiveTitle: () => {},
    setActiveNameColor: () => {},
    setActiveBorder: () => {},
    setActiveBackground: () => {},
    setActiveXPBarSkin: () => {},
    setActiveParticleSet: () => {},
    toggleParticleSet: () => {},
    isParticleSetActive: () => false,
    eggUnlockedRewards: new Set(),
    unlockEggReward: () => {},
    isEggUnlocked: () => false,
})

export function useRewards() {
    return React.useContext(RewardContext)
}

// ─────────────────────────────────────────────────────────────────────────────

function lookupTitle(id: string): TitleReward | null {
    const found = TITLE_REWARDS.find(r => r.id === id)
    if (found) return found
    // Handle dynamic milestone titles: "milestone-{themeId}-{level}"
    const m = id.match(/^milestone-(.+)-(\d+)$/)
    if (m) {
        return {
            id,
            type: "title",
            name: id, // placeholder; actual display name resolved in shop
            text: id,
            requiredLevel: Number(m[2]),
            color: "#ffffff",
            description: "",
        }
    }
    return null
}

function lookupNameColor(id: string): NameColorReward | null {
    return NAME_COLOR_REWARDS.find(r => r.id === id)
        ?? (ALL_EGG_REWARDS.find(r => r.id === id && r.type === "nameColor") as NameColorReward | undefined)
        ?? null
}

function lookupBorder(id: string): BorderReward | null {
    return BORDER_REWARDS.find(r => r.id === id)
        ?? (ALL_EGG_REWARDS.find(r => r.id === id && r.type === "border") as BorderReward | undefined)
        ?? null
}

function lookupBackground(id: string): BackgroundReward | null {
    return BACKGROUND_REWARDS.find(r => r.id === id) ?? null
}

function lookupXPBarSkin(id: string): XPBarSkinReward | null {
    return XP_BAR_SKIN_REWARDS.find(r => r.id === id) ?? null
}

function lookupParticleSet(id: string): ParticleSetReward | null {
    return PARTICLE_SET_REWARDS.find(r => r.id === id)
        ?? (ALL_EGG_REWARDS.find(r => r.id === id && r.type === "particleSet") as ParticleSetReward | undefined)
        ?? null
}

// ─────────────────────────────────────────────────────────────────────────────

export function RewardProvider({ children }: { children: React.ReactNode }) {
    const currentProfile = useAtomValue(currentProfileAtom)
    const profileKey = currentProfile?.id ? String(currentProfile.id) : "default"
    const storageKey    = `sea-rewards-${profileKey}`
    const eggStorageKey = `sea-egg-rewards-${profileKey}`

    const [eggUnlockedRewards, setEggUnlockedRewards] = React.useState<Set<string>>(() => {
        if (typeof window === "undefined") return new Set()
        try {
            const raw = localStorage.getItem(eggStorageKey)
            return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
        } catch { return new Set() }
    })

    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(eggStorageKey)
            setEggUnlockedRewards(raw ? new Set(JSON.parse(raw) as string[]) : new Set())
        } catch {}
    }, [eggStorageKey])

    const unlockEggReward = React.useCallback((rewardId: string) => {
        setEggUnlockedRewards(prev => {
            if (prev.has(rewardId)) return prev
            const next = new Set(prev)
            next.add(rewardId)
            try { localStorage.setItem(eggStorageKey, JSON.stringify(Array.from(next))) } catch {}
            return next
        })
    }, [eggStorageKey])

    const isEggUnlocked = React.useCallback((rewardId: string) => eggUnlockedRewards.has(rewardId), [eggUnlockedRewards])

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

    const { mutate: saveDisplayTitle } = useServerMutation<unknown, { title: string; color: string }>({
        endpoint: API_ENDPOINTS.PROFILE_PAGE.SetDisplayTitle.endpoint,
        method: "PATCH",
        muteError: true,
    } as any)

    const { mutate: saveDisplayCosmetics } = useServerMutation<unknown, {
        xpBarFillCss: string; xpBarAnimClass: string; nameColorCss: string; nameGradientCss: string
    }>({
        endpoint: API_ENDPOINTS.PROFILE_PAGE.SetDisplayCosmetics.endpoint,
        method: "PATCH",
        muteError: true,
    } as any)

    const setActiveTitle = React.useCallback((id: string) => {
        persist({ ...active, titleId: id })
        const resolved = lookupTitle(id)
        if (resolved) {
            saveDisplayTitle({ title: resolved.text, color: resolved.color ?? "#ffffff" })
        }
    }, [active, storageKey, saveDisplayTitle])

    const setActiveNameColor = React.useCallback((id: string) => {
        persist({ ...active, nameColorId: id })
        const resolved = lookupNameColor(id)
        if (resolved) {
            saveDisplayCosmetics({
                xpBarFillCss: lookupXPBarSkin(active.xpBarSkinId)?.fillCss ?? "",
                xpBarAnimClass: lookupXPBarSkin(active.xpBarSkinId)?.animClass ?? "",
                nameColorCss: resolved.color,
                nameGradientCss: resolved.gradientCss ?? "",
            })
        }
    }, [active, storageKey, saveDisplayCosmetics])

    const setActiveXPBarSkin = React.useCallback((id: string) => {
        persist({ ...active, xpBarSkinId: id })
        const resolved = lookupXPBarSkin(id)
        if (resolved) {
            const nameColor = lookupNameColor(active.nameColorId)
            saveDisplayCosmetics({
                xpBarFillCss: resolved.fillCss,
                xpBarAnimClass: resolved.animClass ?? "",
                nameColorCss: nameColor?.color ?? "#ffffff",
                nameGradientCss: nameColor?.gradientCss ?? "",
            })
        }
    }, [active, storageKey, saveDisplayCosmetics])

    const setActiveBorder     = React.useCallback((id: string) => persist({ ...active, borderId: id }), [active, storageKey])
    const setActiveBackground = React.useCallback((id: string) => persist({ ...active, backgroundId: id }), [active, storageKey])

    // Legacy single-set setter: replaces all with one (or clears if "particles-none")
    const setActiveParticleSet = React.useCallback((id: string) => {
        const ids = id === "particles-none" ? [] : [id]
        persist({ ...active, particleSetIds: ids })
    }, [active, storageKey])

    // Toggle: add/remove from the active set list (max 3)
    const toggleParticleSet = React.useCallback((id: string) => {
        const current = active.particleSetIds ?? []
        if (id === "particles-none") {
            persist({ ...active, particleSetIds: [] })
            return
        }
        const idx = current.indexOf(id)
        if (idx >= 0) {
            persist({ ...active, particleSetIds: current.filter(x => x !== id) })
        } else {
            // max 3 simultaneous
            const next = [...current, id].slice(-3)
            persist({ ...active, particleSetIds: next })
        }
    }, [active, storageKey])

    const isParticleSetActive = React.useCallback((id: string) => {
        if (id === "particles-none") return (active.particleSetIds ?? []).length === 0
        return (active.particleSetIds ?? []).includes(id)
    }, [active.particleSetIds])

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

    const activeParticleSets = React.useMemo(
        () => (active.particleSetIds ?? []).map(id => lookupParticleSet(id)).filter(Boolean) as import("@/lib/rewards/reward-definitions").ParticleSetReward[],
        [active.particleSetIds],
    )

    const value: RewardContextValue = {
        activeTitle:        lookupTitle(active.titleId),
        activeNameColor:    nameColorDef,
        activeBorder:       borderDef,
        activeBackground:   bgDef,
        activeXPBarSkin:    xpBarDef,
        eggUnlockedRewards,
        unlockEggReward,
        isEggUnlocked,
        activeParticleSets,
        activeParticleSet:  activeParticleSets[0] ?? null,
        setActiveTitle,
        setActiveNameColor,
        setActiveBorder,
        setActiveBackground,
        setActiveXPBarSkin,
        setActiveParticleSet,
        toggleParticleSet,
        isParticleSetActive,
    }

    return (
        <RewardContext.Provider value={value}>
            {children}
        </RewardContext.Provider>
    )
}
