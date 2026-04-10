import Page from "@/app/(main)/studio/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/studio/")({
    component: Page,
})
