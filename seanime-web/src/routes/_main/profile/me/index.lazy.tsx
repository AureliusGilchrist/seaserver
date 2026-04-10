import Page from "@/app/(main)/profile/me/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/profile/me/")({
    component: Page,
})
