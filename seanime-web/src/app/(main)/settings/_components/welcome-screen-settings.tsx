import { useServerMutation } from "@/api/client/requests"
import { useGetThemeFavorites } from "@/api/hooks/anime_themes.hooks"
import { Switch } from "@/components/ui/switch"
import { welcomeAudioSrc } from "@/lib/theme/anime-themes/welcome-screen"
import { toast } from "sonner"
import { cn } from "@/components/ui/core/styling"
import { fetchSharedThemesList, type SharedThemeInfo } from "@/lib/theme/marketplace-theme-loader"
import { useWelcomeLook, useWelcomeScreenSettings, WelcomeCard } from "@/lib/theme/anime-themes/welcome-screen"
import React from "react"
import { LuSparkles } from "react-icons/lu"

/**
 * Personal -> Welcome screen. A greeting shown once each time the app opens, styled after a theme
 * the user picks. Saved per profile and synced, so it is the same on every device.
 */
export function WelcomeScreenSettings() {
    const { settings, setSettings } = useWelcomeScreenSettings()
    const look = useWelcomeLook(settings.themeId)
    const [themes, setThemes] = React.useState<SharedThemeInfo[]>([])

    React.useEffect(() => {
        let cancelled = false
        fetchSharedThemesList().then(list => {
            if (!cancelled) setThemes([...list].sort((a, b) => a.displayName.localeCompare(b.displayName)))
        })
        return () => {
            cancelled = true
        }
    }, [])

    return (
        <section
            id="personal-welcome"
            className="rounded-2xl border border-white/[0.08] bg-black/25 backdrop-blur-xl overflow-hidden"
            data-welcome-screen-settings
        >
            <div className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-4">
                <div className="flex size-9 items-center justify-center rounded-xl border border-brand-300/20 bg-brand-400/10 text-brand-200">
                    <LuSparkles className="size-4" />
                </div>
                <div className="min-w-0">
                    <h3 className="font-semibold text-white">Welcome screen</h3>
                    <p className="text-xs text-[--muted]">A greeting when the app opens, in the style of a theme you choose. Follows your profile to every device.</p>
                </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-2">
                <div className="space-y-4">
                    <Switch
                        side="right"
                        value={settings.enabled}
                        onValueChange={v => setSettings({ enabled: v })}
                        label="Show the welcome screen"
                        help="Once each time you open the app. Click it to skip."
                    />

                    <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-white/85">Theme</span>
                        <select
                            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-brand-300/50"
                            value={settings.themeId}
                            onChange={e => setSettings({ themeId: e.target.value })}
                            disabled={!settings.enabled}
                        >
                            <option value="">Same as my current theme</option>
                            {themes.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                        </select>
                        <span className="block text-xs text-[--muted]">Installed themes. The welcome screen uses its colours, wallpaper and a splash message.</span>
                    </label>

                    <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-white/85">Greeting</span>
                        <input
                            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-brand-300/50"
                            placeholder="Welcome back"
                            maxLength={120}
                            value={settings.greeting}
                            onChange={e => setSettings({ greeting: e.target.value })}
                            disabled={!settings.enabled}
                        />
                    </label>

                    <WelcomeSongPicker />

                    <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-white/85">Shows for {settings.duration} s{settings.untilSongEnds && settings.audioKind !== "none" ? " (or until the song ends)" : ""}</span>
                        <input
                            type="range"
                            min={1}
                            max={10}
                            step={1}
                            value={settings.duration}
                            onChange={e => setSettings({ duration: Number(e.target.value) })}
                            disabled={!settings.enabled}
                            className="w-full accent-[rgb(var(--color-brand-500))]"
                        />
                    </label>
                </div>

                <div className={cn("overflow-hidden rounded-xl border border-white/10", !settings.enabled && "opacity-50")}>
                    {look
                        ? <WelcomeCard look={look} greeting={settings.greeting} className="aspect-video w-full" />
                        : <div className="flex aspect-video items-center justify-center text-sm text-[--muted]">Loading preview…</div>}
                </div>
            </div>
        </section>
    )
}

/** The welcome song: none, a favourite opening (chosen or random), or an uploaded file. */
function WelcomeSongPicker() {
    const { settings, setSettings } = useWelcomeScreenSettings()
    const { data: favorites } = useGetThemeFavorites()
    const playable = (favorites ?? []).filter(f => f.audioUrl || f.videoUrl)
    const fileRef = React.useRef<HTMLInputElement>(null)
    const previewRef = React.useRef<HTMLAudioElement>(null)
    const [previewing, setPreviewing] = React.useState(false)

    const { mutate: upload, isPending: uploading } = useServerMutation<{ url: string, name: string }, FormData>({
        endpoint: "/api/v1/welcome-audio/upload",
        method: "POST",
        onSuccess: res => {
            if (!res?.url) return
            setSettings({ audioKind: "upload", audioUrl: res.url, audioLabel: res.name })
            toast.success("Song uploaded")
        },
    })

    const kinds = [
        { value: "none" as const, label: "No song" },
        { value: "favorite" as const, label: "A favourite opening" },
        { value: "randomFavorite" as const, label: "Random favourite" },
        { value: "upload" as const, label: "My own file" },
    ]

    const previewSrc = settings.audioKind === "favorite" || settings.audioKind === "upload" ? welcomeAudioSrc(settings.audioUrl) : ""
    const noFavorites = "No favourite openings yet. Heart one in the Anime Themes tab of an anime page."

    return (
        <div className="space-y-2" data-welcome-song>
            <span className="text-sm font-medium text-white/85">Song</span>
            <div className="grid grid-cols-2 gap-1.5">
                {kinds.map(k => (
                    <button
                        key={k.value}
                        type="button"
                        disabled={!settings.enabled}
                        onClick={() => setSettings({ audioKind: k.value })}
                        className={cn(
                            "rounded-lg border px-2.5 py-1.5 text-xs transition disabled:opacity-50",
                            settings.audioKind === k.value ? "border-brand-300/50 bg-brand-500/15 text-white" : "border-white/10 text-[--muted] hover:text-white",
                        )}
                    >
                        {k.label}
                    </button>
                ))}
            </div>

            {settings.audioKind === "favorite" && (
                playable.length ? (
                    <select
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-brand-300/50"
                        value={settings.audioUrl}
                        onChange={e => {
                            const f = playable.find(f => (f.audioUrl || f.videoUrl) === e.target.value)
                            setSettings({ audioUrl: e.target.value, audioLabel: f ? `${f.themeSlug} · ${f.songTitle}` : "" })
                        }}
                    >
                        <option value="">Choose an opening…</option>
                        {playable.map(f => (
                            <option key={f.id} value={f.audioUrl || f.videoUrl}>{f.animeName} — {f.themeSlug} · {f.songTitle}</option>
                        ))}
                    </select>
                ) : <p className="text-xs text-[--muted]">{noFavorites}</p>
            )}
            {settings.audioKind === "randomFavorite" && (
                <p className="text-xs text-[--muted]">{playable.length ? `One of your ${playable.length} favourite openings, different each time.` : noFavorites}</p>
            )}
            {settings.audioKind === "upload" && (
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        ref={fileRef}
                        type="file"
                        accept="audio/*,.mp3,.ogg,.opus,.wav,.flac,.m4a,.webm"
                        className="hidden"
                        onChange={e => {
                            const file = e.target.files?.[0]
                            e.target.value = ""
                            if (!file) return
                            const form = new FormData()
                            form.append("audio", file)
                            upload(form)
                        }}
                    />
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/5 disabled:opacity-50"
                    >
                        {uploading ? "Uploading…" : settings.audioUrl ? "Upload another" : "Upload a song"}
                    </button>
                    <span className="min-w-0 truncate text-xs text-[--muted]">{settings.audioUrl ? settings.audioLabel || "Uploaded song" : "mp3, ogg, wav, flac, m4a — up to 30 MB"}</span>
                </div>
            )}

            {settings.audioKind !== "none" && (
                <div className="space-y-2">
                    <label className="flex items-center gap-3 text-xs text-[--muted]">
                        Volume
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={settings.audioVolume}
                            onChange={e => {
                                const v = Number(e.target.value)
                                setSettings({ audioVolume: v })
                                if (previewRef.current) previewRef.current.volume = v
                            }}
                            className="flex-1 accent-[rgb(var(--color-brand-500))]"
                        />
                        {previewSrc && (
                            <button
                                type="button"
                                onClick={() => {
                                    const el = previewRef.current
                                    if (!el) return
                                    if (previewing) {
                                        el.pause()
                                        setPreviewing(false)
                                    } else {
                                        el.volume = settings.audioVolume
                                        el.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false))
                                    }
                                }}
                                className="rounded-md border border-white/10 px-2 py-1 text-white"
                            >
                                {previewing ? "Stop" : "Preview"}
                            </button>
                        )}
                    </label>
                    {previewSrc && <audio ref={previewRef} src={previewSrc} onEnded={() => setPreviewing(false)} onPause={() => setPreviewing(false)} />}
                    <Switch
                        side="right"
                        value={settings.untilSongEnds}
                        onValueChange={v => setSettings({ untilSongEnds: v })}
                        label="Stay until the song ends"
                        help="Click anywhere to skip it."
                    />
                </div>
            )}
        </div>
    )
}
