import type { VideoCoreSettings } from "@/app/(main)/_features/video-core/video-core.atoms"

// The Personal "Sub or dub" setting, applied over the player's own language preferences: with dub,
// English audio goes first and the subtitles follow the dub's subtitle choice; with sub, the
// player's own preferences (Japanese audio, English subtitles by default) are left as they are.

export type AudioPreference = "sub" | "dub"
/** With dub: no subtitles, only signs & songs, or the full subtitles. */
export type DubSubtitles = "off" | "signs" | "full"

export const DUB_AUDIO_LANGUAGES = "eng,en,english"

export function applySubDubPreference(settings: VideoCoreSettings, preference: AudioPreference, dubSubtitles: DubSubtitles): VideoCoreSettings {
    if (preference !== "dub") return settings
    const existing = settings.preferredAudioLanguage
        .split(",")
        .map(l => l.trim())
        .filter(l => l && !DUB_AUDIO_LANGUAGES.split(",").includes(l.toLowerCase()))
    const audio = [DUB_AUDIO_LANGUAGES, ...existing].join(",")
    switch (dubSubtitles) {
        case "off":
            return { ...settings, preferredAudioLanguage: audio, preferredSubtitleLanguage: "none" }
        case "signs":
            return { ...settings, preferredAudioLanguage: audio, subtitleSignsOnly: true }
        default:
            return { ...settings, preferredAudioLanguage: audio }
    }
}

/** A signs & songs track: marked forced, or named that way. */
export function isSignsTrack(t: { label?: string, forced?: boolean }): boolean {
    if (t.forced) return true
    return /\b(signs?|songs?|forced|s&s)\b/i.test(t.label ?? "")
}
