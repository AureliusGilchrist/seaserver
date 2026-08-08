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

    // A run parked on the backoff ladder is still "running" and still reports 0/0, so a label that
    // only ever counts makes waiting out a rate limit look identical to a hang. Say which it is.
    const isRateLimited = isThisRun && !!status?.rateLimited
    const retryInSeconds = React.useMemo(() => {
        if (!isRateLimited || !status?.retryAt) return 0
        return Math.max(0, Math.round((new Date(status.retryAt).getTime() - Date.now()) / 1000))
    }, [isRateLimited, status?.retryAt])

    const label = isRateLimited
        ? (retryInSeconds > 0 ? `Rate limited — retrying in ${retryInSeconds}s` : "Rate limited — retrying…")
        : isThisRun
            ? `Enqueuing… ${status?.prepared ?? 0}/${status?.discovered ?? 0}`
            : "Enqueue Future"

    // Everything the run knows about itself, so a stalled one can be understood from here rather
    // than by opening the Enqueue Future screen to find out whether anything is happening.
    const tooltip = React.useMemo(() => {
        if (isRateLimited) {
            const attempt = status?.backoffAttempt ?? 0
            const attempts = status?.backoffAttempts ?? 0
            return `AniList is rate limiting this run${attempts > 0 ? ` (attempt ${attempt} of ${attempts})` : ""}. It keeps going by itself once the limit clears — nothing is stuck. Stop it from the Enqueue Future screen if you'd rather not wait.`
        }
        if (isThisRun) {
            return status?.currentTitle
                ? `Preparing ${status.currentTitle} — ${status?.prepared ?? 0} of ${status?.discovered ?? 0} done. You can leave this page.`
                : `${status?.prepared ?? 0} of ${status?.discovered ?? 0} prepared. You can leave this page.`
        }
        if (isRunning) {
            return status?.rootTitle
                ? `Already preparing a queue from ${status.rootTitle}. Wait for it, or stop it from the Enqueue Future screen.`
                : "Already preparing a queue. Wait for it, or stop it from the Enqueue Future screen."
        }
        if (recommendationCount === 0) {
            return "AniList lists no recommendations for this anime — a run from here will only find its own sequels, prequels and side stories, if it has any"
        }
        return "Queue up what this anime leads to — metadata and torrents prepared in the background, ready to download one after another"
    }, [isRateLimited, isThisRun, isRunning, status?.currentTitle, status?.prepared, status?.discovered,
        status?.rootTitle, status?.backoffAttempt, status?.backoffAttempts, recommendationCount])

    return (
        <div className="contents" data-enqueue-future-button-container>
            <Tooltip
                trigger={<AnimeMetaActionButton
                    intent="gray-subtle"
                    size="md"
                    leftIcon={<LuLayers />}
                    iconClass="text-2xl"
                    onClick={handleEnqueue}
                    // Only the request itself spins. A run in progress is reported by the label —
                    // spinning for the whole run made a background job look like a stuck button.
                    loading={isPending}
                    // Never disabled. Any anime can be the root of a run, whatever its status and
                    // whatever AniList has to say about it: the root is only ever walked, never queued,
                    // so none of the filters that decide what belongs in the queue apply to it.
                    // Recommendations are also not the only thing a run walks — a show with none at all
                    // can still have a whole franchise of relations worth queueing — so refusing to
                    // start on an empty recommendation list turned "nothing recommended" into "you may
                    // not begin here". If a root really does lead nowhere, the run says so.
                    data-enqueue-future-button
                    data-enqueue-future-rate-limited={isRateLimited || undefined}
                >
                    {label}
                </AnimeMetaActionButton>}
            >
                {tooltip}
            </Tooltip>
        </div>
    )
}
