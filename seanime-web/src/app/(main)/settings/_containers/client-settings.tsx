import { SettingsCard } from "@/app/(main)/settings/_components/settings-card"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { WidgetErrorBoundary } from "@/components/shared/widget-error-boundary"
import { AnilistOverwriteCard } from "@/app/(main)/settings/_containers/anilist-overwrite-settings"
import { PlaybackSettings } from "@/app/(main)/settings/_components/playback-settings"
import { StillWatchingTiming } from "@/app/(main)/settings/_components/still-watching-timing"
import { MAX_LOG_LINES, stamp, updateSettingsLogAtom } from "@/app/(main)/settings/_containers/update-settings"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { NumberInput } from "@/components/ui/number-input"
import { Switch } from "@/components/ui/switch"
import { type ClientSettings, resetClientSettings, setClientSettings, useClientSettings } from "@/lib/client-settings"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { useAtom, useAtomValue } from "jotai"
import React from "react"
import { LuBookmarkCheck, LuDownload, LuEye, LuListChecks, LuMessageCircle, LuMonitorPlay, LuNewspaper, LuPlay, LuRotateCcw, LuRss, LuSearch, LuSettings2, LuTags, LuUserCog, LuX } from "react-icons/lu"
import { toast } from "sonner"

type ClientSettingsProps = {}

