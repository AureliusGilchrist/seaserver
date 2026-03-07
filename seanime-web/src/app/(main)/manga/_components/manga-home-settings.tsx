"use client"

import { Models_HomeItem } from "@/api/generated/types"
import { useGetMangaHomeItems, useUpdateMangaHomeItems } from "@/api/hooks/status.hooks"
import { HOME_ITEMS, MANGA_HOME_ITEM_IDS } from "@/app/(main)/(library)/_home/home-items.utils"
import { HOME_ITEM_ICONS } from "@/app/(main)/(library)/_home/home-settings-modal"
import { __home_settingsModalOpen } from "@/app/(main)/(library)/_home/home-settings-modal"
import { uuidv4 } from "@/app/websocket-provider"
import { Button, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { TextInput } from "@/components/ui/text-input"
import { DndContext, DragEndEvent } from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useQueryClient } from "@tanstack/react-query"
import { useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import React from "react"
import { BiCog, BiPlus, BiStats, BiTrash } from "react-icons/bi"
import { IoHomeOutline, IoLibraryOutline } from "react-icons/io5"
import {
    LuBookOpen,
    LuCalendar,
    LuCalendarClock,
    LuCirclePlay,
    LuClock,
    LuCompass,
    LuHeading,
    LuLayoutPanelLeft,
    LuListTodo,
    LuMilestone,
    LuSettings2,
} from "react-icons/lu"
import { MdOutlineVideoLibrary } from "react-icons/md"
import { TbCarouselHorizontal } from "react-icons/tb"
import { toast } from "sonner"
import { Tooltip } from "@/components/ui/tooltip"

// highlight state per manga page
export const __manga_home_settings_button_discovered = atomWithStorage("sea-v3-manga-home-settings-discovered", false)

export const DEFAULT_MANGA_HOME_ITEMS: Models_HomeItem[] = [
    {
        id: "manga-library",
        type: "manga-library",
        schemaVersion: 2,
        options: {
            statuses: ["CURRENT", "PAUSED"],
            layout: "grid",
        },
    },
]

function MangaSortableItem({ item, onRemove, onEditOptions, isUpdating }: { 
    item: Models_HomeItem; 
    onRemove: (id: string) => void; 
    onEditOptions: (id: string) => void; 
    isUpdating: boolean 
}) {
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

    const homeItemConfig = HOME_ITEMS[item.type]
    const Icon = HOME_ITEM_ICONS[item.type as keyof typeof HOME_ITEM_ICONS] || IoHomeOutline

    if (!homeItemConfig) return null

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={cn(
                "flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors cursor-move",
                homeItemConfig.kind.length === 1 && homeItemConfig.kind[0] === "header" && "opacity-50",
            )}
        >
            <div className="p-2 bg-gray-700/50 rounded-lg">
                <Icon className="size-5 text-gray-300" />
            </div>

            <div className="flex-1">
                <div className="font-medium text-white">{homeItemConfig.name}{!!item.options?.name && `: "${item.options.name}"`}
                    {(item.type === "centered-title" && item.options?.text) && `: "${item.options.text}"`}
                    {(item.type === "my-lists") && `: ${item.options?.type === "manga" ? "Manga" : "Anime"}`}
                </div>
                <p className="text-xs text-[--muted] line-clamp-1">
                    {homeItemConfig.description}
                </p>
                <div className="text-sm text-gray-400">
                    {homeItemConfig.kind.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(", ")}
                </div>
            </div>

            <div className="flex items-center gap-1">
                {homeItemConfig.options && (
                    <IconButton
                        intent="gray-subtle"
                        size="sm"
                        onClick={() => onEditOptions(item.id)}
                        disabled={isUpdating}
                        className={cn(
                            "hover:bg-blue-500/20 hover:text-blue-400",
                            homeItemConfig.options?.find(n => n.name === "name") && !item.options?.name?.length && "bg-fuchsia-600 animate-bounce",
                        )}
                        icon={<BiCog className="size-4" />}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                )}

                <IconButton
                    intent="gray-subtle"
                    size="sm"
                    onClick={() => onRemove(item.id)}
                    disabled={isUpdating}
                    className="hover:bg-red-500/20 hover:text-red-400"
                    icon={<BiTrash className="size-4" />}
                    onPointerDown={(e) => e.stopPropagation()}
                />
            </div>
        </div>
    )
}

