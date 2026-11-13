import { Switch } from "@/components/ui/switch"
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

                    <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-white/85">Shows for {settings.duration} s</span>
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