// Client settings are per-profile app preferences: saved to the browser and mirrored to the
// server under the current profile, so they follow the profile across devices and survive
// reinstalls — while never affecting any other profile. Each switch applies immediately; a
// field left unset (see "Reset") inherits the server-wide value an admin configured.
// Frontend updates straight from GitHub releases: the app downloads the prebuilt bundle
// the CI publishes, swaps it in and reloads — no git, no Node and no account needed on
// this machine. Settings live on the Electron side (denshiSettings), per machine.
function GitHubFrontendUpdateCard() {
    const [settings, setSettings] = React.useState<DenshiSettings | null>(null)
    const [checking, setChecking] = React.useState(false)
    const [installing, setInstalling] = React.useState(false)
    const [result, setResult] = React.useState<LiveUpdateGitHubCheck | null>(null)
    const [lines, setLines] = useAtom(updateSettingsLogAtom)

    const appendLines = React.useCallback((next: string[]) => {
        if (!next.length) return
        setLines(prev => [...prev, ...next].slice(-MAX_LOG_LINES))
    }, [setLines])

    React.useEffect(() => {
        window.electron?.denshiSettings.get().then(setSettings)
    }, [])

    // Surface progress in the shared update log (the Updates tab renders it in full).
    React.useEffect(() => {
        const off = window.electron?.on("live-update:progress", (p: { target: string, line: string }) => {
            if (p.target !== "frontend") return
            appendLines([stamp(p.line)])
        })
        return () => off?.()
    }, [appendLines])

    async function refresh(checkNow: boolean = true) {
        const liveUpdate = window.electron?.liveUpdate
        if (!liveUpdate?.checkGitHub) return
        if (checkNow) {
            setChecking(true)
            try {
                const res = await liveUpdate.checkGitHub()
                setResult(res)
                if (res.ok) {
                    const summary = res.updateAvailable
                        ? `Frontend: update available (${res.current ?? "unknown"} → ${res.latest})`
                        : `Frontend: up to date (${res.current ?? res.latest ?? "unknown"})`
                    appendLines([stamp(summary)])
                } else {
                    appendLines([stamp(`Frontend check: Failed - ${res.error ?? "unknown error"}`)])
                }
            } catch (e: any) {
                toast.error(`Update check failed: ${e?.message ?? "unknown error"}`)
            } finally {
                setChecking(false)
            }
        } else {
            liveUpdate.getGitHubInfo?.().then((info) => {
                setResult(prev => prev ? { ...prev, current: info.version, currentSource: info.source } : prev)
            })
        }
    }

    React.useEffect(() => {
        refresh()
    }, [])

    async function handleInstall() {
        const liveUpdate = window.electron?.liveUpdate
        if (!liveUpdate?.updateGitHub) return
        setInstalling(true)
        setLines([stamp("Frontend update: [00%] Checking GitHub for the latest frontend")])
        try {
            const res = await liveUpdate.updateGitHub()
            if (res.ok) {
                toast.success(res.message ?? `Frontend updated to ${res.version}`)
                appendLines(["", stamp(`Frontend update: [100%] Succeeded (${res.version})`)])
            } else {
                toast.error(`Frontend update failed: ${res.error ?? "unknown error"}`)
            }
        } catch (e: any) {
            toast.error(`Frontend update failed: ${e?.message ?? "unknown error"}`)
            appendLines(["", stamp(`Frontend update: Failed - ${e?.message ?? "unknown error"}`)])
        } finally {
            setInstalling(false)
        }
    }

    function setAutoUpdate(value: boolean) {
        if (!window.electron?.denshiSettings) return
        const next = { ...(settings ?? ({} as DenshiSettings)), autoUpdateFrontend: value }
        setSettings(next)
        window.electron.denshiSettings.set(next)
    }

    if (!window.electron?.liveUpdate?.checkGitHub) return null

    return (
        <SettingsCard
            title="Frontend updates"
            description="Download the prebuilt frontend from GitHub releases and swap it in live — no git, Node or GitHub account needed on this machine."
        >
            <p className="text-sm text-[--muted]">
                {result && !result.ok && (
                    <span className="text-red-300">Could not reach GitHub: {result.error}</span>
                )}
                {result?.ok && result.updateAvailable && (
                    <span>Version <span className="text-[--brand] font-medium">{result.latest}</span> is available
                        {result.current ? <> (installed: {result.current})</> : null}.
                    </span>
                )}
                {result?.ok && !result.updateAvailable && (
                    <span>
                        {result.currentSource === "github" && <>Up to date — installed from GitHub: {result.current}</>}
                        {result.currentSource === "local" && <>Running a local build (version unknown). The latest release on GitHub is {result.latest ?? "unavailable"}.</>}
                        {result.currentSource === "bundled" && <>Up to date — running the bundled frontend ({result.current}).</>}
                    </span>
                )}
                {!result && <span>Checking GitHub…</span>}
            </p>
            <Switch
                side="right"
                value={!!settings?.autoUpdateFrontend}
                onValueChange={setAutoUpdate}
                label="Update the frontend automatically"
                help="When enabled, the app checks GitHub on launch and installs a newer frontend before you start watching. Only applies after the first update has been installed from here."
            />
            <div className="flex gap-2">
                <Button
                    intent="gray-outline"
                    loading={checking}
                    disabled={installing}
                    leftIcon={<LuSearch className="size-4" />}
                    onClick={() => refresh()}
                >
                    Search for updates
                </Button>
                <Button
                    intent="primary"
                    loading={installing}
                    disabled={checking || !result?.canInstall}
                    leftIcon={<LuDownload className="size-4" />}
                    onClick={handleInstall}
                >
                    Install update
                </Button>
            </div>
        </SettingsCard>
    )
}

// ─── Personal page layout ───────────────────────────────────────────────────────────────────────

type SectionDef = { id: string, title: string, description: string, icon: React.ElementType, accent: string }

const SECTIONS: SectionDef[] = [
    { id: "playback", title: "Playback & progress", description: "How episodes play and how your list keeps up.", icon: LuPlay, accent: "from-indigo-500/25 to-violet-500/10 text-indigo-300" },
    { id: "news", title: "News", description: "Headlines on the home page, the News page and in your notifications.", icon: LuNewspaper, accent: "from-sky-500/25 to-cyan-500/10 text-sky-300" },
    { id: "display", title: "Display", description: "What cards and pages show you.", icon: LuEye, accent: "from-fuchsia-500/25 to-pink-500/10 text-fuchsia-300" },
    { id: "lists", title: "AniList & manga", description: "Automatic list upkeep for your account.", icon: LuListChecks, accent: "from-emerald-500/25 to-teal-500/10 text-emerald-300" },
    { id: "player", title: "Desktop player", description: "Auto-skip for local files in MPV or IINA, plus player defaults.", icon: LuMonitorPlay, accent: "from-amber-500/25 to-orange-500/10 text-amber-300" },
    { id: "discord", title: "Discord", description: "Show what you're watching or reading.", icon: LuMessageCircle, accent: "from-blue-500/25 to-indigo-500/10 text-blue-300" },
    { id: "app", title: "App", description: "Updates for this device, and resetting to server defaults.", icon: LuSettings2, accent: "from-gray-400/25 to-gray-500/10 text-gray-300" },
]

