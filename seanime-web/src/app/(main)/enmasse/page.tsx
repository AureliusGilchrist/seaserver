"use client"

import { useRequireAdmin } from "@/app/(main)/_hooks/use-require-admin"
import { EnMassePage } from "@/app/(main)/enmasse/_containers/enmasse-page"

// Downloads are admin-only (see main-sidebar).
export default function Page() {
    const allowed = useRequireAdmin()
    if (!allowed) return null
    return <AdminPage />
}

function AdminPage() {
    return <EnMassePage />
}
