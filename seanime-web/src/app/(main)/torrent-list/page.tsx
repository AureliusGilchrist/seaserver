"use client"
import { TorrentClientAction_Variables } from "@/api/generated/endpoint.types"
import { TorrentClient_Torrent } from "@/api/generated/types"
import { useGetActiveTorrentList, useTorrentClientAction } from "@/api/hooks/torrent_client.hooks"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { SortDirection } from "@/app/(main)/entry/_containers/torrent-search/_components/torrent-common-helpers"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { LuffyError } from "@/components/shared/luffy-error"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Button, IconButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Popover } from "@/components/ui/popover"
import { TextInput } from "@/components/ui/text-input"
import { Tooltip } from "@/components/ui/tooltip"
import { upath } from "@/lib/helpers/upath"
import capitalize from "lodash/capitalize"
import React from "react"
import { BiDownArrow, BiLinkExternal, BiPause, BiPlay, BiStop, BiTime, BiTrash, BiUpArrow } from "react-icons/bi"
import { LuListCheck } from "react-icons/lu"
import { TbSortAscending, TbSortDescending } from "react-icons/tb"

export const dynamic = "force-static"

export default function Page() {
    const serverStatus = useServerStatus()

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
                    <Content />
                </div>
            </PageWrapper>
        </>
    )
}

/**
 * Turns a torrent client's formatted rate back into bytes per second.
 *
 * Handles the shapes clients actually emit — "1.2 MiB/s", "500 KB/s", "0 B/s", "1.5 Mbps", a bare
 * number — and returns 0 for anything it cannot read, since a total that silently drops one torrent
 * is better than a total that reads NaN.
 */
function parseSpeedToBytes(speed: string | undefined | null): number {
    if (!speed) return 0

    const match = String(speed).trim().match(/^([\d.,]+)\s*([kmgt]?i?)([b])(ps|\/s)?$/i)
    if (!match) return 0

    const value = parseFloat(match[1].replace(/,/g, ""))
    if (!isFinite(value)) return 0

    const multipliers: Record<string, number> = { "": 1, k: 1024, ki: 1024, m: 1024 ** 2, mi: 1024 ** 2, g: 1024 ** 3, gi: 1024 ** 3, t: 1024 ** 4, ti: 1024 ** 4 }
    const unit = (match[2] || "").toLowerCase()
    const bytes = value * (multipliers[unit] ?? 1)

    // "Mbps" is bits, not bytes — eight of them to the byte.
    const isBits = match[3] === "b" && (match[4] || "").toLowerCase() === "ps"
    return isBits ? bytes / 8 : bytes
}

