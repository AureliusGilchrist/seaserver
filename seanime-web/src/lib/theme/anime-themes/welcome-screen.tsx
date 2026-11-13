"use client"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { cn } from "@/components/ui/core/styling"
import { seaStorage } from "@/lib/sea-storage/sea-storage"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import { fetchMarketplaceThemeMeta, type MarketplaceThemeMeta } from "@/lib/theme/marketplace-theme-loader"
import { useAtomValue } from "jotai/react"
import React from "react"

/**
 * The welcome screen: a short full-screen greeting when the app opens, styled after a theme the
 * user picks (or the active one), with their own greeting and one of that theme's splash messages.
 *
 * Settings live in seaStorage under `sea-anime-welcome-<profile>`, which matches the synced
 * "sea-anime-*" pattern, so the choice follows the profile to every device.
 */
export type WelcomeScreenSettings = {
    enabled: boolean
    /** "" = whichever theme is active. */
    themeId: string
    /** Shown as the headline; "" = "Welcome back". */
    greeting: string
    /** How long it stays, in seconds. */
    duration: number
}

export const DEFAULT_WELCOME_SETTINGS: WelcomeScreenSettings = { enabled: false, themeId: "", greeting: "", duration: 3 }

const SESSION_KEY = "sea-welcome-shown"

export function welcomeStorageKey(profileKey: string) {
    return `sea-anime-welcome-${profileKey}`
}

function readSettings(profileKey: string): WelcomeScreenSettings {
    try {
        const raw = seaStorage.getItem(welcomeStorageKey(profileKey))
        if (!raw) return DEFAULT_WELCOME_SETTINGS
        const parsed = JSON.parse(raw) as Partial<Record<keyof WelcomeScreenSettings, unknown>>
        return {
            enabled: !!parsed.enabled,
            themeId: typeof parsed.themeId === "string" ? parsed.themeId : "",
            greeting: typeof parsed.greeting === "string" ? parsed.greeting.slice(0, 120) : "",
            duration: Math.min(10, Math.max(1, Number(parsed.duration) || 3)),
        }
    }
    catch {
        return DEFAULT_WELCOME_SETTINGS
    }
}

export function useWelcomeScreenSettings() {
    const profile = useAtomValue(currentProfileAtom)
    const profileKey = profile?.id ? String(profile.id) : "default"
    const [settings, setSettingsState] = React.useState<WelcomeScreenSettings>(() => readSettings(profileKey))

    React.useEffect(() => {
        setSettingsState(readSettings(profileKey))
        // Synced values can arrive after mount (client-prefs hydration); pick them up.
        const onStorage = (e: StorageEvent) => {
            if (!e.key || e.key === welcomeStorageKey(profileKey)) setSettingsState(readSettings(profileKey))
        }
        window.addEventListener("storage", onStorage)
        const t = setTimeout(() => setSettingsState(readSettings(profileKey)), 1500)
        return () => {
            window.removeEventListener("storage", onStorage)
            clearTimeout(t)
        }
    }, [profileKey])

    const setSettings = React.useCallback((patch: Partial<WelcomeScreenSettings>) => {
        setSettingsState(prev => {
            const next = { ...prev, ...patch }
            seaStorage.setItem(welcomeStorageKey(profileKey), JSON.stringify(next))
            return next
        })
    }, [profileKey])

    return { settings, setSettings, profileKey }
}

type WelcomeLook = {
    name: string
    bg: string
    primary: string
    accent: string
    image?: string
    splash?: string
}

function pick<T>(list: T[] | undefined): T | undefined {
    return list?.length ? list[Math.floor(Math.random() * list.length)] : undefined
}

function lookFromMeta(meta: MarketplaceThemeMeta | null | undefined): WelcomeLook | null {
    if (!meta) return null
    return {
        name: meta.displayName,
        bg: meta.previewColors?.bg ?? "#07070a",
        primary: meta.previewColors?.primary ?? "#6366f1",
        accent: meta.previewColors?.accent ?? "#a5b4fc",
        image: meta.backgroundImageUrl || undefined,
        splash: pick(meta.splashMessages),
    }
}

