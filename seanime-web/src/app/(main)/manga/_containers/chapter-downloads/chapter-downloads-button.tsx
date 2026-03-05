"use client"
import { __manga_chapterDownloadsDrawerIsOpenAtom } from "@/app/(main)/manga/_containers/chapter-downloads/chapter-downloads-drawer"
import { Button } from "@/components/ui/button"
import { useSetAtom } from "jotai/react"
import React from "react"
import { LuFolderDown } from "react-icons/lu"

type ChapterDownloadsButtonProps = {
    children?: React.ReactNode
}

export function ChapterDownloadsButton(props: ChapterDownloadsButtonProps) {

    const {
        children,
        ...rest
    } = props

    const openDownloadQueue = useSetAtom(__manga_chapterDownloadsDrawerIsOpenAtom)

    return (
        <>
            <Button
                onClick={() => openDownloadQueue(true)}
                intent="white-subtle"
                rounded
                size="sm"
                leftIcon={<LuFolderDown />}
            >
                Manga Downloads
            </Button>
        </>
    )
}
