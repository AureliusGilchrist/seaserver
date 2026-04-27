"use client"

import { UnmatchedTorrent, useDeleteUnmatchedTorrent } from "@/api/hooks/unmatched.hooks"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { IconButton } from "@/components/ui/button"
import React from "react"
import { BiFolder, BiFile, BiTrash } from "react-icons/bi"
import { LuHardDrive } from "react-icons/lu"

interface UnmatchedTorrentCardProps {
    torrent: UnmatchedTorrent
    onSelect: () => void
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

// Truncate each path segment to max 15 chars in natural order (root -> leaf).
// If treatAsPath is false, do not split on '/' (so titles with '/' stay intact).
function truncatePathSegments(path: string, maxCharsPerSegment: number = 15, treatAsPath: boolean = true): string {
    if (!path) return ""
    const segments = treatAsPath ? path.split("/").filter(Boolean) : [path]
    const truncated = segments.map(segment => {
        if (segment.length <= maxCharsPerSegment) return segment
        return segment.slice(0, maxCharsPerSegment - 1) + "…"
    })
    return truncated.join(" / ")
}

export function UnmatchedTorrentCard({ torrent, onSelect }: UnmatchedTorrentCardProps) {
    const hasSeasons = torrent.seasons && torrent.seasons.length > 0
    // Use name, or fall back to the folder name from path
    const displayName = torrent.name || torrent.path?.split("/").pop() || "Unknown torrent"
    
    // Get truncated directory path for display; prefer path (real folders) otherwise keep name intact (even with '/')
    const truncatedPath = torrent.path
        ? truncatePathSegments(torrent.path, 15, true)
        : truncatePathSegments(displayName, 15, false)
    
    // Check if we have anime metadata
    const hasAnimeInfo = torrent.animeId && (torrent.animeTitleRomaji || torrent.animeTitleNative)

    const { mutate: deleteTorrent, isPending: isDeleting } = useDeleteUnmatchedTorrent()
    const deleteConfirmation = useConfirmationDialog({
        title: "Delete torrent",
        description: `Are you sure you want to delete "${displayName}"? This will permanently remove all files.`,
        onConfirm: () => {
            deleteTorrent({ name: torrent.name })
        },
    })

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        deleteConfirmation.open()
    }

    return (
        <>
            <div
                className={cn(
                    "p-4 border rounded-lg cursor-pointer transition-all",
                    "hover:border-brand-200 hover:bg-gray-900/50",
                    "bg-gray-950/50"
                )}
                onClick={onSelect}
            >
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-gray-800">
                        <BiFolder className="text-2xl text-brand-200" />
                    </div>
                    <div className="flex-1 min-w-0">
                        {/* Show anime title prominently if available */}
                        {hasAnimeInfo && (
                            <p className="text-xs text-brand-300 font-medium mb-1 line-clamp-1">
                                {torrent.animeTitleRomaji || torrent.animeTitleNative}
                            </p>
                        )}
                        {/* Show truncated directory path */}
                        <h3 className="font-semibold text-sm line-clamp-2 mb-2" title={displayName}>
                            {truncatedPath || displayName}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            <Badge intent="gray" size="sm">
                                <BiFile className="mr-1" />
                                {torrent.fileCount} files
                            </Badge>
                            <Badge intent="gray" size="sm">
                                <LuHardDrive className="mr-1" />
                                {formatBytes(torrent.size)}
                            </Badge>
                            {hasSeasons && (
                                <Badge intent="primary-solid" size="sm">
                                    {torrent.seasons!.length} seasons
                                </Badge>
                            )}
                        </div>
                    </div>
                    <IconButton
                        icon={<BiTrash />}
                        intent="alert-subtle"
                        size="sm"
                        onClick={handleDelete}
                        loading={isDeleting}
                    />
                </div>
            </div>
            <ConfirmationDialog {...deleteConfirmation} />
        </>
    )
}
