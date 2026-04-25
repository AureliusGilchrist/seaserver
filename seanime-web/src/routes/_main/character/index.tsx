import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"

const searchSchema = z.object({
    id: z.coerce.number().optional(),
})

export const Route = createFileRoute("/_main/character/")({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ id: search.id }),
    loader: async ({ deps }) => {
        if (!deps.id) {
            throw redirect({ to: "/" })
        }
    },
})
