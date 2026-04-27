import Page from "@/app/(main)/staff/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/staff/")({
    component: Page,
})
