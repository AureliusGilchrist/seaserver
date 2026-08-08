import { Anime_Entry } from "@/api/generated/types"
import { useTorrentClientDownload } from "@/api/hooks/torrent_client.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { getDefaultDestination } from "@/app/(main)/entry/_containers/torrent-search/torrent-download-file-selection"
import { __torrentSearch_selectedTorrentsAtom } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-container"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Switch } from "@/components/ui/switch"
import { useAtomValue } from "jotai/react"
import React from "react"
import { LuDownload } from "react-icons/lu"

/**
 * Finishes one anime in the queue: the button that actually adds the selected torrents.
 *
 * The anime page reaches its download through a floating button that opens a destination sheet,
 * which lives in the search drawer this screen does not use. It would also be the wrong shape here —
 * the destination is already known, there is nothing to choose, and a sheet between every anime and
 * the next is precisely the friction the queue exists to remove. So this is the one decision worth
 * stopping for, asked once per anime: whether it should file itself into your library when it lands.
 */
export function EnqueueFutureAddTorrents({ entry, autoMatch, onAutoMatchChange, onAdded }: {
    entry: Anime_Entry
    autoMatch: boolean
    onAutoMatchChange: (value: boolean) => void
    onAdded: () => void
}) {

    const serverStatus = useServerStatus()
    const selectedTorrents = useAtomValue(__torrentSearch_selectedTorrentsAtom)

    const [isConfirmOpen, setConfirmOpen] = React.useState(false)

    // The same path the anime page would compute by hand — the existing library folder if there is
    // one, otherwise the library root plus the show's romaji title.
    const destination = React.useMemo(
        () => getDefaultDestination(entry, serverStatus?.settings?.library?.libraryPath),
        [entry, serverStatus?.settings?.library?.libraryPath])

    const { mutate: download, isPending } = useTorrentClientDownload(() => {
        setConfirmOpen(false)
        onAdded()
    }, entry.media?.id)

    if (!selectedTorrents.length) return null

    const count = selectedTorrents.length

    function handleConfirm() {
        download({
            torrents: selectedTorrents,
            destination,
            smartSelect: { enabled: false, missingEpisodeNumbers: [] },
            media: entry.media!,
            autoMatch,
        })
    }

    return (
        <>
            <div
                className="sticky bottom-4 z-[5] flex justify-center pt-2"
                data-enqueue-future-add-torrents
            >
                <Button
                    intent="white"
                    size="lg"
                    className="rounded-full halo font-bold shadow-lg"
                    leftIcon={<LuDownload />}
                    onClick={() => setConfirmOpen(true)}
                    loading={isPending}
                    data-enqueue-future-add-torrents-button
                >
                    Add torrent{count > 1 ? "s" : ""} ({count})
                </Button>
            </div>

            <Modal
                open={isConfirmOpen}
                onOpenChange={setConfirmOpen}
                contentClass="max-w-md"
                title="Match automatically when finished?"
                titleClass="text-center"
                data-enqueue-future-add-torrents-modal
            >
                <div className="space-y-4 py-2">
                    <p className="text-center text-sm text-[--muted]">
                        With this on, {entry.media?.title?.userPreferred || entry.media?.title?.romaji || "this show"} is
                        moved into your library as soon as the download completes, named and sorted as if you had
                        matched it by hand. With it off, it waits in the Unmatched screen for you to review first.
                    </p>

                    <Switch
                        label="Match automatically when finished"
                        value={autoMatch}
                        onValueChange={onAutoMatchChange}
                        data-enqueue-future-add-torrents-auto-match-switch
                    />

                    <div className="flex justify-center gap-2 pt-2">
                        <Button
                            intent="white"
                            onClick={handleConfirm}
                            loading={isPending}
                            data-enqueue-future-add-torrents-confirm-button
                        >
                            Yes, add torrent{count > 1 ? "s" : ""}
                        </Button>
                        <Button
                            intent="gray-outline"
                            onClick={() => setConfirmOpen(false)}
                            disabled={isPending}
                            data-enqueue-future-add-torrents-cancel-button
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    )
}
