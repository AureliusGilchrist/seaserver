import Page from "@/app/(main)/popout-player/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/popout-player/")({
    component: Page,
})