interface AvailableMangaHomeItemProps {
    id: string
    type: string
    onAdd: (id: string) => void
    isUpdating: boolean
}

function AvailableMangaHomeItem({ id, type, onAdd, isUpdating }: AvailableMangaHomeItemProps) {
    const homeItemConfig = HOME_ITEMS[type]
    const Icon = HOME_ITEM_ICONS[type as keyof typeof HOME_ITEM_ICONS] || IoHomeOutline

    if (!homeItemConfig) return null

    return (
        <div className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors group">
            <div className="p-2 bg-gray-800/50 rounded-lg group-hover:bg-gray-700/50 transition-colors">
                <Icon className="size-5 text-gray-400 group-hover:text-gray-300 transition-colors" />
            </div>

            <div className="flex-1">
                <div className="font-medium text-white">{homeItemConfig.name}</div>
                <p className="text-xs text-[--muted]">
                    {homeItemConfig.description}
                </p>
                <div className="text-sm text-gray-400">
                    {homeItemConfig.kind.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(", ")}
                </div>
            </div>

            <Button
                intent="primary-subtle"
                size="sm"
                onClick={() => onAdd(type)}
                disabled={isUpdating}
                leftIcon={<BiPlus />}
            >
                Add
            </Button>
        </div>
    )
}

interface MangaHomeItemOptionsModalProps {
    id: string
    item: Models_HomeItem
    isOpen: boolean
    onClose: () => void
    onSave: (id: string, options: any) => void
    isUpdating: boolean
}

function MangaHomeItemOptionsModal({ id, item, isOpen, onClose, onSave, isUpdating }: MangaHomeItemOptionsModalProps) {
    const homeItemConfig = HOME_ITEMS[item.type]
    const [formData, setFormData] = React.useState<Record<string, any>>(item.options || {})

    React.useEffect(() => {
        if (!homeItemConfig || homeItemConfig.schemaVersion !== item.schemaVersion) {
            setFormData({})
            return
        }
        setFormData(item.options || {})
    }, [item.options, homeItemConfig])

    if (!homeItemConfig?.options) return null

    const handleFieldChange = (fieldName: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [fieldName]: value,
        }))
    }

    const handleSave = () => {
        onSave(id, formData)
    }

    return (
        <Modal
            open={isOpen}
            onOpenChange={onClose}
            title={
                <div className="flex items-center gap-2">
                    <BiCog className="size-5" />
                    Configure {homeItemConfig.name}
                </div>
            }
            contentClass="max-w-2xl bg-gray-950 bg-opacity-90 firefox:bg-opacity-100 firefox:backdrop-blur-none sm:rounded-3xl"
            overlayClass="bg-black/80"
        >
            <div className="space-y-6">
                <div className="text-sm text-gray-400">
                    Customize the settings for this home item.
                </div>

                <div className="space-y-4">
                    {(homeItemConfig.options || []).map((option: any) => (
                        <OptionField
                            key={option.name}
                            option={option}
                            value={formData[option.name]}
                            onChange={(value) => handleFieldChange(option.name, value)}
                        />
                    ))}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                    <Button
                        intent="gray-subtle"
                        onClick={onClose}
                        disabled={isUpdating}
                    >
                        Cancel
                    </Button>
                    <Button
                        intent="primary"
                        onClick={handleSave}
                        loading={isUpdating}
                    >
                        Save
                    </Button>
                </div>
            </div>
        </Modal>
    )
}

interface OptionFieldProps {
    option: any
    value: any
    onChange: (value: any) => void
}

