import Page from "@/app/(main)/enqueue-future/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/enqueue-future/")({
    component: Page,
})
