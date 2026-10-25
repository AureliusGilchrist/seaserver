"use client"

import { useRequireAdmin } from "@/app/(main)/_hooks/use-require-admin"
import { MangaEnMassePage } from "@/app/(main)/enmasse-manga/_containers/manga-enmasse-page"

// Downloads are admin-only (see main-sidebar).
export default function Page() {
    const allowed = useRequireAdmin()
    if (!allowed) return null
    return <AdminPage />
}

function AdminPage() {
    return <MangaEnMassePage />
}
