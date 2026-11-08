"use client"
import { isOnlinestreamDownloadActive, isOnlinestreamDownloadRunning, useGetOnlinestreamDownloads } from "@/api/hooks/onlinestream_download.hooks"
import { __anime_streamDownloadsModalIsOpenAtom } from "@/app/(main)/onlinestream/_containers/anime-downloads/anime-downloads-modal"
import { Button } from "@/components/ui/button"
import { useSetAtom } from "jotai/react"
import React from "react"
import { LuMonitorDown } from "react-icons/lu"

/** Opens the anime download queue. Shows how many episodes are waiting and pulses while one downloads. */
export function AnimeDownloadsButton() {
    const openQueue = useSetAtom(__anime_streamDownloadsModalIsOpenAtom)
    const { data } = useGetOnlinestreamDownloads()
    const active = data?.items?.filter(isOnlinestreamDownloadActive).length ?? 0
    const running = !!data?.items?.some(isOnlinestreamDownloadRunning)

    return (
        <Button
            onClick={() => openQueue(true)}
            intent="white-subtle"
            rounded
            size="sm"
            leftIcon={<LuMonitorDown className={running ? "animate-pulse text-[--green]" : undefined} />}
        >
            Anime Downloads{active > 0 ? ` (${active})` : ""}
        </Button>
    )
}