/** Resolves the look for a theme id ("" = active theme). */
export function useWelcomeLook(themeId: string): WelcomeLook | null {
    const active = useAnimeThemeOrNull()
    const [fetched, setFetched] = React.useState<WelcomeLook | null>(null)
    const activeConfig = active?.config

    React.useEffect(() => {
        let cancelled = false
        setFetched(null)
        if (themeId && themeId !== activeConfig?.id) {
            fetchMarketplaceThemeMeta(themeId).then(meta => {
                if (!cancelled) setFetched(lookFromMeta(meta))
            })
        }
        return () => {
            cancelled = true
        }
    }, [themeId, activeConfig?.id])

    return React.useMemo(() => {
        if (themeId && themeId !== activeConfig?.id) return fetched
        if (!activeConfig) return null
        return {
            name: activeConfig.displayName,
            bg: activeConfig.previewColors?.bg ?? "#07070a",
            primary: activeConfig.previewColors?.primary ?? "#6366f1",
            accent: activeConfig.previewColors?.accent ?? "#a5b4fc",
            image: activeConfig.backgroundImageUrl || undefined,
            splash: pick(activeConfig.splashMessages),
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themeId, activeConfig, fetched])
}

/** The welcome card itself; also used as the live preview in settings. */
export function WelcomeCard({ look, greeting, className }: { look: WelcomeLook, greeting: string, className?: string }) {
    return (
        <div
            className={cn("relative isolate flex flex-col items-center justify-center overflow-hidden text-center", className)}
            style={{ background: look.bg }}
        >
            {look.image && (
                <div
                    className="absolute inset-0 -z-10 bg-cover bg-center opacity-35"
                    style={{ backgroundImage: `url("${look.image}")` }}
                />
            )}
            <div
                className="absolute inset-0 -z-10"
                style={{ background: `radial-gradient(60% 60% at 50% 45%, ${look.primary}40 0%, transparent 70%), linear-gradient(to bottom, transparent, ${look.bg})` }}
            />
            <p className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: look.accent }}>{look.name}</p>
            <h1 className="mt-3 px-6 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">{greeting || "Welcome back"}</h1>
            {look.splash && <p className="mt-4 max-w-lg px-6 text-sm italic text-white/65 sm:text-base">{look.splash}</p>}
        </div>
    )
}

/** Shows the welcome screen once per app session, if the profile turned it on. */
export function WelcomeScreen() {
    const { settings } = useWelcomeScreenSettings()
    const look = useWelcomeLook(settings.themeId)
    const [phase, setPhase] = React.useState<"waiting" | "shown" | "leaving" | "done">("waiting")

    React.useEffect(() => {
        if (phase !== "waiting" || !settings.enabled || !look) return
        try {
            if (sessionStorage.getItem(SESSION_KEY) === "1") {
                setPhase("done")
                return
            }
            sessionStorage.setItem(SESSION_KEY, "1")
        }
        catch {
        }
        setPhase("shown")
    }, [phase, settings.enabled, look])

    React.useEffect(() => {
        if (phase !== "shown") return
        const t = setTimeout(() => setPhase("leaving"), settings.duration * 1000)
        return () => clearTimeout(t)
    }, [phase, settings.duration])

    React.useEffect(() => {
        if (phase !== "leaving") return
        const t = setTimeout(() => setPhase("done"), 700)
        return () => clearTimeout(t)
    }, [phase])

    if (!look || (phase !== "shown" && phase !== "leaving")) return null
    return (
        <div
            role="dialog"
            aria-label="Welcome"
            onClick={() => setPhase("leaving")}
            className={cn(
                "fixed inset-0 z-[200] cursor-pointer transition-opacity duration-700",
                phase === "leaving" ? "opacity-0" : "opacity-100 animate-in fade-in",
            )}
            data-welcome-screen
        >
            <WelcomeCard look={look} greeting={settings.greeting} className="size-full" />
        </div>
    )
}
