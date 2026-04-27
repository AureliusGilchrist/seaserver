"use client"
import { useOpenInExplorer } from "@/api/hooks/explorer.hooks"
import { __manga_home_settingsModalOpen } from "@/app/(main)/manga/_components/manga-home-settings"
import { libraryExplorer_drawerOpenAtom } from "@/app/(main)/_features/library-explorer/library-explorer.atoms"
import { usePlaylistEditorManager } from "@/app/(main)/_features/playlists/lib/playlist-editor-manager"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { SeaLink } from "@/components/shared/sea-link"
import { IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Tooltip } from "@/components/ui/tooltip"
import { useSetAtom } from "jotai/react"
import { BiDotsVerticalRounded, BiFolder } from "react-icons/bi"
import { LuFolderTree, LuSettings2 } from "react-icons/lu"
import { MdOutlineVideoLibrary } from "react-icons/md"

export type MangaHomeToolbarProps = {
    hasManga: boolean
    className?: string
}

export function MangaHomeToolbar(props: MangaHomeToolbarProps) {
    const {
        hasManga,
        className,
    } = props

    const serverStatus = useServerStatus()

    const setLibraryExplorerDrawerOpen = useSetAtom(libraryExplorer_drawerOpenAtom)
    const { setModalOpen } = usePlaylistEditorManager()
    const setHomeSettingsModalOpen = useSetAtom(__manga_home_settingsModalOpen)

    const { mutate: openInExplorer } = useOpenInExplorer()

    const hasMangaDownloadPath = !!serverStatus?.settings?.manga?.mangaLocalSourceDirectory

    return (
        <>
            <div className={cn("flex flex-wrap w-full justify-end gap-1 p-4 relative z-[120]", className)} data-manga-home-toolbar-container>
                <div className="flex flex-1 pointer-events-none" data-manga-home-toolbar-spacer></div>

                {hasManga && (
                    <>
                        {hasMangaDownloadPath && <Tooltip
                            trigger={<IconButton
                                data-manga-home-toolbar-library-explorer-button
                                intent={"white-subtle"}
                                icon={<LuFolderTree className="text-2xl" />}
                                onClick={() => {
                                    setLibraryExplorerDrawerOpen(true)
                                }}
                            />}
                        >
                            Library Explorer
                        </Tooltip>}

                        <Tooltip
                            trigger={<IconButton
                                data-manga-home-toolbar-playlists-button
                                intent={"white-subtle"}
                                icon={<MdOutlineVideoLibrary className="text-2xl" />}
                                onClick={() => setModalOpen(true)}
                            />}
                        >Playlists</Tooltip>
                    </>
                )}

                <MangaHomeSettingsToolbarButton />

                {hasMangaDownloadPath &&
                    <DropdownMenu
                        className="z-[150]"
                        trigger={<IconButton
                            data-manga-home-toolbar-dropdown-menu-trigger
                            icon={<BiDotsVerticalRounded />} intent="gray-basic"
                        />}
                    >
                        <DropdownMenuItem
                            data-manga-home-toolbar-open-directory-button
                            disabled={!hasMangaDownloadPath}
                            className={cn("cursor-pointer", { "!text-[--muted]": !hasMangaDownloadPath })}
                            onClick={() => {
                                openInExplorer({ path: serverStatus?.settings?.manga?.mangaLocalSourceDirectory ?? "" })
                            }}
                        >
                            <BiFolder />
                            <span>Open downloads directory</span>
                        </DropdownMenuItem>

                        <SeaLink href="/manga/downloads">
                            <DropdownMenuItem
                                data-manga-home-toolbar-downloads-button
                            >
                                <LuFolderTree />
                                <span>Manage downloads</span>
                            </DropdownMenuItem>
                        </SeaLink>
                    </DropdownMenu>}
            </div>
        </>
    )
}

function MangaHomeSettingsToolbarButton() {
    const setIsModalOpen = useSetAtom(__manga_home_settingsModalOpen)

    return (
        <Tooltip
            trigger={<IconButton
                data-manga-toolbar-settings-button
                intent="white-subtle"
                icon={<LuSettings2 className="text-2xl" />}
                onClick={() => {
                    setIsModalOpen(true)
                }}
            />}
        >
            Manga Home Settings
        </Tooltip>
    )
}