/** Formats bytes per second the way the rows do, so the total reads like the parts. */
function formatSpeed(bytesPerSecond: number): string {
    if (!isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s"

    const units = ["B/s", "KB/s", "MB/s", "GB/s"]
    let value = bytesPerSecond
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

const getSortIcon = (sortDirection: SortDirection) => {
    return sortDirection === "asc" ?
        <TbSortAscending className="text-[--muted] text-lg" /> :
        <TbSortDescending className="text-[--muted] text-lg" />
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


    // The client reports each torrent's rate as a formatted string ("1.2 MiB/s"), so summing them
    // means parsing them back to bytes and formatting the total once. Anything unparseable counts as
    // zero rather than breaking the line.
    const { totalDownSpeed, totalUpSpeed } = React.useMemo(() => {
        let down = 0
        let up = 0
        for (const torrent of data ?? []) {
            down += parseSpeedToBytes(torrent.downSpeed)
            up += parseSpeedToBytes(torrent.upSpeed)
        }
        return { totalDownSpeed: formatSpeed(down), totalUpSpeed: formatSpeed(up) }
    }, [data])

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

    if (!enabled) return <LuffyError title="Failed to connect">
        <div className="flex flex-col gap-4 items-center">
            <p className="max-w-md">Failed to connect to the torrent client, verify your settings and make sure it is running.</p>
            <Button
                intent="primary-subtle" onClick={() => {
                setEnabled(true)
            }}
            >Retry</Button>
        </div>
    </LuffyError>

    if (isLoading) return <LoadingSpinner />

    return (
        <AppLayoutStack className={""}>

            {/* What the whole client is doing right now, added up.
              *
              * The per-torrent rates are already on every row, but the number people actually want
              * from this screen is the total — whether the line is saturated, and whether anything
              * is moving at all. Adding twenty rows up by eye is not a thing anybody does. */}
            <div
                data-torrent-list-totals
                className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[--radius-md] border border-gray-800 bg-gray-950/40 px-4 py-3"
            >
                <div className="flex items-center gap-2">
                    <BiDownArrow className="text-green-400" />
                    <span className="text-lg font-semibold tabular-nums">{totalDownSpeed}</span>
                    <span className="text-xs text-[--muted]">down</span>
                </div>
                <div className="flex items-center gap-2">
                    <BiUpArrow className="text-blue-400" />
                    <span className="text-lg font-semibold tabular-nums">{totalUpSpeed}</span>
                    <span className="text-xs text-[--muted]">up</span>
                </div>
                <span className="text-xs text-[--muted]">
                    {data?.length ?? 0} torrent{(data?.length ?? 0) === 1 ? "" : "s"}
                </span>
            </div>

            <div>
                <ul className="text-[--muted] flex flex-wrap gap-4 items-center">
                    <li>Downloading: {data?.filter(t => t.status === "downloading" || t.status === "paused")?.length ?? 0}</li>
                    <li>Seeding: {data?.filter(t => t.status === "seeding")?.length ?? 0}</li>
                    {!!data?.filter(t => t.status === "seeding")?.length && <li>
                        <Button
                            size="xs"
                            intent="primary-link"
                            onClick={() => confirmStopAllSeedingProps.open()}
                        >Stop seeding</Button>
                    </li>}
                    <div className="flex flex-1"></div>
                    {serverStatus?.settings?.torrent?.defaultTorrentClient === "qbittorrent" && <Popover
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

            <Card className="p-0 overflow-hidden">
                {data?.filter(Boolean)?.map(torrent => {
                    return <TorrentItem
                        key={torrent.hash}
                        torrent={torrent}
                        onTorrentAction={handleTorrentAction}
                        isPending={isPending}
                    />
                })}
                {(!isLoading && !data?.length) && <LuffyError title="Nothing to see"></LuffyError>}
            </Card>

            <ConfirmationDialog {...confirmStopAllSeedingProps} />
        </AppLayoutStack>
    )

}


type TorrentItemProps = {
    torrent: TorrentClient_Torrent
    onTorrentAction: (props: TorrentClientAction_Variables) => void
    isPending?: boolean
}

const TorrentItem = React.memo(function TorrentItem({ torrent, onTorrentAction, isPending }: TorrentItemProps) {

    const progress = `${(torrent.progress * 100).toFixed(1)}%`

    const confirmDeleteTorrentProps = useConfirmationDialog({
        title: "Remove torrent",
        description: "This action cannot be undone.",
        onConfirm: () => {
            onTorrentAction({
                hash: torrent.hash,
                action: "remove",
                dir: torrent.contentPath,
            })
        },
    })

    return (
        <div
            data-torrent-item-container className={cn(
            "hover:bg-gray-900 hover:bg-opacity-70 px-4 py-3 relative flex gap-4 group/torrent-item",
            torrent.status === "paused" && "bg-gray-900 hover:bg-gray-900",
            torrent.status === "downloading" && "bg-green-900 bg-opacity-20 hover:hover:bg-opacity-30 hover:bg-green-900",
        )}
        >
            <div data-torrent-item-title-container className="w-full">
                <div
                    className={cn(
                        "text-sm tracking-wide line-clamp-1 cursor-pointer hover:underline underline-offset-2 break-all",
                        "group-hover/torrent-item:text-white",
                        { "opacity-50": torrent.status === "paused" })}
                    onClick={() => {
                        onTorrentAction({
                            hash: torrent.hash,
                            action: "open",
                            dir: !upath.extname(torrent.contentPath) ? torrent.contentPath : upath.dirname(torrent.contentPath),
                        })
                    }}
                >{torrent.name}</div>
                <div data-torrent-item-info className="text-[--muted]">
                    <span className={cn({ "text-green-300": torrent.status === "downloading" })}>{progress}</span>
                    {` `}
                    <BiDownArrow className="inline-block mx-2" />
                    {torrent.downSpeed}
                    {` `}
                    <BiUpArrow className="inline-block mx-2" />
                    {torrent.upSpeed}
                    {torrent.status !== "seeding" && <>
                        {` `}
                        <BiTime className="inline-block mx-2 mb-0.5" />
                        {torrent.eta}
                    </>}
                    {` - `}
                    <span>{torrent.seeds} {torrent.seeds !== 1 ? "seeds" : "seed"}</span>
                    {/*{` - `}*/}
                    {/*<span>{torrent.peers} {torrent.peers !== 1 ? "peers" : "peer"}</span>*/}
                    {` - `}
                    <strong
                        className={cn({
                            "text-blue-300": torrent.status === "seeding",
                        }, "text-sm")}
                    >{capitalize(torrent.status)}</strong>
                </div>
                {torrent.status !== "seeding" &&
                    <div data-torrent-item-progress-bar className="w-full h-1 mr-4 mt-2 relative z-[1] bg-gray-700 left-0 overflow-hidden rounded-xl">
                        <div
                            className={cn(
                                "h-full absolute z-[2] left-0 bg-gray-200 transition-all",
                                {
                                    "bg-green-300": torrent.status === "downloading",
                                    "bg-gray-500": torrent.status === "paused",
                                },
                            )}
                            style={{ width: `${String(Math.floor(torrent.progress * 100))}%` }}
                        ></div>
                    </div>}
            </div>
            <div data-torrent-item-actions className="flex-none flex gap-2 items-center">
                {torrent.status !== "seeding" ? (
                    <>
                        {torrent.status !== "paused" && <Tooltip
                            trigger={<IconButton
                                icon={<BiPause />}
                                size="sm"
                                intent="gray-subtle"
                                className="flex-none"
                                onClick={async () => {
                                    onTorrentAction({
                                        hash: torrent.hash,
                                        action: "pause",
                                        dir: torrent.contentPath,
                                    })
                                }}
                                disabled={isPending}
                            />}
                        >Pause</Tooltip>}
                        {torrent.status !== "downloading" && <Tooltip
                            trigger={<IconButton
                                icon={<BiPlay />}
                                size="sm"
                                intent="white"
                                className="flex-none"
                                onClick={async () => {
                                    onTorrentAction({
                                        hash: torrent.hash,
                                        action: "resume",
                                        dir: torrent.contentPath,
                                    })
                                }}
                                disabled={isPending}
                            />}
                        >
                            Resume
                        </Tooltip>}
                    </>
                ) : <Tooltip
                    trigger={<IconButton
                        icon={<BiStop />}
                        size="sm"
                        intent="gray-subtle"
                        className="flex-none"
                        onClick={async () => {
                            onTorrentAction({
                                hash: torrent.hash,
                                action: "pause",
                                dir: torrent.contentPath,
                            })
                        }}
                        disabled={isPending}
                    />}
                >End</Tooltip>}

                <div data-torrent-item-actions-buttons className="flex-none flex gap-2 items-center">
                    {/*<IconButton*/}
                    {/*    icon={<BiFolder />}*/}
                    {/*    size="sm"*/}
                    {/*    intent="gray-subtle"*/}
                    {/*    className="flex-none"*/}
                    {/*    onClick={async () => {*/}
                    {/*        onTorrentAction({*/}
                    {/*            hash: torrent.hash,*/}
                    {/*            action: "open",*/}
                    {/*            dir: upath.dirname(torrent.contentPath),*/}
                    {/*        })*/}
                    {/*    }}*/}
                    {/*    disabled={isPending}*/}
                    {/*/>*/}
                    <IconButton
                        icon={<BiTrash />}
                        size="sm"
                        intent="alert-subtle"
                        className="flex-none"
                        onClick={async () => {
                            confirmDeleteTorrentProps.open()
                        }}
                        disabled={isPending}
                    />
                </div>
            </div>
            <ConfirmationDialog {...confirmDeleteTorrentProps} />
        </div>
    )
})
