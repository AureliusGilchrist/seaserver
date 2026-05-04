"use client"
import { buildSeaQuery, useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { profileSessionTokenAtom, serverAuthTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"

export const THEME_BG_LIST_KEY = "theme-backgrounds-list"

export type ThemeBgFile = {
    filename: string
    url: string
}

export type ThemeBgListResponse = {
    files: ThemeBgFile[]
    userCount: number
    limit: number
}

export type WallhavenThumb = {
    large: string
    original: string
    small: string
}

export type WallhavenWallpaper = {
    id: string
    url: string
    path: string
    short_url: string
    resolution: string
    dimension_x: number
    dimension_y: number
    file_type: string
    thumbs: WallhavenThumb
}

export type WallhavenMeta = {
    current_page: number
    last_page: number
    per_page: number
    total: number
}

export type WallhavenSearchResponse = {
    data: WallhavenWallpaper[]
    meta: WallhavenMeta
}

export function useListThemeBackgrounds() {
    return useServerQuery<ThemeBgFile[]>({
        endpoint: API_ENDPOINTS.THEME_BACKGROUNDS.ListThemeBackgrounds.endpoint,
        method: "GET",
        queryKey: [THEME_BG_LIST_KEY],
    })
}

export function useDownloadThemeBackground() {
    const queryClient = useQueryClient()
    return useServerMutation<ThemeBgFile, { url: string; themeId?: string }>({
        endpoint: API_ENDPOINTS.THEME_BACKGROUNDS.DownloadThemeBackground.endpoint,
        method: "POST",
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [THEME_BG_LIST_KEY] })
        },
    })
}

export function useDeleteThemeBackground() {
    const queryClient = useQueryClient()
    const password = useAtomValue(serverAuthTokenAtom)
    const profileToken = useAtomValue(profileSessionTokenAtom)
    return useMutation<boolean | undefined, Error, string>({
        mutationFn: async (filename: string) => {
            return buildSeaQuery<boolean>({
                endpoint: `/api/v1/theme-backgrounds/${encodeURIComponent(filename)}`,
                method: "DELETE",
                password,
                profileToken,
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [THEME_BG_LIST_KEY] })
        },
    })
}

export function useSearchWallhaven(q: string, page: number, enabled: boolean) {
    const ep = `${API_ENDPOINTS.THEME_BACKGROUNDS.SearchWallhaven.endpoint}?q=${encodeURIComponent(q)}&page=${page}`
    return useServerQuery<WallhavenSearchResponse>({
        endpoint: ep,
        method: "GET",
        queryKey: ["wallhaven-search", q, page],
        enabled: enabled && !!q,
        staleTime: 10 * 60 * 1000,
        retry: false,
    })
}
