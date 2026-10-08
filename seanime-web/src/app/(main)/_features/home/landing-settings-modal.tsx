"use client"

import { LANDING_QUICK_LINKS, LANDING_WIDGET_META, useLandingWidgets, type LandingWidgetId } from "@/app/(main)/_features/home/landing-widgets"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Modal } from "@/components/ui/modal"
import { DndContext, DragEndEvent } from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { atom } from "jotai"
import React from "react"
import { BiCog, BiTrash } from "react-icons/bi"
import { LuGripVertical, LuLayoutPanelLeft } from "react-icons/lu"

export const __landingSettingsModalOpen = atom(false)

/**
 * The landing page's settings.
 *
 * The same shape the anime and manga home screens are arranged in: the widgets listed in the order
 * they are drawn, each toggleable, each draggable to move it, and the quick links — the one widget
 * with contents of its own — with its own list of what it may point at.
 */
export function LandingSettingsModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const { widgets, setWidgetEnabled, moveWidget } = useLandingWidgets()

    const enabledCount = widgets.filter(w => w.enabled).length

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
            contentClass="max-w-2xl"
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
