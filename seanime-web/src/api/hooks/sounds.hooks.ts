"use client"
import { buildSeaQuery, useServerMutation, useServerQuery } from "@/api/client/requests"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"

export const SOUND_TRACKS_KEY = "sound-tracks-list"
export const SOUND_PLAYLISTS_KEY = "sound-playlists-list"

// --- Types ---

export type SoundTrack = {
    id: number
    uuid: string
    filename: string
    title: string
    artist: string
    iaIdentifier: string
    iaFilename: string
    durationSec: number
    fileSizeBytes: number
    format: string
    createdAt: string
    updatedAt: string
    /** Always present in list responses. e.g. "/sounds-cache/{filename}". */
    url: string
}

export type SoundPlaylist = {
    id: number
    name: string
    trackUuids: string[]
    createdAt: string
    updatedAt: string
}

export type IASearchDoc = {
    identifier: string
    title?: string
    creator?: string | string[]
    downloads?: number
    year?: string | number
    subject?: string | string[]
}

export type IASearchResponse = {
    response: {
        numFound: number
        start: number
        docs: IASearchDoc[]
    }
    responseHeader?: {
        params?: {
            rows?: number
        }
    }
}

export type IAFile = {
    name: string
    format: string
    ext: string
    durationSec: number
    sizeBytes: number
}

export type IAFilesResponse = {
    identifier: string
    title: string
    creator: string
    files: IAFile[]
}

export type DownloadSoundResponse = {
    track: SoundTrack
    url: string
}

// --- Search / metadata (Internet Archive) ---

export function useSearchSounds(q: string, page: number, enabled: boolean) {
    const ep = `/api/v1/sounds/search?q=${encodeURIComponent(q)}&page=${page}`
    return useServerQuery<IASearchResponse>({
        endpoint: ep,
        method: "GET",
        queryKey: ["sounds-search", q, page],
        enabled,
        staleTime: 10 * 60 * 1000,
        retry: false,
    })
}

export function useGetSoundFiles(identifier: string, enabled: boolean) {
    return useServerQuery<IAFilesResponse>({
        endpoint: `/api/v1/sounds/files?identifier=${encodeURIComponent(identifier)}`,
        method: "GET",
        queryKey: ["sound-files", identifier],
        enabled: enabled && !!identifier,
        staleTime: 10 * 60 * 1000,
        retry: false,
    })
}

// --- Local downloaded tracks ---

export function useListSoundTracks() {
    return useServerQuery<SoundTrack[]>({
        endpoint: "/api/v1/sounds",
        method: "GET",
        queryKey: [SOUND_TRACKS_KEY],
    })
}

export function useDownloadSoundTrack() {
    const queryClient = useQueryClient()
    return useServerMutation<DownloadSoundResponse, {
        identifier: string
        filename: string
        title?: string
        artist?: string
        format?: string
        durationSec?: number
    }>({
        endpoint: "/api/v1/sounds/download",
        method: "POST",
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [SOUND_TRACKS_KEY] })
        },
    })
}

export function useDeleteSoundTrack() {
    const queryClient = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    return useMutation<boolean | undefined, Error, string>({
        mutationFn: async (uuid: string) => {
            return buildSeaQuery<boolean>({
                endpoint: `/api/v1/sounds/${encodeURIComponent(uuid)}`,
                method: "DELETE",
                password,
                profileToken,
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [SOUND_TRACKS_KEY] })
            queryClient.invalidateQueries({ queryKey: [SOUND_PLAYLISTS_KEY] })
        },
    })
}

// --- Playlists (server-shared) ---

export function useListSoundPlaylists() {
    return useServerQuery<SoundPlaylist[]>({
        endpoint: "/api/v1/sounds/playlists",
        method: "GET",
        queryKey: [SOUND_PLAYLISTS_KEY],
    })
}

export function useCreateSoundPlaylist() {
    const queryClient = useQueryClient()
    return useServerMutation<SoundPlaylist, { name: string; trackUuids: string[] }>({
        endpoint: "/api/v1/sounds/playlists",
        method: "POST",
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [SOUND_PLAYLISTS_KEY] })
        },
    })
}

export function useUpdateSoundPlaylist() {
    const queryClient = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    return useMutation<SoundPlaylist | undefined, Error, { id: number; name: string; trackUuids: string[] }>({
        mutationFn: async ({ id, ...rest }) => {
            return buildSeaQuery<SoundPlaylist>({
                endpoint: `/api/v1/sounds/playlists/${id}`,
                method: "PATCH",
                data: rest,
                password,
                profileToken,
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [SOUND_PLAYLISTS_KEY] })
        },
    })
}

export function useDeleteSoundPlaylist() {
    const queryClient = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    return useMutation<boolean | undefined, Error, number>({
        mutationFn: async (id: number) => {
            return buildSeaQuery<boolean>({
                endpoint: `/api/v1/sounds/playlists/${id}`,
                method: "DELETE",
                password,
                profileToken,
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [SOUND_PLAYLISTS_KEY] })
        },
    })
}
