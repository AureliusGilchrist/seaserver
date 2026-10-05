import Page from "@/app/(main)/to-watch/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/to-watch/")({
    component: Page,
})
