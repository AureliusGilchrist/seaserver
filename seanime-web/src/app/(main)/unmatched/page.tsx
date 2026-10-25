"use client"

import { useRequireAdmin } from "@/app/(main)/_hooks/use-require-admin"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { UnmatchedTorrentsPage } from "@/app/(main)/unmatched/_containers/unmatched-torrents-page"

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
            <UnmatchedTorrentsPage />
        </>
    )
}
