"use client"

import { Models_HomeItem } from "@/api/generated/types"
import { useUpdateHomeItems } from "@/api/hooks/status.hooks"
import { HOME_ITEMS } from "@/app/(main)/(library)/_home/home-items.utils"
import { __home_settingsModalOpen } from "@/app/(main)/(library)/_home/home-settings-modal"
import { uuidv4 } from "@/app/websocket-provider"
import { Button, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { DndContext, DragEndEvent } from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import React from "react"
import { BiPlus, BiTrash } from "react-icons/bi"
import { LuBookOpen, LuHeading, LuSettings2 } from "react-icons/lu"
import { TbCarouselHorizontal } from "react-icons/tb"
import { Tooltip } from "@/components/ui/tooltip"

// highlight state per manga page
export const __manga_home_settings_button_discovered = atomWithStorage("sea-v3-manga-home-settings-discovered", false)

const MANGA_HOME_ITEMS = [
    "manga-carousel",
    "manga-continue-reading",
    "manga-library",
    "my-lists",
    "centered-title",
] as const

const DEFAULT_MANGA_HOME_ITEMS: Models_HomeItem[] = MANGA_HOME_ITEMS.map(type => ({
    id: uuidv4(),
    type,
    schemaVersion: HOME_ITEMS[type].schemaVersion,
}))

function MangaSortableItem({ item, onRemove, isUpdating }: { item: Models_HomeItem; onRemove: (id: string) => void; isUpdating: boolean }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: item.id })

    const style = {
        transform: CSS.Transform.toString(transform ? { ...transform, scaleY: 1 } : null),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="flex items-center justify-between border border-gray-800 rounded-lg p-3 bg-gray-900/50"
        >
            <div className="flex items-center gap-2">
                {item.type === "manga-carousel" && <TbCarouselHorizontal className="size-4" />}
                {(item.type === "manga-continue-reading" || item.type === "manga-library") && <LuBookOpen className="size-4" />}
                {item.type === "centered-title" && <LuHeading className="size-4" />}
                <div>
                    <p className="font-medium">{HOME_ITEMS[item.type].name}</p>
                    {HOME_ITEMS[item.type].description && <p className="text-xs text-[--muted]">{HOME_ITEMS[item.type].description}</p>}
                </div>
            </div>
            <IconButton
                intent="gray-subtle"
                size="sm"
                icon={<BiTrash />}
                disabled={isUpdating}
                onClick={() => onRemove(item.id)}
            />
        </div>
    )
}

export function MangaHomeSettingsButton() {
    const [isModalOpen, setIsModalOpen] = useAtom(__home_settingsModalOpen)
    const [discoveredOnce, setDiscoveredOnce] = useAtom(__manga_home_settings_button_discovered)
    return (
        <Tooltip
            trigger={<IconButton
                intent="white-subtle"
                icon={<LuSettings2 className="text-2xl" />}
                onClick={() => {
                    setIsModalOpen(true)
                    setDiscoveredOnce(true)
                }}
            />}
        >
            Manga Home Settings
        </Tooltip>
    )
}

export function MangaHomeSettingsModal() {
    const [isModalOpen, setIsModalOpen] = useAtom(__home_settingsModalOpen)
    const { mutate: updateHomeItems, isPending: isUpdatingHomeItems } = useUpdateHomeItems()

    const [currentItems, setCurrentItems] = React.useState<Models_HomeItem[]>(DEFAULT_MANGA_HOME_ITEMS)

    const normalize = React.useCallback((items: Models_HomeItem[]) => {
        let newItems = items.filter(item => MANGA_HOME_ITEMS.includes(item.type as any))
        newItems = newItems.map(item => ({
            ...item,
            schemaVersion: HOME_ITEMS[item.type].schemaVersion,
        }))
        return newItems
    }, [])

    const handleAdd = (type: string) => {
        const newItems = normalize([...currentItems, {
            id: uuidv4(),
            type,
            schemaVersion: HOME_ITEMS[type].schemaVersion,
        }])
        setCurrentItems(newItems)
        updateHomeItems({ items: newItems })
    }

    const handleRemove = (id: string) => {
        const newItems = normalize(currentItems.filter(i => i.id !== id))
        setCurrentItems(newItems)
        updateHomeItems({ items: newItems })
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (active.id !== over?.id) {
            const oldIndex = currentItems.findIndex(item => item.id === active.id)
            const newIndex = currentItems.findIndex(item => item.id === over?.id)
            const newItems = normalize(arrayMove(currentItems, oldIndex, newIndex))
            setCurrentItems(newItems)
            updateHomeItems({ items: newItems })
        }
    }

    return (
        <>
            <Modal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                title={<div className="flex items-center gap-2 w-full justify-center">
                    <LuBookOpen className="size-5" />
                    Manga Home
                </div>}
                contentClass="max-w-4xl bg-gray-950 bg-opacity-90 sm:rounded-3xl"
            >
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-4">
                        <LuHeading className="size-5" />
                        <h4 className="text-lg font-semibold">Layout</h4>
                    </div>

                    <DndContext modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
                        <SortableContext items={currentItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2 bg-gray-900/30 rounded-xl p-4 border border-gray-800">
                                {currentItems.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        No items added yet. Add some items below.
                                    </div>
                                ) : (
                                    currentItems.map((item, index) => (
                                        <MangaSortableItem
                                            key={item.id}
                                            item={item}
                                            onRemove={handleRemove}
                                            isUpdating={isUpdatingHomeItems}
                                        />
                                    ))
                                )}
                            </div>
                        </SortableContext>
                    </DndContext>

                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <BiPlus className="size-5" />
                            <h4 className="text-lg font-semibold">Available Items</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {MANGA_HOME_ITEMS
                                .filter(t => !currentItems.find(i => i.type === t))
                                .map(type => (
                                    <div key={type} className="flex items-center justify-between border border-gray-800 rounded-lg p-3 bg-gray-900/50">
                                        <div className="flex items-center gap-2">
                                            {type === "manga-carousel" && <TbCarouselHorizontal className="size-4" />}
                                            {(type === "manga-continue-reading" || type === "manga-library") && <LuBookOpen className="size-4" />}
                                            {type === "centered-title" && <LuHeading className="size-4" />}
                                            <p className="font-medium">{HOME_ITEMS[type].name}</p>
                                        </div>
                                        <Button size="sm" intent="white-subtle" onClick={() => handleAdd(type)} disabled={isUpdatingHomeItems}>Add</Button>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    )
}
