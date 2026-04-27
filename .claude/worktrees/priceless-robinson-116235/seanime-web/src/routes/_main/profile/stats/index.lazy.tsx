import Page from "@/app/(main)/profile/stats/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/profile/stats/")({
    component: Page,
})
