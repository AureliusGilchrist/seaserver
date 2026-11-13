import Page from "@/app/(main)/watch-party/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/watch-party/")({
    component: Page,
})
