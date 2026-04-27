import Page from "@/app/(main)/community/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/community/")({
    component: Page,
})
