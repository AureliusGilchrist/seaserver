import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { useRouter } from "@/lib/navigation"
import React from "react"
import { toast } from "sonner"

/**
 * Admin-only pages (the Downloads group): returns whether the current profile may see the page,
 * and sends anyone else home. On a single-user install (no profiles) everyone is the admin.
 */
export function useRequireAdmin(): boolean {
    const serverStatus = useServerStatus()
    const router = useRouter()
    const known = !!serverStatus
    const allowed = !serverStatus?.profilesEnabled || !serverStatus?.profiles?.length || !!serverStatus?.currentProfile?.isAdmin

    React.useEffect(() => {
        if (known && !allowed) {
            toast.warning("Only the admin can open this page")
            router.replace("/")
        }
    }, [known, allowed])

    return known && allowed
}
