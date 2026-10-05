import Page from "@/app/(main)/anime/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/anime/")({
    component: Page,
})
