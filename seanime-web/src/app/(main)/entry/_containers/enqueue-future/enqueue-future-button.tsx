import { AL_AnimeDetailsById_Media, Anime_Entry } from "@/api/generated/types"
import { useEnqueueFuture, useGetEnqueueFutureStatus } from "@/api/hooks/enqueue_future.hooks"
import { AnimeMetaActionButton } from "@/app/(main)/entry/_components/meta-section"
import { Tooltip } from "@/components/ui/tooltip"
import { displayTitle } from "@/lib/helpers/media"
import React from "react"
import { LuLayers } from "react-icons/lu"
import { toast } from "sonner"

/**
 * Queues everything this anime leads to, so following a recommendation chain stops meaning a tab
 * and a torrent search per series.
 *
 * The walk itself happens on the server — this only says where to start. Leaving the page, closing
 * the tab, or opening another anime and pressing it again all leave the run going.
 */
export function EnqueueFutureButton({ entry, details }: {
    entry: Anime_Entry,
    details: AL_AnimeDetailsById_Media | undefined
}) {

    const { mutate: enqueue, isPending } = useEnqueueFuture()
    const { data: status } = useGetEnqueueFutureStatus()

    // Shown on the button so pressing it on an anime with nothing to walk to is not a mystery.
    const recommendationCount = React.useMemo(
        () => details?.recommendations?.edges?.filter(edge => !!edge?.node?.mediaRecommendation).length ?? 0,
        [details?.recommendations?.edges])

    const isRunning = !!status?.running
    const isThisRun = isRunning && status?.rootMediaId === entry.mediaId

    function handleEnqueue() {
        if (isRunning) {
            toast.info(
                status?.rootTitle ? `Already preparing from ${status.rootTitle}` : "Already preparing a queue",
                { description: "Wait for it to finish, or stop it from the Enqueue Future screen." },
            )
            return
        }

        enqueue({
            mediaId: entry.mediaId,
            title: displayTitle(entry.media?.title) || entry.media?.title?.romaji || "",
        }, {
            onSuccess: () => {
                toast.success("Enqueuing the future", {
                    description: "Preparing recommendations in the background. Open Enqueue Future whenever you like — you don't have to stay here.",
                })
            },
        })
    }

    const label = isThisRun
        ? `Enqueuing… ${status?.prepared ?? 0}/${status?.discovered ?? 0}`
        : "Enqueue Future"

    return (
        <div className="contents" data-enqueue-future-button-container>
            <Tooltip
                trigger={<AnimeMetaActionButton
                    intent="gray-subtle"
                    size="md"
                    leftIcon={<LuLayers />}
                    iconClass="text-2xl"
                    onClick={handleEnqueue}
                    loading={isPending}
                    disabled={recommendationCount === 0 && !isThisRun}
                    data-enqueue-future-button
                >
                    {label}
                </AnimeMetaActionButton>}
            >
                {recommendationCount === 0
                    ? "No recommendations to walk from this anime"
                    : "Queue up what this anime leads to — metadata and torrents prepared in the background, ready to download one after another"}
            </Tooltip>
        </div>
    )
}
