import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

const searchSchema = z.object({
    // base64 of the file path to hand off to this window
    path: z.string().optional(),
})

export const Route = createFileRoute("/_main/popout-player/")({
    validateSearch: searchSchema,
})
