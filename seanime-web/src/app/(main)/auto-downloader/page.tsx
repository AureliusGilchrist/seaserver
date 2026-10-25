"use client"
import { useRequireAdmin } from "@/app/(main)/_hooks/use-require-admin"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { AutoDownloaderPage } from "@/app/(main)/auto-downloader/_containers/autodownloader-page"
import { PageWrapper } from "@/components/shared/page-wrapper"
import React from "react"

export const dynamic = "force-static"

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
            <PageWrapper className="p-4 sm:p-8 space-y-4">
                <div className="flex justify-between items-center w-full relative">
                    <div>
                        <h2>Auto Downloader</h2>
                        <p className="text-[--muted]">
                            Automatically download new episodes as they are released.
                        </p>
                    </div>
                </div>
                <AutoDownloaderPage />
            </PageWrapper>
        </>
    )

}
