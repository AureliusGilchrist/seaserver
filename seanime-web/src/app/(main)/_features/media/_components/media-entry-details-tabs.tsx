"use client"

import { cn } from "@/components/ui/core/styling"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { motion } from "motion/react"
import React from "react"

// The lower half of a details page (information, cast, related titles, discussion) as tabs instead
// of one long stack. Every section is still there, one click away; the tab bar sticks under the top
// of the page so it can be switched without scrolling back up.

export type MediaEntryDetailsTab = {
    value: string
    label: string
    icon?: React.ReactNode
    content: React.ReactNode
}

export function MediaEntryDetailsTabs({ tabs, defaultValue, className }: {
    tabs: MediaEntryDetailsTab[]
    defaultValue?: string
    className?: string
}) {
    const [value, setValue] = React.useState(defaultValue ?? tabs[0]?.value)
    const rootRef = React.useRef<HTMLDivElement>(null)

    function select(next: string) {
        setValue(next)
        // Coming from far down a long tab, bring the start of the new one into view.
        const top = rootRef.current?.getBoundingClientRect().top
        if (top !== undefined && top < 0) rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }

    if (!tabs.length) return null

    return (
        <Tabs
            ref={rootRef}
            value={value}
            onValueChange={select}
            className={cn("scroll-mt-4 pt-12", className)}
            data-media-entry-details-tabs
        >
            <TabsList
                className={cn(
                    "sticky top-2 z-[10] h-auto w-full max-w-full justify-start gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none]",
                    "rounded-2xl bg-[--background]/75 ring-1 ring-white/10 backdrop-blur-xl shadow-[0_18px_40px_-20px_rgb(0_0_0_/_0.8)]",
                )}
            >
                {tabs.map(tab => (
                    <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className={cn(
                            "relative h-12 flex-none gap-2 rounded-xl border-none px-3.5 text-[0.95rem] font-semibold sm:px-5",
                            "text-white/50 hover:text-white/85 data-[state=active]:text-white",
                        )}
                    >
                        <span className="relative flex items-center gap-2 [&>svg]:size-[1.05rem]">
                            <span className={cn("flex transition-colors", value === tab.value ? "text-brand-200" : "text-current")}>{tab.icon}</span>
                            {tab.label}
                        </span>
                        {value === tab.value && <motion.span
                            layoutId="media-entry-details-tab-underline"
                            className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-brand-300 shadow-[0_0_14px_2px_rgb(var(--color-brand-400)_/_0.55)]"
                            transition={{ type: "spring", stiffness: 420, damping: 36 }}
                        />}
                    </TabsTrigger>
                ))}
            </TabsList>

            {tabs.map(tab => (
                <TabsContent key={tab.value} value={tab.value} className="pt-8 focus-visible:ring-0 focus-visible:ring-offset-0">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                        className="space-y-12"
                    >
                        {tab.content}
                    </motion.div>
                </TabsContent>
            ))}
        </Tabs>
    )
}
