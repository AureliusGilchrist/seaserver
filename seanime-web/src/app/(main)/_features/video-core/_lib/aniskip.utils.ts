export type AniSkipEntryLike = {
    interval: {
        startTime: number
        endTime: number
    }
}

export type NormalizedSkipData<T extends AniSkipEntryLike = AniSkipEntryLike> = {
    op: T | null
    ed: T | null
}

const isValidAniSkipTime = (value: number) => Number.isFinite(value) && value >= 0

export function normalizeAniSkipEntry<T extends AniSkipEntryLike>(entry: T | null | undefined): T | null {
    if (!entry) return null

    const { startTime, endTime } = entry.interval
    if (!isValidAniSkipTime(startTime) || !isValidAniSkipTime(endTime) || endTime <= startTime) {
        return null
    }

    return entry
}

export function normalizeAniSkipData<T extends AniSkipEntryLike>(skipData: NormalizedSkipData<T> | undefined): NormalizedSkipData<T> {
    const op = normalizeAniSkipEntry(skipData?.op)
    let ed = normalizeAniSkipEntry(skipData?.ed)

    if (op && ed && ed.interval.startTime <= op.interval.endTime) {
        ed = null
    }

    return { op, ed }
}
export type ProviderSkipInterval = { start: number, end: number }
export type ProviderSkips = { intro?: ProviderSkipInterval, outro?: ProviderSkipInterval }

export type ProviderSkipEntry = {
    interval: { startTime: number, endTime: number }
    skipType: "op" | "ed"
    skipId: string
    episodeLength: number
}

function providerSkipEntry(interval: ProviderSkipInterval | undefined, skipType: "op" | "ed"): ProviderSkipEntry | null {
    if (!interval?.end) return null
    return normalizeAniSkipEntry({
        interval: { startTime: interval.start, endTime: interval.end },
        skipType,
        skipId: skipType === "op" ? "provider-intro" : "provider-outro",
        episodeLength: 0,
    })
}

/**
 * Merges AniSkip data with the stream provider's skip times, segment by segment: AniSkip's OP or
 * ED wins where it has one, and the provider's fills in whichever is missing.
 */
export function mergeSkipData<T extends AniSkipEntryLike>(
    aniSkip: NormalizedSkipData<T> | null | undefined,
    providerSkips: ProviderSkips | null | undefined,
): NormalizedSkipData<T | ProviderSkipEntry> {
    const op = normalizeAniSkipEntry(aniSkip?.op) ?? providerSkipEntry(providerSkips?.intro, "op")
    const ed = normalizeAniSkipEntry(aniSkip?.ed) ?? providerSkipEntry(providerSkips?.outro, "ed")
    return normalizeAniSkipData<T | ProviderSkipEntry>({ op, ed })
}
