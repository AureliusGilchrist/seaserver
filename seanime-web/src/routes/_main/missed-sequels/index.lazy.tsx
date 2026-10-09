import Page from "@/app/(main)/missed-sequels/page"
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/_main/missed-sequels/")({
    component: Page,
})