function PersonalSection({ def, children, wide }: { def: SectionDef, children: React.ReactNode, wide?: boolean }) {
    const Icon = def.icon
    return (
        <section
            id={`personal-${def.id}`}
            data-personal-section={def.id}
            className={cn(
                "scroll-mt-28 rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.035] to-white/[0.01]",
                "shadow-xl shadow-black/20 backdrop-blur-md overflow-hidden",
            )}
        >
            <header className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-white/[0.06]">
                <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-white/10", def.accent)}>
                    <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight">{def.title}</h3>
                    <p className="text-sm text-[--muted] leading-snug">{def.description}</p>
                </div>
            </header>
            <div className="divide-y divide-white/[0.05]">
                <WidgetErrorBoundary label={def.title}>
                    {children}
                </WidgetErrorBoundary>
            </div>
        </section>
    )
}

/** One setting row. Shows a "Custom" chip (and a reset) when this profile overrides the server value. */
function SettingRow({ settingKey, children, className }: {
    settingKey?: keyof ClientSettings | (keyof ClientSettings)[]
    children: React.ReactNode
    className?: string
}) {
    const clientSettings = useClientSettings()
    const keys = settingKey === undefined ? [] : Array.isArray(settingKey) ? settingKey : [settingKey]
    const overridden = keys.some(k => clientSettings[k] !== undefined)
    return (
        <div className={cn("relative px-5 py-4 transition-colors hover:bg-white/[0.02]", className)}>
            {overridden && (
                <div className="absolute right-3 top-2 z-[2] flex items-center gap-1">
                    <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-200 ring-1 ring-brand-400/20">
                        Custom
                    </span>
                    <button
                        type="button"
                        title="Use the server default"
                        aria-label="Use the server default"
                        className="rounded-full p-1 text-[--muted] hover:bg-white/10 hover:text-white"
                        onClick={() => setClientSettings(prev => {
                            const next = { ...prev }
                            keys.forEach(k => delete next[k])
                            return next
                        })}
                    >
                        <LuRotateCcw className="size-3" />
                    </button>
                </div>
            )}
            <div className={cn(overridden && "pr-24")}>{children}</div>
        </div>
    )
}

const NEWS_MODES: { id: "all" | "lists" | "keywords", title: string, description: string, icon: React.ElementType }[] = [
    { id: "all", title: "All news", description: "Every new headline.", icon: LuRss },
    { id: "lists", title: "My lists", description: "Only titles on your Planning or Completed lists.", icon: LuBookmarkCheck },
    { id: "keywords", title: "Keywords", description: "Only headlines with your keywords.", icon: LuTags },
]

function NewsNotifyModePicker({ value, onChange, disabled }: { value: "all" | "lists" | "keywords", onChange: (v: "all" | "lists" | "keywords") => void, disabled?: boolean }) {
    return (
        <div role="radiogroup" aria-label="Which news notifies you" className={cn("grid gap-2 sm:grid-cols-3", disabled && "opacity-50 pointer-events-none")}>
            {NEWS_MODES.map(m => {
                const Icon = m.icon
                const active = value === m.id
                return (
                    <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(m.id)}
                        className={cn(
                            "group relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
                            active
                                ? "border-brand-400/60 bg-brand-500/10 shadow-[0_0_0_1px_rgb(var(--color-brand-500)/0.25),0_8px_24px_-12px_rgb(var(--color-brand-500)/0.6)]"
                                : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
                        )}
                    >
                        <div className="flex w-full items-center justify-between">
                            <Icon className={cn("size-4", active ? "text-brand-300" : "text-[--muted]")} />
                            <span className={cn("size-3.5 rounded-full border-2", active ? "border-brand-400 bg-brand-400" : "border-white/25")} />
                        </div>
                        <span className="text-sm font-semibold">{m.title}</span>
                        <span className="text-xs leading-snug text-[--muted]">{m.description}</span>
                    </button>
                )
            })}
        </div>
    )
}

