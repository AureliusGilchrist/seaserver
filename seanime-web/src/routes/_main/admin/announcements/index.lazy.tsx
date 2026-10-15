import Page from "@/app/(main)/admin/announcements/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/admin/announcements/")({
    component: Page,
})
