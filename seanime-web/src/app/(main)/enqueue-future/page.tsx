"use client"

import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { EnqueueFuturePage } from "@/app/(main)/enqueue-future/_containers/enqueue-future-page"

export default function Page() {
    return (
        <>
            <CustomLibraryBanner discrete />
            <EnqueueFuturePage />
        </>
    )
}
