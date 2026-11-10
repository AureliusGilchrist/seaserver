"use client"

import { Anime_Entry } from "@/api/generated/types"
import { useGetOnlineStreamEpisodeList } from "@/api/hooks/onlinestream.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { AnimeMetaActionButton } from "@/app/(main)/entry/_components/meta-section"
import { OnlinestreamDownloadButton } from "@/app/(main)/onlinestream/_components/onlinestream-download"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import React from "react"
import { LuCloudDownload, LuSparkles } from "react-icons/lu"

/** Sources offered, in the order "Best available" tries them. */
const SOURCES = [
    { id: "auto", label: "Best available" },
    { id: "kickassanime", label: "Kickassanime" },
    { id: "megaplay", label: "MegaPlay" },
    { id: "reanime", label: "ReAnime" },
    { id: "anizone", label: "AniZone" },
    { id: "animeheaven", label: "AnimeHeaven" },
    { id: "animegg", label: "AnimeGG" },
    { id: "animeonsen", label: "AnimeOnsen" },
    { id: "animepahe", label: "AnimePahe" },
] as const

/**
 * Direct Download: the series from an online source instead of a torrent, next to the torrent
 * Download button. It is the online player's Download window, with a source picker on top: the
 * best available source queues the full series; a chosen source also lists its episodes.
 */
export function DirectDownloadButton({ entry }: { entry: Anime_Entry }) {
    const serverStatus = useServerStatus()
    const isAdmin = !!serverStatus && (!serverStatus.profilesEnabled || !serverStatus.profiles?.length || !!serverStatus.currentProfile?.isAdmin)
    const enabled = !!serverStatus?.settings?.library?.enableOnlinestream
    const mediaId = entry.mediaId

    const [source, setSource] = React.useState<string>("auto")
    // The episode list of a chosen source (the "Best available" one is only known once queued).
    const listed = source !== "auto"
    const { data: episodeList, isLoading, isError } = useGetOnlineStreamEpisodeList(listed ? mediaId : null, listed ? source : null, false)

    if (!isAdmin || !enabled || !mediaId) return null

    const picker = (
        <div className="space-y-2">
            <p className="text-sm font-medium">Source</p>
            <div className="flex flex-wrap gap-1.5">
                {SOURCES.map(s => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => setSource(s.id)}
                        className={cn(
                            "h-8 px-3 rounded-full border text-sm transition-colors inline-flex items-center gap-1.5",
                            source === s.id ? "bg-[--brand] text-white border-transparent" : "hover:bg-[--subtle]",
                        )}
                    >
                        {s.id === "auto" && <LuSparkles />}
                        {s.label}
                    </button>
                ))}
            </div>
            {listed && isLoading && <p className="text-xs text-[--muted] flex items-center gap-2">
                <LoadingSpinner className="size-3" containerClass="w-auto h-auto" /> Loading {SOURCES.find(s => s.id === source)?.label}'s episodes…
            </p>}
            {listed && !isLoading && (isError || !episodeList?.episodes?.length) && <p className="text-xs text-[--orange]">
                {SOURCES.find(s => s.id === source)?.label} didn't list episodes for this anime. Try another source, or Best available.
            </p>}
        </div>
    )

    return (
        <OnlinestreamDownloadButton
            mediaId={mediaId}
            provider={source}
            dubbed={false}
            server={undefined}
            quality={undefined}
            currentEpisodeNumber={null}
            episodes={listed ? episodeList?.episodes ?? undefined : undefined}
            videoSource={undefined}
            title="Direct Download"
            header={picker}
            trigger={<div className="contents" data-direct-download-button-container>
                <AnimeMetaActionButton
                    intent="gray-subtle"
                    size="md"
                    leftIcon={<LuCloudDownload />}
                    iconClass="text-2xl"
                    data-direct-download-button
                >
                    Direct Download
                </AnimeMetaActionButton>
            </div>}
        />
    )
}
