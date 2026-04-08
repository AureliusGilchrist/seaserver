import Page from "@/app/(main)/enmasse-manga/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/enmasse-manga/")({
    component: Page,
})
