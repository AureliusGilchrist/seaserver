"use client"
import { formatCount } from "@/lib/helpers/number"
import { useRequireAdmin } from "@/app/(main)/_hooks/use-require-admin"
import { TorrentClientAction_Variables } from "@/api/generated/endpoint.types"
import { TorrentClient_Torrent } from "@/api/generated/types"
import { useGetActiveTorrentList, useGetTorrentAddQueue, useTorrentClientAction } from "@/api/hooks/torrent_client.hooks"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { SortDirection } from "@/app/(main)/entry/_containers/torrent-search/_components/torrent-common-helpers"
import { Fact } from "@/app/(main)/settings/_containers/server-update-card"
import { TorrentCard } from "@/app/(main)/torrent-list/_components/torrent-card"
import { formatSpeed, parseSpeedToBytes } from "@/app/(main)/torrent-list/_lib/torrent-format"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { LuffyError } from "@/components/shared/luffy-error"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Popover } from "@/components/ui/popover"
import { TextInput } from "@/components/ui/text-input"
import React from "react"
import { BiLinkExternal } from "react-icons/bi"
import { LuListCheck } from "react-icons/lu"
import { TbSortAscending, TbSortDescending } from "react-icons/tb"

export const dynamic = "force-static"

// Downloads are admin-only (see main-sidebar).
export default function Page() {
    const allowed = useRequireAdmin()
    if (!allowed) return null
    return <AdminPage />
}

/**
 * Radix marks <body> with `pointer-events: none` while a modal layer (dialog, modal popover) is open,
 * and removes it when the layer closes. A layer that is unmounted mid-open or mid-close — which this
 * page invites, since the list is rewritten every 1.5s and a removed torrent takes its row with it —
 * can leave that mark behind, and then nearly nothing in the app can be clicked any more.
 * Clear it whenever no modal layer is actually open, and once more after leaving the page.
 */
function releaseStuckPointerLock() {
    if (typeof document === "undefined") return
    const body = document.body
    if (body.style.pointerEvents !== "none") return
    const openLayer = document.querySelector("[role=dialog][data-state=open], [role=alertdialog][data-state=open], [data-radix-popper-content-wrapper]")
    if (!openLayer) body.style.pointerEvents = ""
}

function AdminPage() {
    const serverStatus = useServerStatus()

    React.useEffect(() => {
        return () => {
            // Radix's own cleanup runs in the same commit; check after it has.
            window.setTimeout(releaseStuckPointerLock, 0)
            window.setTimeout(releaseStuckPointerLock, 400)
        }
    }, [])

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper
                data-torrent-list-page-container
                className="space-y-4 p-4 sm:p-8"
            >
                <div data-torrent-list-page-header className="flex items-center w-full justify-between">
                    <div data-torrent-list-page-header-title>
                        <h2>Active torrents</h2>
                        <p className="text-[--muted]">
                            See torrents currently being downloaded or seeded
                        </p>
                    </div>
                    <div data-torrent-list-page-header-actions>
                        {/*Show embedded client button only for qBittorrent*/}
                        {serverStatus?.settings?.torrent?.defaultTorrentClient === "qbittorrent" && <SeaLink href={`/qbittorrent`}>
                            <Button intent="white" rightIcon={<BiLinkExternal />}>Embedded client</Button>
                        </SeaLink>}
                    </div>
                </div>

                <div data-torrent-list-page-content className="pb-10">
                    <OfflineAddQueuePanel />
                    <Content />
                </div>
            </PageWrapper>
        </>
    )
}

const getSortIcon = (sortDirection: SortDirection) => {
    return sortDirection === "asc" ?
        <TbSortAscending className="text-[--muted] text-lg" /> :
        <TbSortDescending className="text-[--muted] text-lg" />
}

/**
 * What the server is holding for a client that is not there.
 *
 * A download pressed while the torrent client is offline is queued rather than failed, and imported
 * the moment the client answers again — so this panel says what is waiting instead of the download
 * looking lost. Nothing here is a dead end: the queue keeps trying for as long as it takes, and the
 * reason it is still waiting is the line under it.
 */
