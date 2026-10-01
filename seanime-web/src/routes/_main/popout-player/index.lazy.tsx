import Page from "@/app/(main)/popout-player/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/popout-player/")({
    component: Page,
})
