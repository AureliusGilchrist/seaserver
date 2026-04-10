import { submenuClass, VdsSubmenuButton } from "@/app/(main)/onlinestream/_components/onlinestream-video-addons"
import { Switch } from "@/components/ui/switch"
import { TextInput } from "@/components/ui/text-input"
import { Menu } from "@vidstack/react"
import { useAtom } from "jotai/react"
import React from "react"
import { AiFillPlayCircle } from "react-icons/ai"
import { MdPlaylistPlay } from "react-icons/md"
import { RxSlider } from "react-icons/rx"
import { TbLanguage } from "react-icons/tb"
import {
    __seaMediaPlayer_autoNextAtom,
    __seaMediaPlayer_autoPlayAtom,
    __seaMediaPlayer_autoSkipIntroOutroAtom,
    __seaMediaPlayer_discreteControlsAtom,
    __seaMediaPlayer_preferredAudioLanguageAtom,
    __seaMediaPlayer_preferredSubtitleLanguageAtom,
} from "./sea-media-player.atoms"

export function SeaMediaPlayerPlaybackSubmenu() {

    const [autoPlay, setAutoPlay] = useAtom(__seaMediaPlayer_autoPlayAtom)
    const [autoNext, setAutoNext] = useAtom(__seaMediaPlayer_autoNextAtom)
    const [autoSkipIntroOutro, setAutoSkipIntroOutro] = useAtom(__seaMediaPlayer_autoSkipIntroOutroAtom)
    const [discreteControls, setDiscreteControls] = useAtom(__seaMediaPlayer_discreteControlsAtom)

    return (
        <>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Auto Play`}
                    hint={autoPlay ? "On" : "Off"}
                    disabled={false}
                    icon={AiFillPlayCircle}
                />
                <Menu.Content className={submenuClass}>
                    <Switch
                        label="Auto play"
                        fieldClass="py-2 px-2"
                        value={autoPlay}
                        onValueChange={setAutoPlay}
                    />
                </Menu.Content>
            </Menu.Root>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Auto Play Next Episode`}
                    hint={autoNext ? "On" : "Off"}
                    disabled={false}
                    icon={MdPlaylistPlay}
                />
                <Menu.Content className={submenuClass}>
                    <Switch
                        label="Auto play next episode"
                        fieldClass="py-2 px-2"
                        value={autoNext}
                        onValueChange={setAutoNext}
                    />
                </Menu.Content>
            </Menu.Root>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Skip Intro/Outro`}
                    hint={autoSkipIntroOutro ? "On" : "Off"}
                    disabled={false}
                    icon={MdPlaylistPlay}
                />
                <Menu.Content className={submenuClass}>
                    <Switch
                        label="Skip intro/outro"
                        fieldClass="py-2 px-2"
                        value={autoSkipIntroOutro}
                        onValueChange={setAutoSkipIntroOutro}
                    />
                </Menu.Content>
            </Menu.Root>
            <Menu.Root>
                <VdsSubmenuButton
                    label={`Discrete Controls`}
                    hint={discreteControls ? "On" : "Off"}
                    disabled={false}
                    icon={RxSlider}
                />
                <Menu.Content className={submenuClass}>
                    <Switch
                        label="Discrete controls"
                        help="Only show the controls when the mouse is over the bottom part. (Large screens only)"
                        fieldClass="py-2 px-2"
                        value={discreteControls}
                        onValueChange={setDiscreteControls}
                        fieldHelpTextClass="max-w-xs"
                    />
                </Menu.Content>
            </Menu.Root>
            <SeaMediaPlayerLanguageSubmenu />
        </>
    )
}

function SeaMediaPlayerLanguageSubmenu() {
    const [preferredAudioLang, setPreferredAudioLang] = useAtom(__seaMediaPlayer_preferredAudioLanguageAtom)
    const [preferredSubtitleLang, setPreferredSubtitleLang] = useAtom(__seaMediaPlayer_preferredSubtitleLanguageAtom)

    const audioHint = React.useMemo(() => {
        const first = preferredAudioLang.split(",")[0]?.trim()
        return first || "Not set"
    }, [preferredAudioLang])

    const subtitleHint = React.useMemo(() => {
        const first = preferredSubtitleLang.split(",")[0]?.trim()
        return first || "Not set"
    }, [preferredSubtitleLang])

    return (
        <Menu.Root>
            <VdsSubmenuButton
                label="Language Preferences"
                hint={`${audioHint} / ${subtitleHint}`}
                disabled={false}
                icon={TbLanguage}
            />
            <Menu.Content className={submenuClass}>
                <div className="space-y-3 p-2">
                    <TextInput
                        label="Preferred audio language"
                        help="Comma-separated codes (e.g. jpn,jp,japanese). Applied on next file load."
                        value={preferredAudioLang}
                        onValueChange={setPreferredAudioLang}
                        size="sm"
                        fieldHelpTextClass="max-w-xs"
                    />
                    <TextInput
                        label="Preferred subtitle language"
                        help="Comma-separated codes (e.g. en,eng,english). Applied on next file load."
                        value={preferredSubtitleLang}
                        onValueChange={setPreferredSubtitleLang}
                        size="sm"
                        fieldHelpTextClass="max-w-xs"
                    />
                </div>
            </Menu.Content>
        </Menu.Root>
    )
}
