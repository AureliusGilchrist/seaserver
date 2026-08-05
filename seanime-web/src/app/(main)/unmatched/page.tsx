"use client"

import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { UnmatchedTorrentsPage } from "@/app/(main)/unmatched/_containers/unmatched-torrents-page"

export default function Page() {
    return (
        <>
            <CustomLibraryBanner discrete />
            <UnmatchedTorrentsPage />
        </>
    )
}
