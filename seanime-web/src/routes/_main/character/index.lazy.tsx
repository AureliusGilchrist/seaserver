import Page from "@/app/(main)/character/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/character/")({
    component: Page,
})
