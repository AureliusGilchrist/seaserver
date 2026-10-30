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
            className={cn("scroll-mt-4 pt-6", className)}
            data-media-entry-details-tabs
        >
            <TabsList
                className={cn(
                    "sticky top-2 z-[10] h-auto w-fit max-w-full mx-auto lg:mx-0 justify-start gap-1 overflow-x-auto",
                    "rounded-full bg-[--background]/70 p-1 ring-1 ring-white/10 backdrop-blur-xl shadow-lg",
                )}
            >
                {tabs.map(tab => (
                    <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className={cn(
                            "relative h-9 gap-2 rounded-full border-none px-4 text-sm",
                            "data-[state=active]:text-white",
                        )}
                    >
                        {value === tab.value && <motion.span
                            layoutId="media-entry-details-tab-pill"
                            className="absolute inset-0 rounded-full bg-white/10 ring-1 ring-white/15"
                            transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />}
                        <span className="relative flex items-center gap-2 [&>svg]:size-4">{tab.icon}{tab.label}</span>
                    </TabsTrigger>
                ))}
            </TabsList>

            {tabs.map(tab => (
                <TabsContent key={tab.value} value={tab.value} className="pt-8 focus-visible:ring-0 focus-visible:ring-offset-0">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                        className="space-y-10"
                    >
                        {tab.content}
                    </motion.div>
                </TabsContent>
            ))}
        </Tabs>
    )
}
