import Page from "@/app/(main)/settings/manga-scan/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/settings/manga-scan/")({
    component: Page,
})
