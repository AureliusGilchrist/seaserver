import { SettingsCard, SettingsPageHeader } from "@/app/(main)/settings/_components/settings-card"
import { AnilistOverwriteCard } from "@/app/(main)/settings/_containers/anilist-overwrite-settings"
import { PlaybackSettings } from "@/app/(main)/settings/_components/playback-settings"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { NumberInput } from "@/components/ui/number-input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { type ClientSettings, resetClientSettings, setClientSettings, useClientSettings } from "@/lib/client-settings"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import React from "react"
import { LuRotateCcw, LuUserCog } from "react-icons/lu"
import { toast } from "sonner"

type ClientSettingsProps = {}

// Client settings are per-profile app preferences: saved to the browser and mirrored to the
// server under the current profile, so they follow the profile across devices and survive
// reinstalls — while never affecting any other profile. Each switch applies immediately; a
// field left unset (see "Reset") inherits the server-wide value an admin configured.
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