function OfflineAddQueuePanel() {
    const { data: queue } = useGetTorrentAddQueue()

    if (!queue || queue.total === 0) return null

    return (
        <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 px-4 py-3 mb-4 backdrop-blur-md">
            <LoadingSpinner className="h-4 w-4 flex-shrink-0 text-brand-300" />
            <p className="text-sm">
                <span className="font-medium text-gray-200">{formatCount(queue.waiting)}</span> torrent{queue.waiting === 1 ? "" : "s"} waiting for the client
                {queue.adding > 0 && <> · <span className="text-brand-300">importing {queue.adding} now</span></>}
            </p>
            {!!queue.oldest && (
                <span className="text-xs text-[--muted] truncate max-w-[24rem]" title={queue.oldest}>
                    next: {queue.oldest}
                </span>
            )}
            <div className="flex-1" />
            <p className="text-xs text-[--muted]">
                {queue.lastError || "They'll be added automatically when the client is back"}
            </p>
        </div>
    )
}

function Content() {
    const serverStatus = useServerStatus()
    const [enabled, setEnabled] = React.useState(true)
    const [categoryInput, setCategoryInput] = React.useState("")
    const [category, setCategory] = React.useState("")
    const [sort, setSort] = React.useState<string>("newest") // newest, oldest, name, name-desc

    const { data, isLoading, status, refetch } = useGetActiveTorrentList(enabled, category, sort)

    const { mutate, isPending } = useTorrentClientAction(() => {
        refetch()
    })

    React.useEffect(() => {
        if (status === "error") {
            setEnabled(false)
        }
    }, [status])

    const handleTorrentAction = React.useCallback((props: TorrentClientAction_Variables) => {
        mutate(props)
    }, [mutate])

    // One page-level dialog for removal: a dialog inside a row would be unmounted together with the
    // row as soon as the torrent is gone, while it is still closing.
    const [removeTarget, setRemoveTarget] = React.useState<TorrentClient_Torrent | null>(null)
    const confirmRemoveProps = useConfirmationDialog({
        title: "Remove torrent",
        description: `"${removeTarget?.name ?? ""}" and its downloaded files will be deleted from disk. This action cannot be undone.`,
        onConfirm: () => {
            if (!removeTarget) return
            handleTorrentAction({ hash: removeTarget.hash, action: "remove", dir: removeTarget.contentPath })
        },
    })
    const requestRemove = React.useCallback((torrent: TorrentClient_Torrent) => {
        setRemoveTarget(torrent)
        confirmRemoveProps.open()
    }, [confirmRemoveProps.open])

    // Safety net for a body pointer lock left behind by a layer that vanished (see releaseStuckPointerLock).
    React.useEffect(() => {
        if (!confirmRemoveProps.isOpen && !confirmStopAllSeedingProps.isOpen) {
            const t = window.setTimeout(releaseStuckPointerLock, 400)
            return () => window.clearTimeout(t)
        }
    })


    const { totalDownSpeed, totalUpSpeed } = React.useMemo(() => {
        let down = 0
        let up = 0
        for (const torrent of data ?? []) {
            down += torrent.downSpeedBytes ?? parseSpeedToBytes(torrent.downSpeed)
            up += torrent.upSpeedBytes ?? parseSpeedToBytes(torrent.upSpeed)
        }
        return { totalDownSpeed: formatSpeed(down), totalUpSpeed: formatSpeed(up) }
    }, [data])

    const downloading = data?.filter(t => t.status === "downloading" || t.status === "paused")?.length ?? 0
    const seeding = data?.filter(t => t.status === "seeding")?.length ?? 0

    const confirmStopAllSeedingProps = useConfirmationDialog({
        title: "Stop seeding all torrents",
        description: "This action will cause seeding to stop for all completed torrents.",
        actionIntent: "warning",
        onConfirm: () => {
            for (const torrent of data ?? []) {
                if (torrent.status !== "seeding") continue
                handleTorrentAction({
                    hash: torrent.hash,
                    action: "pause",
                    dir: torrent.contentPath,
                })
            }
        },
    })

    const dialogs = <>
        <ConfirmationDialog {...confirmStopAllSeedingProps} />
        <ConfirmationDialog {...confirmRemoveProps} />
    </>

    if (!enabled) return <>{dialogs}<LuffyError title="Failed to connect">
        <div className="flex flex-col gap-4 items-center">
            <p className="max-w-md">Failed to connect to the torrent client, verify your settings and make sure it is running.</p>
            <Button
                intent="primary-subtle" onClick={() => {
                setEnabled(true)
            }}
            >Retry</Button>
        </div>
    </LuffyError></>

    if (isLoading) return <>{dialogs}<LoadingSpinner /></>

    return (
        <AppLayoutStack className={""}>

            {/* What the whole client is doing right now, added up.
              *
              * The per-torrent rates are already on every row, but the number people actually want
              * from this screen is the total — whether the line is saturated, and whether anything
              * is moving at all. Adding twenty rows up by eye is not a thing anybody does. */}
            <section
                data-torrent-list-totals
                className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/25 to-black/40 p-4 shadow-xl shadow-black/20 backdrop-blur-md sm:p-5"
            >
                {downloading > 0 && <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand-500/15 blur-3xl" />}
                <div className="relative grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <Fact label="Down" value={totalDownSpeed} />
                    <Fact label="Up" value={totalUpSpeed} />
                    <Fact label="Downloading" value={String(downloading)} />
                    <Fact label="Seeding" value={String(seeding)} />
                </div>
            </section>

            <div>
                <ul className="text-[--muted] flex flex-wrap gap-4 items-center">
                    <li>{data?.length ?? 0} torrent{(data?.length ?? 0) === 1 ? "" : "s"}</li>
                    {seeding > 0 && <li>
                        <Button
                            size="xs"
                            intent="primary-link"
                            onClick={() => confirmStopAllSeedingProps.open()}
                        >Stop seeding</Button>
                    </li>}
                    <div className="flex flex-1"></div>
                    {serverStatus?.settings?.torrent?.defaultTorrentClient === "qbittorrent" && <Popover
                        modal={false}
                        trigger={<Button
                            size="xs"
                            intent="gray-basic"
                            leftIcon={<LuListCheck className="text-[--muted] text-lg" />}
                        >
                            Category{!!category ? `: ${category}` : ""}
                        </Button>}
                    >
                        <TextInput
                            placeholder="Filter by category"
                            value={categoryInput}
                            onChange={e => setCategoryInput(e.target.value)}
                        />
                        <Button
                            size="sm"
                            className="mt-2"
                            intent="gray-subtle"
                            onClick={() => {
                                setCategory(categoryInput)
                                setCategoryInput(categoryInput)
                            }}
                        >
                            Ok
                        </Button>
                    </Popover>}
                    <Button
                        size="xs"
                        intent="gray-basic"
                        leftIcon={<>
                            {getSortIcon(sort === "newest" || sort === "name" ? "desc" : "asc")}
                        </>}
                        onClick={() => {
                            setSort(prev => {
                                if (prev === "newest") return "oldest"
                                if (prev === "oldest") return "name"
                                if (prev === "name") return "name-desc"
                                if (prev === "name-desc") return "newest"
                                return "newest"
                            })
                        }}
                    >
                        {sort === "newest" ? "Newest" : sort === "oldest" ? "Oldest" : sort === "name" ? "Name (A-Z)" : "Name (Z-A)"}
                    </Button>
                </ul>
            </div>

            <div data-torrent-list className="space-y-3">
                {data?.filter(Boolean)?.map(torrent => {
                    return <TorrentCard
                        key={torrent.hash}
                        torrent={torrent}
                        onTorrentAction={handleTorrentAction}
                        onRequestRemove={requestRemove}
                        isPending={isPending}
                    />
                })}
                {(!isLoading && !data?.length) && <LuffyError title="Nothing to see"></LuffyError>}
            </div>

            {dialogs}
        </AppLayoutStack>
    )

}
