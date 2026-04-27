import Page from "@/app/(main)/unmatched/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/unmatched/")({
    component: Page,
})
