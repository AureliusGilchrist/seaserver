import { buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { AL_MangaDetailsById_Media, Manga_Entry } from "@/api/generated/types"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"

const searchSchema = z.object({
    id: z.coerce.number().optional(),
})

export const Route = createFileRoute("/_main/manga/entry/")({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ id: search.id }),
    loader: async ({ context, deps }) => {
        const { id } = deps
        if (!id) {
            throw redirect({ to: "/" })
        }

        const serverAuthToken = context.store.get(serverAuthTokenAtom)
        const profileToken = context.store.get(profileSessionTokenAtom)

        // Fire prefetches in the background — don't block navigation.
        void context.queryClient.prefetchQuery({
            queryKey: [API_ENDPOINTS.MANGA.GetMangaEntry.key, String(id)],
            queryFn: () => buildSeaQuery<Manga_Entry>({
                endpoint: API_ENDPOINTS.MANGA.GetMangaEntry.endpoint.replace("{id}", String(id)),
                method: API_ENDPOINTS.MANGA.GetMangaEntry.methods[0],
                password: serverAuthToken,
                profileToken: profileToken ?? undefined,
            }) as Promise<Manga_Entry>,
            staleTime: 2 * 60 * 1000,
        })
        void context.queryClient.prefetchQuery({
            queryKey: [API_ENDPOINTS.MANGA.GetMangaEntryDetails.key, String(id)],
            queryFn: () => buildSeaQuery<AL_MangaDetailsById_Media>({
                endpoint: API_ENDPOINTS.MANGA.GetMangaEntryDetails.endpoint.replace("{id}", String(id)),
                method: API_ENDPOINTS.MANGA.GetMangaEntryDetails.methods[0],
                password: serverAuthToken,
                profileToken: profileToken ?? undefined,
            }) as Promise<AL_MangaDetailsById_Media>,
            staleTime: 2 * 60 * 1000,
        })
    },
})
