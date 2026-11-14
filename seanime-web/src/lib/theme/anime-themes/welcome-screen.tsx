"use client"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { cn } from "@/components/ui/core/styling"
import { getServerBaseUrl } from "@/api/client/server-url"
import { useGetThemeFavorites } from "@/api/hooks/anime_themes.hooks"
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
    /** The song played with it: none, one of the profile's favourite openings (or a random one),
     * or an uploaded file. `url` is the file's address (server paths start with "/"). */
    audioKind: "none" | "favorite" | "randomFavorite" | "upload"
    audioUrl: string
    audioLabel: string
    /** 0–1. */
    audioVolume: number
    /** Stay until the song ends (or a click), instead of `duration`. */
    untilSongEnds: boolean
}

export const DEFAULT_WELCOME_SETTINGS: WelcomeScreenSettings = {
    // On unless the profile turned it off: a welcome nobody ever sees is no welcome.
    enabled: true,
    themeId: "",
    greeting: "",
    duration: 3,
    audioKind: "none",
    audioUrl: "",
    audioLabel: "",
    audioVolume: 0.6,
    untilSongEnds: false,
}

const AUDIO_KINDS = ["none", "favorite", "randomFavorite", "upload"] as const

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
            enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_WELCOME_SETTINGS.enabled,
            themeId: typeof parsed.themeId === "string" ? parsed.themeId : "",
            greeting: typeof parsed.greeting === "string" ? parsed.greeting.slice(0, 120) : "",
            duration: Math.min(10, Math.max(1, Number(parsed.duration) || 3)),
            audioKind: (AUDIO_KINDS as readonly unknown[]).includes(parsed.audioKind) ? parsed.audioKind as WelcomeScreenSettings["audioKind"] : "none",
            audioUrl: typeof parsed.audioUrl === "string" ? parsed.audioUrl : "",
            audioLabel: typeof parsed.audioLabel === "string" ? parsed.audioLabel.slice(0, 200) : "",
            audioVolume: Number.isFinite(Number(parsed.audioVolume)) ? Math.min(1, Math.max(0, Number(parsed.audioVolume))) : DEFAULT_WELCOME_SETTINGS.audioVolume,
            untilSongEnds: !!parsed.untilSongEnds,
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

const DEFAULT_LOOK: WelcomeLook = { name: "Seanime", bg: "#07070a", primary: "#6366f1", accent: "#a5b4fc" }

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
        if (themeId && themeId !== activeConfig?.id) return fetched ?? DEFAULT_LOOK
        // No anime theme active: the app's own look, rather than no welcome at all.
        if (!activeConfig) return DEFAULT_LOOK
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

/** A playable address for a welcome song: server paths are on the server, animethemes.moe links go
 * through the server's proxy. */
export function welcomeAudioSrc(url: string): string {
    if (!url) return ""
    if (url.startsWith("/")) return `${getServerBaseUrl()}${url}`
    if (/^https:\/\/[av]\.animethemes\.moe\//.test(url)) return `${getServerBaseUrl()}/api/v1/proxy?url=${encodeURIComponent(url)}`
    return url
}

/** The song to play for these settings, or "" for none. A random favourite is drawn each time. */
export function useWelcomeSong(settings: WelcomeScreenSettings): { src: string, label: string } {
    const { data: favorites } = useGetThemeFavorites(settings.enabled && settings.audioKind === "randomFavorite")
    return React.useMemo(() => {
        if (settings.audioKind === "none") return { src: "", label: "" }
        if (settings.audioKind === "randomFavorite") {
            const playable = (favorites ?? []).filter(f => f.audioUrl || f.videoUrl)
            const f = playable[Math.floor(Math.random() * playable.length)]
            return f ? { src: welcomeAudioSrc(f.audioUrl || f.videoUrl), label: `${f.themeSlug} · ${f.songTitle}` } : { src: "", label: "" }
        }
        return { src: welcomeAudioSrc(settings.audioUrl), label: settings.audioLabel }
    }, [settings.audioKind, settings.audioUrl, settings.audioLabel, favorites])
}

/** Shows the welcome screen once per app session, if the profile turned it on. */
export function WelcomeScreen() {
    const { settings, profileKey } = useWelcomeScreenSettings()
    const look = useWelcomeLook(settings.themeId)
    const song = useWelcomeSong(settings)
    const [phase, setPhase] = React.useState<"waiting" | "shown" | "leaving" | "done">("waiting")
    const [needsTap, setNeedsTap] = React.useState(false)
    const audioRef = React.useRef<HTMLAudioElement | null>(null)
    // The profile's synced settings arrive a moment after the app opens; deciding before they do
    // would greet a profile that turned the welcome off.
    const [settled, setSettled] = React.useState(false)
    React.useEffect(() => {
        setSettled(false)
        const t = setTimeout(() => setSettled(true), 1600)
        return () => clearTimeout(t)
    }, [profileKey])

    React.useEffect(() => {
        if (phase !== "waiting" || !settled || !look) return
        if (!readSettings(profileKey).enabled) return
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
    }, [phase, settled, look, profileKey])

    // The song: started as the screen shows; if the browser wants a click first, a button asks.
    React.useEffect(() => {
        if (phase !== "shown" || !song.src) return
        const el = audioRef.current
        if (!el) return
        el.volume = settings.audioVolume
        el.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true))
    }, [phase, song.src])

    React.useEffect(() => {
        if (phase !== "shown") return
        // "Until the song ends" leaves on the song's own end (below); a cap keeps a broken file from
        // holding the screen up for good.
        const ms = settings.untilSongEnds && song.src ? 6 * 60_000 : settings.duration * 1000
        const t = setTimeout(() => setPhase("leaving"), ms)
        return () => clearTimeout(t)
    }, [phase, settings.duration, settings.untilSongEnds, song.src])

    React.useEffect(() => {
        if (phase !== "leaving") return
        // Fade the song out with the screen.
        const el = audioRef.current
        const start = el?.volume ?? 0
        const began = Date.now()
        const fade = setInterval(() => {
            if (!el) return
            el.volume = Math.max(0, start * (1 - (Date.now() - began) / 700))
        }, 50)
        const t = setTimeout(() => {
            clearInterval(fade)
            el?.pause()
            setPhase("done")
        }, 700)
        return () => {
            clearInterval(fade)
            clearTimeout(t)
        }
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
            {song.src && (
                <audio
                    ref={audioRef}
                    src={song.src}
                    preload="auto"
                    onEnded={() => settings.untilSongEnds && setPhase("leaving")}
                    onError={() => settings.untilSongEnds && setPhase("leaving")}
                />
            )}
            {song.src && (
                <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 text-xs text-white/60">
                    {needsTap ? (
                        <button
                            type="button"
                            onClick={e => {
                                e.stopPropagation()
                                audioRef.current?.play().then(() => setNeedsTap(false)).catch(() => {})
                            }}
                            className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white backdrop-blur-md hover:bg-white/20"
                        >
                            ♪ Play {song.label || "the song"}
                        </button>
                    ) : (
                        <span>♪ {song.label}</span>
                    )}
                </div>
            )}
        </div>
    )
}