function KeywordEditor({ value, onChange }: { value: string, onChange: (v: string) => void }) {
    const words = value.split(",").map(w => w.trim()).filter(Boolean)
    const [draft, setDraft] = React.useState("")
    const commit = () => {
        const add = draft.split(",").map(w => w.trim()).filter(Boolean)
        if (!add.length) return
        const next = Array.from(new Set([...words, ...add]))
        onChange(next.join(", "))
        setDraft("")
    }
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 min-h-[2rem] rounded-xl border border-white/10 bg-black/20 p-2">
                {words.map(w => (
                    <span key={w} className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-xs text-sky-100 ring-1 ring-sky-400/20">
                        {w}
                        <button
                            type="button"
                            aria-label={`Remove ${w}`}
                            className="text-sky-200/70 hover:text-white"
                            onClick={() => onChange(words.filter(x => x !== w).join(", "))}
                        >
                            <LuX className="size-3" />
                        </button>
                    </span>
                ))}
                <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault()
                            commit()
                        } else if (e.key === "Backspace" && !draft && words.length) {
                            onChange(words.slice(0, -1).join(", "))
                        }
                    }}
                    onBlur={commit}
                    placeholder={words.length ? "Add another…" : "Type a keyword and press Enter"}
                    className="min-w-[10rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-[--muted]"
                />
            </div>
            <p className="text-xs text-[--muted]">
                {words.length
                    ? "Phrases with spaces match anywhere; single words match whole words only."
                    : "No keywords yet — the built-in list is used (announcements of deaths and memorials)."}
            </p>
        </div>
    )
}

function PersonalHero({ overridesCount }: { overridesCount: number }) {
    const profile = useAtomValue(currentProfileAtom)
    const avatar = profile?.avatarPath || profile?.anilistAvatar
    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-brand-500/15 via-purple-500/[0.07] to-transparent p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-brand-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-fuchsia-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
                {avatar
                    ? <img src={avatar} alt="" className="size-14 rounded-2xl object-cover ring-2 ring-white/10" />
                    : <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-500/20 ring-2 ring-white/10"><LuUserCog className="size-7 text-brand-200" /></div>}
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200/80">Personal settings</p>
                    <h2 className="truncate text-2xl font-bold tracking-tight">{profile?.name ?? "This profile"}</h2>
                    <p className="text-sm text-[--muted]">Saved to your profile and synced across your devices. Other profiles are never affected.</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium ring-1",
                        overridesCount > 0 ? "bg-brand-500/15 text-brand-100 ring-brand-400/25" : "bg-white/5 text-[--muted] ring-white/10",
                    )}>
                        {overridesCount > 0 ? `${overridesCount} customized` : "Using server defaults"}
                    </span>
                </div>
            </div>
        </div>
    )
}

