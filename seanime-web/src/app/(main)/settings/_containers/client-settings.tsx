import { SettingsCard, SettingsPageHeader } from "@/app/(main)/settings/_components/settings-card"
import { AnilistOverwriteCard } from "@/app/(main)/settings/_containers/anilist-overwrite-settings"
import { PlaybackSettings } from "@/app/(main)/settings/_components/playback-settings"
import { StillWatchingTiming } from "@/app/(main)/settings/_components/still-watching-timing"
import { MAX_LOG_LINES, stamp, updateSettingsLogAtom } from "@/app/(main)/settings/_containers/update-settings"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { NumberInput } from "@/components/ui/number-input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { type ClientSettings, resetClientSettings, setClientSettings, useClientSettings } from "@/lib/client-settings"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { useAtom } from "jotai"
import React from "react"
import { LuDownload, LuRotateCcw, LuSearch, LuUserCog } from "react-icons/lu"
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

export function ClientSettings(props: ClientSettingsProps) {

    const {} = props

    const clientSettings = useClientSettings()
    const personal = usePersonalSettings()

    const overridesCount = Object.values(clientSettings).filter(v => v !== undefined).length

    function handleSet<K extends keyof ClientSettings>(key: K, value: ClientSettings[K]) {
        setClientSettings(prev => ({ ...prev, [key]: value }))
    }

    return (
        <div className="space-y-4">

            <SettingsPageHeader
                title="Personal"
                description="App preferences for this profile only — other profiles are unaffected"
                icon={LuUserCog}
            />

            <SettingsCard
                title="Playback & progress"
                description="Applies when you're watching; server-wide defaults are set by an admin under Server → App."
            >
                <Switch
                    value={personal.autoUpdateProgress}
                    onValueChange={v => handleSet("autoUpdateProgress", v)}
                    label="Automatically update progress"
                    help="If enabled, your progress will be automatically updated when you watch 80% of an episode."
                    moreHelp="Only applies to the browser player and integrated players."
                />
                <Switch
                    value={personal.enableWatchContinuity}
                    onValueChange={v => handleSet("enableWatchContinuity", v)}
                    label="Enable watch history"
                    help="If enabled, Deus Ex Aeternae will remember your watch progress and resume from where you left off."
                />
                <Switch
                    value={personal.autoPlayNextEpisode}
                    onValueChange={v => handleSet("autoPlayNextEpisode", v)}
                    label="Auto play next episode"
                    help="If enabled, the next episode starts automatically when one ends."
                />
                <Separator />
                <Switch
                    value={personal.stillWatchingChecksEnabled}
                    onValueChange={v => handleSet("stillWatchingChecksEnabled", v)}
                    label="Ask “Are you still watching?”"
                    help="After a few episodes in a row, the player asks before starting the next one."
                />
                {personal.stillWatchingChecksEnabled && (
                    <>
                        <NumberInput
                            className="max-w-[240px]"
                            label="Episodes between checks"
                            help="How many consecutive episodes to play before the player asks if you're still watching."
                            min={1}
                            max={20}
                            value={personal.stillWatchingEpisodes}
                            onValueChange={v => {
                                if (!Number.isNaN(v)) {
                                    handleSet("stillWatchingEpisodes", v)
                                }
                            }}
                        />
                        <div className="max-w-md">
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
                                Late-night sessions run long and empty rooms go unnoticed — that's when
                                the question earns its interruption. Midday viewing stays untouched unless
                                you choose All day or draw your own hours.
                            </p>
                        </div>
                    </>
                )}
            </SettingsCard>

            <SettingsCard title="Display">
                <Switch
                    value={personal.hideAudienceScore}
                    onValueChange={v => handleSet("hideAudienceScore", v)}
                    label="Hide audience score"
                    help="If enabled, the audience score will be hidden until you decide to view it."
                />
                <Switch
                    value={personal.blurAdultContent}
                    onValueChange={v => handleSet("blurAdultContent", v)}
                    label="Blur adult content"
                    help="If enabled, adult content will be blurred. Whether adult content appears at all is a server-wide setting."
                />
                <Switch
                    value={personal.disableAnimeCardTrailers}
                    onValueChange={v => handleSet("disableAnimeCardTrailers", v)}
                    label="Disable anime card trailers"
                />
            </SettingsCard>

            <SettingsCard title="Manga">
                <Switch
                    value={personal.mangaAutoUpdateProgress}
                    onValueChange={v => handleSet("mangaAutoUpdateProgress", v)}
                    label="Automatically update manga progress"
                    help="If enabled, reading a chapter to the end marks it as read on your list."
                />
            </SettingsCard>

            <SettingsCard
                title="News"
                description="The RSS headlines on the home page and the News page."
            >
                <Switch
                    value={personal.newsNotifyNewEntries}
                    onValueChange={v => handleSet("newsNotifyNewEntries", v)}
                    label="Notify about new articles"
                    help="When a feed publishes something new, a notification pops up and lands in the notification drawer."
                    moreHelp="Each profile decides for itself; the server checks your feeds every 15 minutes."
                />
                <NumberInput
                    className="max-w-[240px]"
                    label="Entries in the News page"
                    help="How many entries the News page shows — the page the widget's “Show more” opens. Between 10 and 200."
                    min={10}
                    max={200}
                    value={personal.newsFeedShowMoreCount}
                    onValueChange={v => {
                        if (!Number.isNaN(v)) {
                            handleSet("newsFeedShowMoreCount", v)
                        }
                    }}
                />
            </SettingsCard>

            <SettingsCard
                title="AniList"
                description="Automatic list maintenance for your account."
            >
                <NumberInput
                    className="max-w-[240px]"
                    label="Auto-pause series after"
                    help="Sets a 'watching' series on your AniList to 'paused' after this many days without watch activity. Set to 0 to disable."
                    min={0}
                    max={365}
                    value={personal.autoPauseStaleWatchingDays}
                    onValueChange={v => {
                        if (!Number.isNaN(v)) {
                            handleSet("autoPauseStaleWatchingDays", v)
                        }
                    }}
                />
            </SettingsCard>

            <AnilistOverwriteCard />

            <SettingsCard
                title="Desktop player auto-skip"
                description="Applies to local files played through MPV or IINA."
            >
                <Switch
                    value={personal.mpvAutoSkipOpening}
                    onValueChange={v => handleSet("mpvAutoSkipOpening", v)}
                    label="Auto-skip opening"
                    help="Automatically seek past the opening when playing local files in MPV or IINA."
                />
                <Switch
                    value={personal.mpvAutoSkipEnding}
                    onValueChange={v => handleSet("mpvAutoSkipEnding", v)}
                    label="Auto-skip ending"
                    help="Automatically seek past the ending when playing local files in MPV or IINA."
                />
                <Switch
                    value={personal.mpvAutoSkipFiller}
                    onValueChange={v => handleSet("mpvAutoSkipFiller", v)}
                    label="Auto-skip filler episodes"
                    help="Automatically skip to the next non-filler episode when a filler starts in MPV or IINA. Uses AnimeFillerList data."
                />
            </SettingsCard>

            <SettingsCard
                title="Discord"
                description="Show what you are watching or reading in Discord."
            >
                <Switch
                    value={personal.enableRichPresence}
                    onValueChange={v => handleSet("enableRichPresence", v)}
                    label="Enable rich presence"
                />
                <div className={cn("flex gap-4 items-center flex-col md:flex-row", personal.enableRichPresence ? "opacity-100" : "opacity-50 pointer-events-none")}>
                    <Switch
                        value={personal.enableAnimeRichPresence}
                        onValueChange={v => handleSet("enableAnimeRichPresence", v)}
                        label="Anime"
                    />
                    <Switch
                        value={personal.enableMangaRichPresence}
                        onValueChange={v => handleSet("enableMangaRichPresence", v)}
                        label="Manga"
                    />
                </div>
                <Separator />
                <Switch
                    value={personal.richPresenceHideSeanimeRepositoryButton}
                    onValueChange={v => handleSet("richPresenceHideSeanimeRepositoryButton", v)}
                    label="Hide Deus Ex Aeternae Repository Button"
                />
                <Switch
                    value={personal.richPresenceShowAniListProfileButton}
                    onValueChange={v => handleSet("richPresenceShowAniListProfileButton", v)}
                    label="Show AniList Profile Button"
                    help="Show a button to open your profile page on AniList."
                />
            </SettingsCard>

            <PlaybackSettings />

            <GitHubFrontendUpdateCard />

            <SettingsCard
                title="Server defaults"
                description="These preferences apply per profile. Fields you haven't changed follow the server-wide values."
            >
                <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-[--muted]">
                        {overridesCount > 0
                            ? `${overridesCount} preference${overridesCount === 1 ? "" : "s"} overridden for this profile`
                            : "No overrides — everything follows the server-wide values"}
                    </p>
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
                        Reset to server defaults
                    </Button>
                </div>
            </SettingsCard>

        </div>
    )
}
