import Page from "@/app/(main)/milestones/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/milestones/")({
    component: Page,
})