function PersonalNav() {
    const [active, setActive] = React.useState(SECTIONS[0].id)
    React.useEffect(() => {
        const els = SECTIONS.map(s => document.getElementById(`personal-${s.id}`)).filter(Boolean) as HTMLElement[]
        const io = new IntersectionObserver(entries => {
            const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
            if (visible) setActive((visible.target as HTMLElement).dataset.personalSection ?? SECTIONS[0].id)
        }, { rootMargin: "-20% 0px -60% 0px" })
        els.forEach(el => io.observe(el))
        return () => io.disconnect()
    }, [])
    return (
        <nav aria-label="Personal settings sections" className="sticky top-2 z-[5] -mx-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-gray-950/70 p-1.5 backdrop-blur-xl">
            <div className="flex gap-1 w-max">
                {SECTIONS.map(s => {
                    const Icon = s.icon
                    return (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => document.getElementById(`personal-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                            className={cn(
                                "flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                                active === s.id ? "bg-white/10 text-white" : "text-[--muted] hover:bg-white/5 hover:text-white",
                            )}
                        >
                            <Icon className="size-3.5" /> {s.title}
                        </button>
                    )
                })}
            </div>
        </nav>
    )
}

export function ClientSettings(props: ClientSettingsProps) {

    const {} = props

    const clientSettings = useClientSettings()
    const personal = usePersonalSettings()

    const overridesCount = Object.values(clientSettings).filter(v => v !== undefined).length

    function handleSet<K extends keyof ClientSettings>(key: K, value: ClientSettings[K]) {
        setClientSettings(prev => ({ ...prev, [key]: value }))
    }

    const section = (id: string) => SECTIONS.find(s => s.id === id)!

    return (
        <div className="space-y-5" data-personal-settings>
            <PersonalHero overridesCount={overridesCount} />
            <PersonalNav />

            {/* Full-width section, then a two-column masonry flow (no row gaps on desktop), then the
                full-width App section. */}
            <div className="space-y-5">
                <PersonalSection def={section("playback")} wide>
                    <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.05]">
                        <SettingRow settingKey="autoUpdateProgress">
                            <Switch
                                side="right"
                                value={personal.autoUpdateProgress}
                                onValueChange={v => handleSet("autoUpdateProgress", v)}
                                label="Update progress automatically"
                                help="Marks an episode watched on your list once you've seen most of it."
                                moreHelp="Applies to the in-app players and integrated external players."
                            />
                        </SettingRow>
                        <SettingRow settingKey="enableWatchContinuity">
                            <Switch
                                side="right"
                                value={personal.enableWatchContinuity}
                                onValueChange={v => handleSet("enableWatchContinuity", v)}
                                label="Remember where I stopped"
                                help="Resume episodes from where you left off."
                            />
                        </SettingRow>
                        <SettingRow settingKey="autoPlayNextEpisode">
                            <Switch
                                side="right"
                                value={personal.autoPlayNextEpisode}
                                onValueChange={v => handleSet("autoPlayNextEpisode", v)}
                                label="Auto play next episode"
                                help="Start the next episode when one ends."
                            />
                        </SettingRow>
                    </div>
                    <SettingRow settingKey={["stillWatchingChecksEnabled", "stillWatchingEpisodes", "stillWatchingTimingMode", "stillWatchingStartHour", "stillWatchingEndHour"]}>
                        <div className="space-y-4">
                            <Switch
                                side="right"
                                value={personal.stillWatchingChecksEnabled}
                                onValueChange={v => handleSet("stillWatchingChecksEnabled", v)}
                                label="Ask “Are you still watching?”"
                                help="After a few episodes in a row, the player checks before starting the next one."
                            />
                            {personal.stillWatchingChecksEnabled && (
                                <div className="grid gap-4 md:grid-cols-[240px_1fr] rounded-xl bg-black/20 p-4 ring-1 ring-white/[0.06]">
                                    <NumberInput
                                        label="Episodes between checks"
                                        min={1}
                                        max={20}
                                        value={personal.stillWatchingEpisodes}
                                        onValueChange={v => {
                                            if (!Number.isNaN(v)) handleSet("stillWatchingEpisodes", v)
                                        }}
                                    />
                                    <div>
                                        <p className="mb-2 text-sm font-medium">When to ask</p>
                                        <StillWatchingTiming
                                            mode={personal.stillWatchingTimingMode}
                                            startHour={personal.stillWatchingStartHour}
                                            endHour={personal.stillWatchingEndHour}
                                            onModeChange={mode => handleSet("stillWatchingTimingMode", mode)}
                                            onStartHourChange={hour => handleSet("stillWatchingStartHour", hour)}
                                            onEndHourChange={hour => handleSet("stillWatchingEndHour", hour)}
                                        />
                                        <p className="mt-2 text-xs text-[--muted]">
                                            Late-night sessions run long — that's when the question earns its interruption.
                                            Choose All day or your own hours to change it.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </SettingRow>
                </PersonalSection>

                <div className="gap-5 xl:columns-2 [&>section]:mb-5 [&>section]:break-inside-avoid">
                    <PersonalSection def={section("news")}>
                        <SettingRow settingKey="newsNotifyNewEntries">
                            <Switch
                                side="right"
                                value={personal.newsNotifyNewEntries}
                                onValueChange={v => handleSet("newsNotifyNewEntries", v)}
                                label="Notify me about new articles"
                                help="A notification pops up and lands in your notification drawer."
                                moreHelp="The server checks your feeds every 15 minutes."
                            />
                        </SettingRow>
                        <SettingRow settingKey={["newsNotifyMode", "newsNotifyKeywords"]}>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-sm font-medium">Which news notifies me</p>
                                    <p className="text-xs text-[--muted]">Every headline still shows on the News page — this only decides what interrupts you.</p>
                                </div>
                                <NewsNotifyModePicker
                                    value={personal.newsNotifyMode}
                                    onChange={v => handleSet("newsNotifyMode", v)}
                                    disabled={!personal.newsNotifyNewEntries}
                                />
                                {personal.newsNotifyNewEntries && personal.newsNotifyMode === "keywords" && (
                                    <KeywordEditor value={personal.newsNotifyKeywords} onChange={v => handleSet("newsNotifyKeywords", v)} />
                                )}
                                {personal.newsNotifyNewEntries && personal.newsNotifyMode === "lists" && (
                                    <p className="rounded-lg bg-black/20 px-3 py-2 text-xs text-[--muted] ring-1 ring-white/[0.06]">
                                        Matches a headline against the titles on your Planning and Completed lists (anime and manga).
                                    </p>
                                )}
                            </div>
                        </SettingRow>
                        <SettingRow settingKey="newsFeedShowMoreCount">
                            <NumberInput
                                className="max-w-[240px]"
                                label="Entries on the News page"
                                help="Between 10 and 200."
                                min={10}
                                max={200}
                                value={personal.newsFeedShowMoreCount}
                                onValueChange={v => {
                                    if (!Number.isNaN(v)) handleSet("newsFeedShowMoreCount", v)
                                }}
                            />
                        </SettingRow>
                    </PersonalSection>

                    <PersonalSection def={section("display")}>
                        <SettingRow settingKey="hideAudienceScore">
                            <Switch
                                side="right"
                                value={personal.hideAudienceScore}
                                onValueChange={v => handleSet("hideAudienceScore", v)}
                                label="Hide audience score"
                                help="Keep scores hidden until you choose to see them."
                            />
                        </SettingRow>
                        <SettingRow settingKey="blurAdultContent">
                            <Switch
                                side="right"
                                value={personal.blurAdultContent}
                                onValueChange={v => handleSet("blurAdultContent", v)}
                                label="Blur adult content"
                                help="Whether adult content appears at all is a server-wide setting."
                            />
                        </SettingRow>
                        <SettingRow settingKey="disableAnimeCardTrailers">
                            <Switch
                                side="right"
                                value={personal.disableAnimeCardTrailers}
                                onValueChange={v => handleSet("disableAnimeCardTrailers", v)}
                                label="Disable card trailers"
                                help="No trailer previews when hovering anime cards."
                            />
                        </SettingRow>
                    </PersonalSection>

                    <PersonalSection def={section("discord")}>
                        <SettingRow settingKey={["enableRichPresence", "enableAnimeRichPresence", "enableMangaRichPresence"]}>
                            <div className="space-y-3">
                                <Switch
                                    side="right"
                                    value={personal.enableRichPresence}
                                    onValueChange={v => handleSet("enableRichPresence", v)}
                                    label="Enable rich presence"
                                />
                                <div className={cn("flex flex-wrap gap-2", !personal.enableRichPresence && "opacity-50 pointer-events-none")}>
                                    {([["enableAnimeRichPresence", "Anime"], ["enableMangaRichPresence", "Manga"]] as const).map(([key, label]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => handleSet(key, !personal[key])}
                                            className={cn(
                                                "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors",
                                                personal[key] ? "bg-blue-500/20 text-blue-100 ring-blue-400/30" : "bg-white/5 text-[--muted] ring-white/10 hover:text-white",
                                            )}
                                        >
                                            {personal[key] ? "✓ " : ""}{label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </SettingRow>
                        <SettingRow settingKey="richPresenceHideSeanimeRepositoryButton">
                            <Switch
                                side="right"
                                value={personal.richPresenceHideSeanimeRepositoryButton}
                                onValueChange={v => handleSet("richPresenceHideSeanimeRepositoryButton", v)}
                                label="Hide the repository button"
                            />
                        </SettingRow>
                        <SettingRow settingKey="richPresenceShowAniListProfileButton">
                            <Switch
                                side="right"
                                value={personal.richPresenceShowAniListProfileButton}
                                onValueChange={v => handleSet("richPresenceShowAniListProfileButton", v)}
                                label="Show my AniList profile button"
                            />
                        </SettingRow>
                    </PersonalSection>

                    <PersonalSection def={section("lists")}>
                        <SettingRow settingKey="mangaAutoUpdateProgress">
                            <Switch
                                side="right"
                                value={personal.mangaAutoUpdateProgress}
                                onValueChange={v => handleSet("mangaAutoUpdateProgress", v)}
                                label="Update manga progress automatically"
                                help="Reading a chapter to the end marks it as read."
                            />
                        </SettingRow>
                        <SettingRow settingKey="autoPauseStaleWatchingDays">
                            <NumberInput
                                className="max-w-[240px]"
                                label="Auto-pause series after (days)"
                                help="A Watching series with no activity for this long is set to Paused. 0 turns it off."
                                min={0}
                                max={365}
                                value={personal.autoPauseStaleWatchingDays}
                                onValueChange={v => {
                                    if (!Number.isNaN(v)) handleSet("autoPauseStaleWatchingDays", v)
                                }}
                            />
                        </SettingRow>
                        <div className="p-3 [&_.UI-Card__root]:bg-transparent [&_.UI-Card__root]:border-0 [&_.UI-Card__root]:shadow-none">
                            <AnilistOverwriteCard />
                        </div>
                    </PersonalSection>

                    <PersonalSection def={section("player")}>
                        <SettingRow settingKey="mpvAutoSkipOpening">
                            <Switch
                                side="right"
                                value={personal.mpvAutoSkipOpening}
                                onValueChange={v => handleSet("mpvAutoSkipOpening", v)}
                                label="Skip openings"
                            />
                        </SettingRow>
                        <SettingRow settingKey="mpvAutoSkipEnding">
                            <Switch
                                side="right"
                                value={personal.mpvAutoSkipEnding}
                                onValueChange={v => handleSet("mpvAutoSkipEnding", v)}
                                label="Skip endings"
                            />
                        </SettingRow>
                        <SettingRow settingKey="mpvAutoSkipFiller">
                            <Switch
                                side="right"
                                value={personal.mpvAutoSkipFiller}
                                onValueChange={v => handleSet("mpvAutoSkipFiller", v)}
                                label="Skip filler episodes"
                                help="Jumps to the next non-filler episode, using AnimeFillerList data."
                            />
                        </SettingRow>
                        <div className="p-3 [&_.UI-Card__root]:bg-transparent [&_.UI-Card__root]:border-0 [&_.UI-Card__root]:shadow-none">
                            <PlaybackSettings />
                        </div>
                    </PersonalSection>

                </div>

                <PersonalSection def={section("app")} wide>
                    <div className="p-3 [&_.UI-Card__root]:bg-transparent [&_.UI-Card__root]:border-0 [&_.UI-Card__root]:shadow-none">
                        <GitHubFrontendUpdateCard />
                    </div>
                    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-medium">Server defaults</p>
                            <p className="text-xs text-[--muted]">
                                {overridesCount > 0
                                    ? `${overridesCount} setting${overridesCount === 1 ? "" : "s"} customized for this profile. Anything you haven't changed follows the server.`
                                    : "Nothing customized — everything follows the server-wide values."}
                            </p>
                        </div>
                        <Button
                            size="sm"
                            intent="white-subtle"
                            leftIcon={<LuRotateCcw className="size-4" />}
                            disabled={overridesCount === 0}
                            onClick={() => {
                                resetClientSettings()
                                toast.success("Personal settings reset to server defaults")
                            }}
                        >
                            Reset everything
                        </Button>
                    </div>
                </PersonalSection>
            </div>
        </div>
    )
}
