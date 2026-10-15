"use client"

import { LANDING_QUICK_LINKS, LANDING_WIDGET_META, useLandingFolders, useLandingWidgets, type LandingWidgetId } from "@/app/(main)/_features/home/landing-widgets"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Modal } from "@/components/ui/modal"
import { DndContext, DragEndEvent } from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { atom } from "jotai"
import React from "react"
import { BiTrash } from "react-icons/bi"
import { LuFolderPlus, LuGripVertical } from "react-icons/lu"

export const __landingSettingsModalOpen = atom(false)

/**
 * The landing page's settings.
 *
 * Widgets can be toggled and reordered; app destinations can be assigned to editable folders.
 */
export function LandingSettingsModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const { widgets, setWidgetEnabled, moveWidget } = useLandingWidgets()
    const { folders, updateFolders } = useLandingFolders()
    const [newFolderName, setNewFolderName] = React.useState("")

    const enabledCount = widgets.filter(w => w.enabled).length
    const assignedLinkIds = new Set(
        folders.flatMap(folder => folder.linkIds).filter(id => LANDING_QUICK_LINKS.some(link => link.id === id)),
    )

    function addFolder() {
        const name = newFolderName.trim()
        if (!name) return
        updateFolders(current => [...current, {
            id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            linkIds: [],
        }])
        setNewFolderName("")
    }

    function assignLink(linkId: string, folderId: string) {
        updateFolders(current => current.map(folder => ({
            ...folder,
            linkIds: folder.id === folderId
                ? [...new Set([...folder.linkIds, linkId])]
                : folder.linkIds.filter(id => id !== linkId),
        })))
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const from = widgets.findIndex(w => w.id === active.id)
        const to = widgets.findIndex(w => w.id === over.id)
        if (from === -1 || to === -1) return
        moveWidget(from, to)
    }

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="Landing page settings"
            contentClass="max-w-3xl max-h-[90vh] overflow-y-auto"
        >
            <div className="space-y-4 mt-4">
                <p className="text-sm text-[--muted]">
                    What the landing page shows, and in what order. Drag to move a widget, toggle it to
                    hide it.
                </p>

                <DndContext onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
                    <SortableContext items={widgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1.5">
                            {widgets.map(widget => (
                                <SortableWidgetRow
                                    key={widget.id}
                                    widget={widget}
                                    onToggle={enabled => setWidgetEnabled(widget.id, enabled)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                <p className="text-xs text-[--muted]">{enabledCount} of {widgets.length} shown</p>

                <section className="space-y-3 border-t border-white/10 pt-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h3 className="text-base font-semibold">Folders</h3>
                            <p className="mt-1 text-xs text-[--muted]">Group every app destination on the landing page.</p>
                        </div>
                        <div className="flex w-full gap-2 sm:w-auto">
                            <input
                                value={newFolderName}
                                onChange={event => setNewFolderName(event.target.value)}
                                onKeyDown={event => {
                                    if (event.key === "Enter") {
                                        event.preventDefault()
                                        addFolder()
                                    }
                                }}
                                maxLength={32}
                                placeholder="New folder name"
                                aria-label="New folder name"
                                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[--brand]/60 focus:outline-none sm:w-48"
                            />
                            <button
                                type="button"
                                onClick={addFolder}
                                disabled={!newFolderName.trim()}
                                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <LuFolderPlus className="size-4" />
                                Add
                            </button>
                        </div>
                    </div>

                    {folders.length > 0 && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {folders.map(folder => (
                                <div key={folder.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5 backdrop-blur-md">
                                    <input
                                        value={folder.name}
                                        onChange={event => updateFolders(current => current.map(item =>
                                            item.id === folder.id ? { ...item, name: event.target.value.slice(0, 32) } : item,
                                        ))}
                                        maxLength={32}
                                        aria-label={`Rename ${folder.name}`}
                                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-white focus:border-white/15 focus:bg-black/20 focus:outline-none"
                                    />
                                    <span className="shrink-0 text-xs text-[--muted]">
                                        {folder.linkIds.filter(id => LANDING_QUICK_LINKS.some(link => link.id === id)).length}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => updateFolders(current => current.filter(item => item.id !== folder.id))}
                                        aria-label={`Delete ${folder.name}`}
                                        title="Delete folder"
                                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white/55 transition hover:bg-red-500/15 hover:text-red-300"
                                    >
                                        <BiTrash className="size-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {LANDING_QUICK_LINKS.map(link => {
                            const folderId = folders.find(folder => folder.linkIds.includes(link.id))?.id ?? ""
                            return (
                                <label key={link.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 backdrop-blur-md">
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium text-white">{link.name}</span>
                                        <span className="block truncate text-xs text-[--muted]">{link.description}</span>
                                    </span>
                                    <select
                                        value={folderId}
                                        onChange={event => assignLink(link.id, event.target.value)}
                                        aria-label={`Folder for ${link.name}`}
                                        className="w-32 shrink-0 rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-white focus:border-[--brand]/60 focus:outline-none"
                                    >
                                        <option value="">Unsorted</option>
                                        {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name || "Untitled folder"}</option>)}
                                    </select>
                                </label>
                            )
                        })}
                    </div>
                    {folders.length === 0 && (
                        <p className="rounded-xl border border-dashed border-white/15 px-4 py-5 text-center text-sm text-[--muted]">
                            No folders yet. Your destinations will appear in Unsorted until you add one.
                        </p>
                    )}
                    <p className="text-xs text-[--muted]">
                        {LANDING_QUICK_LINKS.length - assignedLinkIds.size} destinations are unsorted.
                    </p>
                </section>
            </div>
        </Modal>
    )
}

function SortableWidgetRow({ widget, onToggle }: {
    widget: { id: LandingWidgetId, enabled: boolean }
    onToggle: (enabled: boolean) => void
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: widget.id })

    const meta = LANDING_WIDGET_META[widget.id]

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn(
                "flex items-center gap-3 rounded-lg border border-[--border] bg-[--card] px-3 py-2.5",
                isDragging && "opacity-80 z-50",
                !widget.enabled && "opacity-50",
            )}
        >
            <button
                className="text-[--muted] hover:text-[--foreground] cursor-grab active:cursor-grabbing touch-none"
                {...attributes}
                {...listeners}
                aria-label="Drag to reorder"
            >
                <LuGripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{meta?.name ?? widget.id}</p>
                <p className="text-xs text-[--muted] truncate">{meta?.description}</p>
            </div>
            <button
                role="switch"
                aria-checked={widget.enabled}
                onClick={() => onToggle(!widget.enabled)}
                className={cn(
                    "relative w-9 h-5 rounded-full transition-colors flex-none",
                    widget.enabled ? "bg-brand" : "bg-[--subtle]",
                )}
            >
                <span
                    className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
                        widget.enabled ? "left-[1.15rem]" : "left-0.5",
                    )}
                />
            </button>
        </div>
    )
}
