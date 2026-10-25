"use client"

import { useRequireAdmin } from "@/app/(main)/_hooks/use-require-admin"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { EnqueueFuturePage } from "@/app/(main)/enqueue-future/_containers/enqueue-future-page"

// Downloads are admin-only (see main-sidebar).
export default function Page() {
    const allowed = useRequireAdmin()
    if (!allowed) return null
    return <AdminPage />
}

function AdminPage() {
    return (
        <>
            <CustomLibraryBanner discrete />
            <EnqueueFuturePage />
        </>
    )
}
