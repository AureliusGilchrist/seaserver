"use client"

import { ToWatchList } from "@/app/(main)/profile/_components/to-watch-list"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import React from "react"
import { LuListVideo } from "react-icons/lu"

/**
 * The to-watch list, as its own screen.
 *
 * The profile tab shows the same list, and this is where it is worked from: a screen of its own,
 * reachable from the sidebar, laid out as one long strip in the order the person arranged — what is
 * next at the top, everything else following, each row recognisable by its cover and answerable by
 * its description, with the button that starts it on the far right.
 *
 * The list is per-profile, so this screen shows the signed-in profile's own list; other people's
 * are on their profiles, read-only.
 */
export default function Page() {
    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-6">
                <div className="flex items-center gap-3">
                    <LuListVideo className="text-3xl text-brand-200" />
                    <div>
                        <h2 className="text-2xl font-bold">To Watch</h2>
                        <p className="text-sm text-[--muted] mt-0.5">
                            What you mean to watch, in the order you mean to watch it. Add to it from any anime's page.
                        </p>
                    </div>
                </div>

                <ToWatchList />
            </PageWrapper>
        </>
    )
}
