import { LandingHub } from "@/app/(main)/_features/home/landing-hub"
import { MediaEntryPageLoadingDisplay } from "@/app/(main)/_features/media/_components/media-entry-page-loading-display"
import { createFileRoute } from "@tanstack/react-router"

// The landing page: a map of the app rather than one of its rooms. The anime library lives at
// /anime — see src/app/(main)/anime/page.tsx.
export const Route = createFileRoute("/_main/")({
    component: LandingHub,
    pendingComponent: MediaEntryPageLoadingDisplay,
    pendingMs: 250,
})
