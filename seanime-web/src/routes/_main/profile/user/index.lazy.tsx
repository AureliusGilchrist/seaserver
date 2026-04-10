import Page from "@/app/(main)/profile/user/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/profile/user/")({
    component: Page,
})
