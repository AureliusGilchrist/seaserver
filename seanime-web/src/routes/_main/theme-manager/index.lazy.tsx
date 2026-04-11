import Page from "@/app/(main)/theme-manager/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/theme-manager/")({
    component: Page,
})
