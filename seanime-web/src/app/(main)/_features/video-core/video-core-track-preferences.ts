import type { PerMediaTrackOverride } from "./video-core.atoms"

const STORAGE_KEY_PREFIX = "sea-video-track-preferences"

function getStorageKey(): string | null {
    if (typeof window === "undefined") return null

    try {
        const profileKey = window.localStorage.getItem("sea-profile-key") || "default"
        return `${STORAGE_KEY_PREFIX}-${profileKey}`
    } catch (error) {
        console.error("[VideoCore] Unable to determine profile for local track preferences", error)
        return null
    }
}

function readAllLocalTrackOverrides(key: string): Record<string, PerMediaTrackOverride> {
    try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return {}
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const overrides: Record<string, PerMediaTrackOverride> = {}
            for (const [mediaId, value] of Object.entries(parsed)) {
                if (!value || typeof value !== "object" || Array.isArray(value)) continue
                const fields = value as Record<string, unknown>
                overrides[mediaId] = {
                    audioLanguage: typeof fields.audioLanguage === "string" ? fields.audioLanguage : undefined,
                    audioCodecID: typeof fields.audioCodecID === "string" ? fields.audioCodecID : undefined,
                    subtitleLanguage: typeof fields.subtitleLanguage === "string" ? fields.subtitleLanguage : undefined,
                    subtitleCodecID: typeof fields.subtitleCodecID === "string" ? fields.subtitleCodecID : undefined,
                    subtitleLabel: typeof fields.subtitleLabel === "string" ? fields.subtitleLabel : undefined,
                }
            }
            return overrides
        }
        console.error("[VideoCore] Local track preferences have an invalid format")
    } catch (error) {
        console.error("[VideoCore] Unable to read local track preferences", error)
    }
    return {}
}

export function getLocalTrackOverride(mediaId: number | string): PerMediaTrackOverride | undefined {
    const key = getStorageKey()
    if (!key) return undefined
    return readAllLocalTrackOverrides(key)[String(mediaId)]
}

export function saveLocalTrackOverride(
    mediaId: number | string,
    override: Partial<PerMediaTrackOverride>,
): void {
    const key = getStorageKey()
    if (!key) return

    const overrides = readAllLocalTrackOverrides(key)
    const mediaKey = String(mediaId)
    const merged = { ...overrides[mediaKey], ...override }
    try {
        window.localStorage.setItem(key, JSON.stringify({ ...overrides, [mediaKey]: merged }))
    } catch (error) {
        console.error("[VideoCore] Unable to save local track preference", error)
    }
}
