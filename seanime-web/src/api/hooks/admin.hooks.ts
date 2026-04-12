import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { Status } from "@/api/generated/types"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export type PlanningSlutInfo = {
    name: string
    avatar?: string
}

export type AdminAnnouncement = {
    id: number
    message: string
    createdBy: number
    createdAt?: string
    updatedAt?: string
    expiresAt: string
}

const ADMIN_ANNOUNCEMENTS_QUERY_KEY = ["admin-announcements"]
const ALL_ADMIN_ANNOUNCEMENTS_QUERY_KEY = ["admin-announcements-all"]
const PLANNING_SLUT_INFO_QUERY_KEY = ["planning-slut-info"]

export function useGetPlanningSlutInfo(enabled = true) {
    return useServerQuery<PlanningSlutInfo>({
        endpoint: "/api/v1/planning-slut/info",
        method: "GET",
        queryKey: PLANNING_SLUT_INFO_QUERY_KEY,
        enabled,
        retry: false,
    })
}

export function useSavePlanningSlutToken() {
    const qc = useQueryClient()

    return useServerMutation<Status, { token: string }>({
        endpoint: "/api/v1/planning-slut/token",
        method: "POST",
        mutationKey: ["save-planning-slut-token"],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: PLANNING_SLUT_INFO_QUERY_KEY })
            toast.success("Shared AniList account saved")
        },
    })
}

export function useDeletePlanningSlutToken() {
    const qc = useQueryClient()

    return useServerMutation<Status>({
        endpoint: "/api/v1/planning-slut/token",
        method: "DELETE",
        mutationKey: ["delete-planning-slut-token"],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: PLANNING_SLUT_INFO_QUERY_KEY })
            toast.success("Shared AniList account removed")
        },
    })
}

export function useGetAdminAnnouncements(enabled = true) {
    return useServerQuery<AdminAnnouncement[]>({
        endpoint: "/api/v1/admin/announcements",
        method: "GET",
        queryKey: ADMIN_ANNOUNCEMENTS_QUERY_KEY,
        enabled,
        retry: 1,
    })
}

export function useGetAllAdminAnnouncements(enabled = true) {
    return useServerQuery<AdminAnnouncement[]>({
        endpoint: "/api/v1/admin/announcements/all",
        method: "GET",
        queryKey: ALL_ADMIN_ANNOUNCEMENTS_QUERY_KEY,
        enabled,
        retry: 1,
    })
}

export function useCreateAdminAnnouncement() {
    const qc = useQueryClient()

    return useServerMutation<AdminAnnouncement, { message: string, durationHours: number }>({
        endpoint: "/api/v1/admin/announcements",
        method: "POST",
        mutationKey: ["create-admin-announcement"],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ADMIN_ANNOUNCEMENTS_QUERY_KEY })
            await qc.invalidateQueries({ queryKey: ALL_ADMIN_ANNOUNCEMENTS_QUERY_KEY })
            toast.success("Announcement created")
        },
    })
}

export function useDismissAdminAnnouncement() {
    const qc = useQueryClient()

    return useServerMutation<boolean, { id: number }>({
        endpoint: "",
        method: "POST",
        mutationKey: ["dismiss-admin-announcement"],
        mutationFn: async variables => {
            return (await import("@/api/client/requests")).buildSeaQuery<boolean, undefined>({
                endpoint: `/api/v1/admin/announcements/${variables.id}/dismiss`,
                method: "POST",
            })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ADMIN_ANNOUNCEMENTS_QUERY_KEY })
        },
    })
}

export function useDeleteAdminAnnouncement() {
    const qc = useQueryClient()

    return useServerMutation<boolean, { id: number }>({
        endpoint: "",
        method: "DELETE",
        mutationKey: ["delete-admin-announcement"],
        mutationFn: async variables => {
            return (await import("@/api/client/requests")).buildSeaQuery<boolean, undefined>({
                endpoint: `/api/v1/admin/announcements/${variables.id}`,
                method: "DELETE",
            })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ADMIN_ANNOUNCEMENTS_QUERY_KEY })
            await qc.invalidateQueries({ queryKey: ALL_ADMIN_ANNOUNCEMENTS_QUERY_KEY })
            toast.success("Announcement deleted")
        },
    })
}