import Page from "@/app/(main)/news/page"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_main/news/")({
    component: Page,
})
