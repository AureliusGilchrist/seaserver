import { Anime_Entry, HibikeTorrent_AnimeTorrent } from "@/api/generated/types"
import { useTorrentClientDownload, useTorrentClientGetFiles } from "@/api/hooks/torrent_client.hooks"
import { useLibraryPathSelection } from "@/app/(main)/_hooks/use-library-path-selection"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { __torrentSearch_selectedTorrentsAtom } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-container"
import { __torrentSearch_selectionAtom } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-drawer"
import {
    __torrentDownload_autoMatchAtom,
    AutoMatchConfirmationModal,
} from "@/app/(main)/entry/_containers/torrent-search/torrent-download-auto-match"
import { DirectorySelector } from "@/components/shared/directory-selector"
import { FileTreeMultiSelector } from "@/components/shared/file-tree-selector"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Vaul, VaulContent } from "@/components/vaul"
import { logger } from "@/lib/helpers/debug"
import { upath } from "@/lib/helpers/upath"
import { atom } from "jotai"
import { useAtom, useAtomValue, useSetAtom } from "jotai/react"
import React from "react"
import { BiDownload } from "react-icons/bi"
import { FcFolder } from "react-icons/fc"

const log = logger("TORRENT DOWNLOAD FILE SELECTION")

export type TorrentDownloadFileSelection = {
    torrent: HibikeTorrent_AnimeTorrent
    destination: string
}

export const __torrentDownload_fileSelectionAtom = atom<TorrentDownloadFileSelection | undefined>(undefined)

export function getDefaultDestination(entry: Anime_Entry, libraryPath?: string): string {
    const fPath = entry.localFiles?.findLast(n => n)?.path // file path
    const newPath = libraryPath ? upath.join(libraryPath, sanitizeDirectoryName(entry.media?.title?.romaji || "")) : ""
    return fPath ? upath.normalize(upath.dirname(fPath)) : newPath
}

export function sanitizeDirectoryName(input: string): string {
    return input.replaceAll("/", "-")
}

/**
 * How much is actually inside a torrent, counted off its file list.
 *
 * Folders are counted at every level and deduplicated, so a season pack laid out as
 * `Show/Season 1/ep.mkv` counts two folders rather than one per file. The torrent's own top-level
 * folder is one of them — that is what it contains, and hiding it would make a tidy single-folder
 * release read as having none at all.
 */
export function countFilesAndFolders(paths: string[] | null | undefined): { files: number, folders: number } {
    if (!paths?.length) return { files: 0, folders: 0 }
    const folders = new Set<string>()
    for (const path of paths) {
        const parts = path.split("/").filter(Boolean)
        // Every part but the last is a directory on the way to the file.
        for (let i = 1; i < parts.length; i++) {
            folders.add(parts.slice(0, i).join("/"))
        }
    }
    return { files: paths.length, folders: folders.size }
}

