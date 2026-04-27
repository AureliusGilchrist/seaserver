import Page from "@/app/(main)/enmasse/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/enmasse-anime/")({
    component: Page,
})
