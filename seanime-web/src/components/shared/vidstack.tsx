import type { PlayerIconOverrides } from "@/lib/theme/anime-themes/types"
import { safePlayerIcon } from "@/lib/theme/anime-themes/safe-player-icon"
import { defaultLayoutIcons } from "@vidstack/react/player/layouts/default"
import type { DefaultLayoutIcons } from "@vidstack/react/player/layouts/default"
import { LuCast, LuVolume1, LuVolume2, LuVolumeX } from "react-icons/lu"
import {
    RiClosedCaptioningFill,
    RiClosedCaptioningLine,
    RiFullscreenExitLine,
    RiFullscreenLine,
    RiPauseLargeLine,
    RiPictureInPictureExitLine,
    RiPictureInPictureLine,
    RiPlayLargeLine,
    RiResetLeftFill,
    RiSettings4Line,
} from "react-icons/ri"

export const vidstackLayoutIcons = {
    ...defaultLayoutIcons,
    PlayButton: {
        Play: RiPlayLargeLine,
        Pause: RiPauseLargeLine,
        Replay: RiResetLeftFill,
    },
    MuteButton: {
        Mute: LuVolumeX,
        VolumeLow: LuVolume1,
        VolumeHigh: LuVolume2,
    },
    GoogleCastButton: {
        Default: LuCast,
    },
    PIPButton: {
        Enter: RiPictureInPictureLine,
        Exit: RiPictureInPictureExitLine,
    },
    FullscreenButton: {
        Enter: RiFullscreenLine,
        Exit: RiFullscreenExitLine,
    },
    Menu: {
        ...defaultLayoutIcons["Menu"],
        Settings: RiSettings4Line,
    },
    CaptionButton: {
        On: RiClosedCaptioningFill,
        Off: RiClosedCaptioningLine,
    },
}

/**
 * Applies a theme's `playerIconOverrides` on top of the default vidstack layout icon set.
 *
 * The final `as unknown as DefaultLayoutIcons` cast is required, not stylistic: `ThemeIconComponent`
 * is pinned to `React.FC` so it stays assignable from `player-icons.tsx`'s legacy `React.FC`-typed
 * icon sets (out of scope to change), but the installed `@types/react` widens `FC`'s return to
 * `ReactNode | Promise<ReactNode>` for React 19 server components, which is structurally incompatible
 * with vidstack's `DefaultLayoutIcon` (a plain, non-promise `ReactNode`-returning call signature) —
 * a self-referential `ReactNode`/`AwaitedReactNode` type-checker quirk, not a real runtime mismatch,
 * since every icon here is a synchronous component that only ever returns an `<svg>`.
 */
export function mergePlayerIcons(overrides: PlayerIconOverrides | undefined): DefaultLayoutIcons {
    if (!overrides) return vidstackLayoutIcons
    const merged = {
        ...vidstackLayoutIcons,
        PlayButton: {
            ...vidstackLayoutIcons.PlayButton,
            Play: safePlayerIcon(overrides, "play", vidstackLayoutIcons.PlayButton.Play as any),
            Pause: safePlayerIcon(overrides, "pause", vidstackLayoutIcons.PlayButton.Pause as any),
        },
        MuteButton: {
            ...vidstackLayoutIcons.MuteButton,
            Mute: safePlayerIcon(overrides, "volumeMuted", vidstackLayoutIcons.MuteButton.Mute as any),
            VolumeLow: safePlayerIcon(overrides, "volumeLow", vidstackLayoutIcons.MuteButton.VolumeLow as any),
            VolumeHigh: safePlayerIcon(overrides, "volumeHigh", vidstackLayoutIcons.MuteButton.VolumeHigh as any),
        },
        PIPButton: {
            ...vidstackLayoutIcons.PIPButton,
            Enter: safePlayerIcon(overrides, "pip", vidstackLayoutIcons.PIPButton.Enter as any),
            Exit: safePlayerIcon(overrides, "pipOff", vidstackLayoutIcons.PIPButton.Exit as any),
        },
        FullscreenButton: {
            ...vidstackLayoutIcons.FullscreenButton,
            Enter: safePlayerIcon(overrides, "fullscreenEnter", vidstackLayoutIcons.FullscreenButton.Enter as any),
            Exit: safePlayerIcon(overrides, "fullscreenExit", vidstackLayoutIcons.FullscreenButton.Exit as any),
        },
    }
    return merged as unknown as DefaultLayoutIcons
}