export function TorrentDownloadFileSelection({ entry }: { entry: Anime_Entry }) {
    const serverStatus = useServerStatus()
    const libraryPath = serverStatus?.settings?.library?.libraryPath

    const setTorrentDrawerIsOpen = useSetAtom(__torrentSearch_selectionAtom)

    const [fileSelection, setFileSelection] = useAtom(__torrentDownload_fileSelectionAtom)
    const selectedTorrents = useAtomValue(__torrentSearch_selectedTorrentsAtom)

    const [selectedFileIndices, setSelectedFileIndices] = React.useState<number[]>([])
    const autoMatch = useAtomValue(__torrentDownload_autoMatchAtom)
    const [confirmingAutoMatch, setConfirmingAutoMatch] = React.useState(false)

    const animeFolderName = React.useMemo(() => {
        return sanitizeDirectoryName(entry.media?.title?.romaji || "")
    }, [entry.media?.title?.romaji])

    const selectedTorrent = fileSelection?.torrent
    const destination = fileSelection?.destination ?? getDefaultDestination(entry, libraryPath)

    const handleDestinationChange = React.useCallback((newDestination: string) => {
        if (fileSelection) {
            setFileSelection({
                ...fileSelection,
                destination: newDestination,
            })
        }
    }, [fileSelection, setFileSelection])

    const libraryPathSelectionProps = useLibraryPathSelection({
        destination,
        setDestination: handleDestinationChange,
        animeFolderName,
    })

    const handleLibraryPathSelect = React.useCallback((selectedLibraryPath: string) => {
        if (fileSelection) {
            libraryPathSelectionProps.handleLibraryPathSelect(selectedLibraryPath)
        }
    }, [fileSelection, libraryPathSelectionProps.handleLibraryPathSelect])

    const { data: filepaths, isLoading } = useTorrentClientGetFiles({ torrent: selectedTorrent, provider: selectedTorrent?.provider })

    // download via torrent client
    // Closes the file picker and the torrent search drawer and leaves the user where they were —
    // no navigation, no reload.
    const { mutate, isPending } = useTorrentClientDownload(() => {
        setFileSelection(undefined)
        setTorrentDrawerIsOpen(undefined)
    }, entry.mediaId)

    // Convert file paths to file previews format
    const filePreviews = React.useMemo(() => {
        if (!filepaths) return []
        return filepaths.map((path, index) => ({
            index,
            path,
            displayTitle: path.split("/").pop() || path,
            displayPath: path,
            isLikely: false,
        }))
    }, [filepaths])

    // Select all files by default when file previews are loaded
    // React.useEffect(() => {
    //     if (filePreviews.length > 0 && selectedFileIndices.length === 0) {
    //         const allIndices = filePreviews.map(file => file.index)
    //         setSelectedFileIndices(allIndices)
    //     }
    // }, [filePreviews, selectedFileIndices.length])

    const deselectedIndices = React.useMemo(() => {
        if (!filepaths) return []
        return filepaths.map((_, index) => index).filter(index => !selectedFileIndices.includes(index))
    }, [filepaths, selectedFileIndices])

    const getFileValue = React.useCallback((filePreview: any) => {
        return filePreview.index
    }, [])

    const contents = React.useMemo(() => countFilesAndFolders(filepaths), [filepaths])

    const scrollRef = React.useRef<HTMLDivElement>(null)

    const launchDownload = () => {
        if (!selectedTorrent || selectedFileIndices.length === 0) return

        mutate({
            torrents: [selectedTorrent],
            destination,
            smartSelect: {
                enabled: false,
                missingEpisodeNumbers: [],
            },
            deselect: {
                enabled: true,
                indices: deselectedIndices,
            },
            media: entry.media,
            autoMatch,
        })
    }

    const handleDownload = () => {
        if (!selectedTorrent || selectedFileIndices.length === 0) return
        // Same explicit confirmation as the main download sheet — this path honours the toggle too.
        if (autoMatch) {
            setConfirmingAutoMatch(true)
            return
        }
        launchDownload()
    }

    return (
        <>
        <AutoMatchConfirmationModal
            open={confirmingAutoMatch}
            onOpenChange={open => !open && setConfirmingAutoMatch(false)}
            animeTitle={entry.media?.title?.userPreferred || entry.media?.title?.romaji || entry.media?.title?.english || undefined}
            onConfirm={() => {
                setConfirmingAutoMatch(false)
                launchDownload()
            }}
        />
        <Vaul
            open={!!selectedTorrent}
            onOpenChange={open => {
                if (!open) {
                    setFileSelection(undefined)
                    setSelectedFileIndices([])
                }
            }}
        >
            <VaulContent className="max-w-5xl mx-auto">
                <AppLayoutStack className="mt-4 p-3 lg:p-6">
                    <h4 className="text-center mb-1">
                        Select files to download
                    </h4>

                    {/* What the torrent actually holds, before anything is picked. The file list is
                        already loaded to draw the tree below, so this costs nothing — and it is the
                        first thing worth knowing about a batch. */}
                    <p className="text-center text-sm text-[--muted] mb-4">
                        {isLoading
                            ? "Reading the torrent's contents…"
                            : contents.files === 0
                                ? "No files could be read from this torrent"
                                : `${contents.files} ${contents.files === 1 ? "file" : "files"}`
                                + ` in ${contents.folders} ${contents.folders === 1 ? "folder" : "folders"}`}
                    </p>

                    <DirectorySelector
                        name="destination"
                        label="Destination"
                        leftIcon={<FcFolder />}
                        value={destination}
                        defaultValue={destination}
                        onSelect={handleDestinationChange}
                        shouldExist={false}
                        libraryPathSelectionProps={{ ...libraryPathSelectionProps, handleLibraryPathSelect }}
                    />

                    {isLoading ? <LoadingSpinner /> : (
                        <AppLayoutStack className="pb-0">

                            <ScrollArea
                                viewportRef={scrollRef}
                                className="h-[60dvh] lg:h-[50dvh] overflow-y-auto p-4 border rounded-[--radius-md]"
                            >
                                <FileTreeMultiSelector
                                    filePreviews={filePreviews}
                                    selectedIndices={selectedFileIndices}
                                    onSelectionChange={setSelectedFileIndices}
                                    getFileValue={getFileValue}
                                />
                            </ScrollArea>

                            <div className="text-sm text-[--muted] mb-2">
                                {selectedFileIndices.length} of {filePreviews.length} files selected
                            </div>

                            <Button
                                intent="white"
                                className="w-full"
                                rightIcon={<BiDownload className="text-xl" />}
                                disabled={selectedFileIndices.length === 0 || isLoading || isPending}
                                loading={isPending}
                                onClick={handleDownload}
                            >
                                Download selected files
                            </Button>

                        </AppLayoutStack>
                    )}
                </AppLayoutStack>
            </VaulContent>
        </Vaul>
        </>
    )

}
