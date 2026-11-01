export type HlsQualityOption = {
    index: number
    height: number
    bitrate: number
}

export function getPreferredHlsQualityLevel(levels: HlsQualityOption[], quality: string | undefined) {
    if (!levels.length || !quality) return null

    const normalized = quality.trim().toLowerCase()
    const height = Number(normalized.match(/\b(\d{3,4})p\b/)?.[1])
    if (!height) return /\b(auto|default)\b/.test(normalized) ? -1 : null

    const preferredLevel = levels.find(level => level.height === height)
    if (preferredLevel) return preferredLevel.index

    return levels.reduce((lowest, level) => level.bitrate < lowest.bitrate ? level : lowest).index
}

const PHONE_MAX_HEIGHT = 720

/**
 * The level a phone stays on while transcoding, or null when there is nothing to choose between.
 *
 * Automatic quality does not work against a live transcode: every switch starts a new encoder from
 * scratch, which looks like a slow network, which causes another switch, and playback stalls every
 * few seconds on a connection with plenty to spare.
 */
export function getPhoneHlsLevel(levels: HlsQualityOption[]) {
    if (levels.length < 2) return null
    const playable = levels.filter(level => level.height <= PHONE_MAX_HEIGHT)
    if (!playable.length) return null
    return playable.reduce((best, level) => level.height > best.height ? level : best).index
}
