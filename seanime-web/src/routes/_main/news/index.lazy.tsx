import Page from "@/app/(main)/news/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/news/")({
    component: Page,
})
