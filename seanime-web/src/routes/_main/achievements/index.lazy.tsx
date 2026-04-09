import Page from "@/app/(main)/achievements/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/achievements/")({
    component: Page,
})
