import { buildSeaQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { AL_AnimeDetailsById_Media, Anime_Entry } from "@/api/generated/types"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"

const searchSchema = z.object({
    id: z.coerce.number().optional(),
    tab: z.string().optional(),
})

export const Route = createFileRoute("/_main/entry/")({
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
        // The page components handle their own loading states.
        void context.queryClient.prefetchQuery({
            queryKey: [API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.key, String(id)],
            queryFn: () => buildSeaQuery<Anime_Entry>({
                endpoint: API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.endpoint.replace("{id}", String(id)),
                method: API_ENDPOINTS.ANIME_ENTRIES.GetAnimeEntry.methods[0],
                password: serverAuthToken,
                profileToken: profileToken ?? undefined,
            }) as Promise<Anime_Entry>,
            staleTime: 2 * 60 * 1000,
        })
        void context.queryClient.prefetchQuery({
            queryKey: [API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.key, String(id)],
            queryFn: () => buildSeaQuery<AL_AnimeDetailsById_Media>({
                endpoint: API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.endpoint.replace("{id}", String(id)),
                method: API_ENDPOINTS.ANILIST.GetAnilistAnimeDetails.methods[0],
                password: serverAuthToken,
                profileToken: profileToken ?? undefined,
            }) as Promise<AL_AnimeDetailsById_Media>,
            staleTime: 2 * 60 * 1000,
        })
    },
})
