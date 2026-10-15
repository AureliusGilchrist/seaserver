import { LandingHub } from "@/app/(main)/_features/home/landing-hub"
import { LoadingOverlayWithLogo } from "@/components/shared/loading-overlay-with-logo"
import { createFileRoute } from "@tanstack/react-router"

// The landing page: a map of the app rather than one of its rooms. The anime library lives at
// /anime — see src/app/(main)/anime/page.tsx.
export const Route = createFileRoute("/_main/")({
    component: LandingHub,
    pendingComponent: () => <LoadingOverlayWithLogo title="L o a d i n g" />,
    pendingMs: 250,
})