function OptionField({ option, value, onChange }: OptionFieldProps) {
    const { label, type, name, options, min, max } = option

    const handleMultiSelectChange = (selectedValue: string) => {
        const currentValues = Array.isArray(value) ? value : []
        const newValues = currentValues.includes(selectedValue)
            ? currentValues.filter((v: any) => v !== selectedValue)
            : [...currentValues, selectedValue]
        onChange(newValues)
    }

    switch (type) {
        case "text":
            return (
                <div className="space-y-2">
                    <label className="text-sm font-medium text-white">{label}</label>
                    <TextInput
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={`Enter ${label.toLowerCase()}`}
                    />
                </div>
            )

        case "number":
            return (
                <div className="space-y-2">
                    <label className="text-sm font-medium text-white">{label}</label>
                    <NumberInput
                        value={value || min || 0}
                        onValueChange={(valueAsNumber) => onChange(valueAsNumber)}
                        min={min}
                        max={max}
                        formatOptions={{ useGrouping: false }}
                    />
                </div>
            )

        case "select":
            return (
                <div className="space-y-2">
                    <label className="text-sm font-medium text-white">{label}</label>
                    <Select
                        value={value || ""}
                        onValueChange={onChange}
                        placeholder={`Select ${label.toLowerCase()}`}
                        options={[
                            ...options,
                        ]}
                    />
                </div>
            )

        case "multi-select":
            const selectedValues = Array.isArray(value) ? value : []
            return (
                <div className="space-y-2">
                    <label className="text-sm font-medium text-white">{label}</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-3 bg-gray-900/30 rounded-lg border border-gray-800">
                        {options.map((opt: any) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleMultiSelectChange(opt.value)}
                                className={cn(
                                    "p-2 text-sm rounded-md border transition-colors text-left",
                                    selectedValues.includes(opt.value)
                                        ? "bg-brand-500/20 border-brand-500 text-brand-300"
                                        : "bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600",
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )

        default:
            return (
                <div className="text-sm text-gray-400">
                    Unsupported field type: {type}
                </div>
            )
    }
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
    const [optionsModalOpen, setOptionsModalOpen] = React.useState<string | null>(null)
    const { data: _homeItems, isLoading: isLoadingHomeItems } = useGetMangaHomeItems()
    const { mutate: updateHomeItems, isPending: isUpdatingHomeItems } = useUpdateMangaHomeItems()
    const queryClient = useQueryClient()

    const [currentItems, setCurrentItems] = React.useState<Models_HomeItem[]>(_homeItems || DEFAULT_MANGA_HOME_ITEMS)
    const allowedMultiple = ["manga-carousel", "centered-title", "my-lists"] as const
    // Show every manga home item; allow multiples for specific types
    const availableItems = MANGA_HOME_ITEM_IDS.filter(type => {
        if (allowedMultiple.includes(type as typeof allowedMultiple[number])) return true
        return !currentItems.some(item => item.type === type)
    })

    const checkTimeRef = React.useRef<NodeJS.Timeout | null>(null)
    React.useEffect(() => {
        if (!_homeItems) return

        const homeItems = normalizeHomeItems(_homeItems)
        setCurrentItems(homeItems)

        if (checkTimeRef.current) {
            clearTimeout(checkTimeRef.current)
            checkTimeRef.current = null
        }

        // Check if an item doesn't exist anymore and remove it
        checkTimeRef.current = setTimeout(() => {
            const newItems = normalizeHomeItems(homeItems)

            if (newItems.length !== homeItems.length) {
                setCurrentItems(newItems)
                updateHomeItems({ items: newItems }, {
                    onSuccess: () => {
                        console.log("Manga home items updated")
                        // Invalidate cache to trigger real-time update
                        queryClient.invalidateQueries({ queryKey: ["GetMangaHomeItems"] })
                    },
                })
            }
        }, 500)

        return () => {
            if (checkTimeRef.current) {
                clearTimeout(checkTimeRef.current)
                checkTimeRef.current = null
            }
        }
    }, [_homeItems])

    const handleDragEnd = React.useCallback((event: DragEndEvent) => {
        const { active, over } = event

        if (active.id !== over?.id) {
            const oldIndex = currentItems.findIndex(item => item.id === active.id)
            const newIndex = currentItems.findIndex(item => item.id === over?.id)

            const newItems = normalizeHomeItems(arrayMove(currentItems, oldIndex, newIndex))
            setCurrentItems(newItems)
            updateHomeItems({ items: newItems }, {
                onSuccess: () => {
                    // Invalidate cache for real-time update
                    queryClient.invalidateQueries({ queryKey: ["GetMangaHomeItems"] })
                    toast.success("Manga home items reordered")
                },
            })
        }
    }, [currentItems, updateHomeItems, queryClient])

    function normalizeHomeItems(items: Models_HomeItem[]) {
        let newItems = items.filter(item => !!HOME_ITEMS[item.type] && MANGA_HOME_ITEM_IDS.includes(item.type as any))
        newItems = newItems.map(item => ({
            ...item,
            schemaVersion: HOME_ITEMS[item.type].schemaVersion,
        }))
        return newItems
    }

    const handleAddItem = (type: string) => {
        const newItem: Models_HomeItem = {
            id: uuidv4(),
            type,
            schemaVersion: HOME_ITEMS[type].schemaVersion,
        }

        const newItems = normalizeHomeItems([...currentItems, newItem])
        setCurrentItems(newItems)
        updateHomeItems({ items: newItems }, {
            onSuccess: () => {
                toast.success("Manga home item added")
                // Invalidate cache for real-time update
                queryClient.invalidateQueries({ queryKey: ["GetMangaHomeItems"] })
            },
        })
    }

    const handleRemoveItem = (id: string) => {
        const newItems = normalizeHomeItems(currentItems.filter(item => item.id !== id))
        setCurrentItems(newItems)
        updateHomeItems({ items: newItems }, {
            onSuccess: () => {
                toast.success("Manga home item removed")
                // Invalidate cache for real-time update
                queryClient.invalidateQueries({ queryKey: ["GetMangaHomeItems"] })
            },
        })
    }

    const handleUpdateItemOptions = (id: string, options: any) => {
        const newItems = normalizeHomeItems(currentItems.map(item =>
            item.id === id
                ? { ...item, options }
                : item,
        ))
        setCurrentItems(newItems)
        updateHomeItems({ items: newItems }, {
            onSuccess: () => {
                toast.success("Manga home layout updated")
                setOptionsModalOpen(null)
                // Invalidate cache for real-time update
                queryClient.invalidateQueries({ queryKey: ["GetMangaHomeItems"] })
            },
        })
    }

    if (isLoadingHomeItems) {
        return (
            <Modal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                title={<div className="flex items-center gap-2 w-full justify-center">
                    <LuBookOpen className="size-5" />
                    Manga Home
                </div>}
                contentClass="max-w-4xl bg-gray-950 bg-opacity-90 sm:rounded-3xl"
            >
                <div className="flex items-center justify-center py-12">
                    <LoadingSpinner />
                </div>
            </Modal>
        )
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
                contentClass="max-w-5xl bg-gray-950 bg-opacity-90 sm:rounded-3xl"
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
                                            onRemove={handleRemoveItem}
                                            onEditOptions={() => setOptionsModalOpen(item.id)}
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
                            {availableItems.map(type => (
                                <AvailableMangaHomeItem
                                    key={type}
                                    id={type}
                                    type={type}
                                    onAdd={handleAddItem}
                                    isUpdating={isUpdatingHomeItems}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>

            {optionsModalOpen && (
                <MangaHomeItemOptionsModal
                    id={optionsModalOpen}
                    item={currentItems.find(item => item.id === optionsModalOpen)!}
                    isOpen={!!optionsModalOpen}
                    onClose={() => setOptionsModalOpen(null)}
                    onSave={handleUpdateItemOptions}
                    isUpdating={isUpdatingHomeItems}
                />
            )}
        </>
    )
}
