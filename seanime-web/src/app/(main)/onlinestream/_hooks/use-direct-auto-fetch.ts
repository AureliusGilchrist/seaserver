"use client"

import { useCreateAutoDownloaderRule, useGetAutoDownloaderRulesByAnime } from "@/api/hooks/auto_downloader.hooks"
import React from "react"
import { toast } from "sonner"

/**
 * The auto fetch of the new episodes of a series that is still airing: the rule that makes the
 * server download the new episodes from an online streaming provider as they come out.
 *
 * The rule itself is the opt-in: the direct rules always run, with no torrent provider and no
 * global switch.
 */
export function useDirectAutoFetch(opts: {
    /** The AniList id of the series. */
    mediaId: number | undefined
    /** The provider the new episodes are downloaded from. */
    provider: string
    /** Whether the dubbed episodes are downloaded. */
    dubbed?: boolean
    /** The title of the series, shown in the rule list. */
    title?: string
    /** Whether the series is still airing: a series that is over has no new episodes. */
    isOngoing?: boolean
}) {
    const { mediaId, provider, dubbed, title, isOngoing } = opts

    const { data: existingRules } = useGetAutoDownloaderRulesByAnime(mediaId ?? 0, !!mediaId && !!isOngoing)
    const { mutate: createRule, isPending } = useCreateAutoDownloaderRule("The new episodes of this series will be fetched automatically")

    // The rule that already fetches the new episodes of this series, if there is one.
    const hasRule = React.useMemo(
        () => (existingRules ?? []).some(r => r.downloadMethod === "direct" && r.enabled),
        [existingRules],
    )

    const start = React.useCallback(() => {
        if (!mediaId) return
        if (hasRule) {
            toast.success("The new episodes of this series are already fetched automatically")
            return
        }
        createRule({
            rule: {
                dbId: 0,
                enabled: true,
                mediaId,
                destination: "",
                downloadMethod: "direct",
                directProvider: provider || "auto",
                directDubbed: !!dubbed,
                episodeType: "recent",
                comparisonTitle: title ?? "",
                titleComparisonType: "likely",
                releaseGroups: [],
                resolutions: [],
                episodeNumbers: [],
                additionalTerms: [],
                excludeTerms: [],
                minSeeders: 0,
                minSize: "",
                maxSize: "",
                customEpisodeNumberAbsoluteOffset: 0,
                providers: [],
            },
        })
    }, [createRule, dubbed, hasRule, mediaId, provider, title])

    return { start, hasRule, isPending }
}
