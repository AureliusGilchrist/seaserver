import { AL_BaseManga } from "@/api/generated/types"
import { useCancelDiscordActivity, useSetDiscordMangaActivity } from "@/api/hooks/discord.hooks"
import { displayTitle } from "@/lib/helpers/media"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"

import { __manga_selectedChapterAtom } from "@/app/(main)/manga/_lib/handle-chapter-reader"
import { clientIdAtom } from "@/app/websocket-provider"
import { useAtomValue } from "jotai/react"
import React from "react"

export function useDiscordMangaPresence(entry: { media?: AL_BaseManga } | undefined) {
    const serverStatus = useServerStatus()
    const currentChapter = useAtomValue(__manga_selectedChapterAtom)
    // Empty string rather than undefined: the server reads a missing clientId as "" anyway
    // and treats it as the global presence, so this is the same request with a type that
    // matches what the endpoint actually accepts.
    const clientId = useAtomValue(clientIdAtom) ?? ""

    const { mutate } = useSetDiscordMangaActivity()
    const { mutate: cancelActivity } = useCancelDiscordActivity()

    const prevChapter = React.useRef<any>(undefined)

    React.useEffect(() => {
        if (serverStatus?.isOffline) return
        if (
            serverStatus?.settings?.discord?.enableRichPresence &&
            serverStatus?.settings?.discord?.enableMangaRichPresence
        ) {

            if (currentChapter && entry && entry.media) {
                mutate({
                    mediaId: entry.media?.id ?? 0,
                    title: displayTitle(entry.media?.title) || "Reading",
                    image: entry.media?.coverImage?.large || entry.media?.coverImage?.medium || "",
                    chapter: currentChapter.chapterNumber,
                })
            }

            if (!currentChapter) {
                cancelActivity({ clientId })
            }
        }

        prevChapter.current = currentChapter
    }, [currentChapter, entry])
}
