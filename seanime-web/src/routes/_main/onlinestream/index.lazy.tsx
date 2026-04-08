import Page from "@/app/(main)/onlinestream/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/onlinestream/")({
    component: Page,
})
