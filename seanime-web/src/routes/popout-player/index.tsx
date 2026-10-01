import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

const searchSchema = z.object({
    // base64 of the file path to hand off to this window
    path: z.string().optional(),
    // this run's launch id, proving the window belongs to the current launch (keeps the session)
    launch: z.string().optional(),
})

export const Route = createFileRoute("/popout-player/")({
    validateSearch: searchSchema,
})
