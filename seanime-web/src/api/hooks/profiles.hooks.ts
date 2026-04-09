import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { MigrationStatus, ProfileLoginResponse, ProfileSummary } from "@/api/generated/types"
import { currentProfileAtom, profileSessionTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"
import { toast } from "sonner"

export function useGetProfiles(enabled?: boolean) {
    return useServerQuery<ProfileSummary[]>({
        endpoint: API_ENDPOINTS.PROFILES.GetProfiles.endpoint,
        method: API_ENDPOINTS.PROFILES.GetProfiles.methods[0],
        queryKey: [API_ENDPOINTS.PROFILES.GetProfiles.key],
        enabled: enabled,
    })
}

export function useGetCurrentProfile(enabled?: boolean) {
    return useServerQuery<ProfileSummary>({
        endpoint: API_ENDPOINTS.PROFILES.GetCurrentProfile.endpoint,
        method: API_ENDPOINTS.PROFILES.GetCurrentProfile.methods[0],
        queryKey: [API_ENDPOINTS.PROFILES.GetCurrentProfile.key],
        enabled: enabled,
    })
}

export function useProfileLogin() {
    const qc = useQueryClient()
    const setProfileToken = useSetAtom(profileSessionTokenAtom)
    const setCurrentProfile = useSetAtom(currentProfileAtom)

    return useServerMutation<ProfileLoginResponse, { profileId: number; pin: string }>({
        endpoint: API_ENDPOINTS.PROFILES.LoginProfile.endpoint,
        method: API_ENDPOINTS.PROFILES.LoginProfile.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILES.LoginProfile.key],
        onSuccess: async (data) => {
            if (data) {
                setProfileToken(data.token)
                setCurrentProfile(data.profile)
                await qc.invalidateQueries()
                toast.success(`Welcome, ${data.profile.name}`)
            }
        },
    })
}

export function useProfileLogout() {
    const qc = useQueryClient()
    const setProfileToken = useSetAtom(profileSessionTokenAtom)
    const setCurrentProfile = useSetAtom(currentProfileAtom)

    return useServerMutation<boolean, void>({
        endpoint: API_ENDPOINTS.PROFILES.LogoutProfile.endpoint,
        method: API_ENDPOINTS.PROFILES.LogoutProfile.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILES.LogoutProfile.key],
        onSuccess: async () => {
            setProfileToken(undefined)
            setCurrentProfile(undefined)
            await qc.invalidateQueries()
        },
    })
}

export function useCreateProfile() {
    const qc = useQueryClient()
    return useServerMutation<ProfileSummary, { name: string; pin: string; isAdmin: boolean }>({
        endpoint: API_ENDPOINTS.PROFILES.CreateProfile.endpoint,
        method: API_ENDPOINTS.PROFILES.CreateProfile.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILES.CreateProfile.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILES.GetProfiles.key] })
            toast.success("Profile created")
        },
    })
}

export function useUpdateProfile(id: number) {
    const qc = useQueryClient()
    return useServerMutation<ProfileSummary, { name?: string; pin?: string; isAdmin?: boolean }>({
        endpoint: API_ENDPOINTS.PROFILES.UpdateProfile.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.PROFILES.UpdateProfile.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILES.UpdateProfile.key, id],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILES.GetProfiles.key] })
            toast.success("Profile updated")
        },
    })
}

export function useDeleteProfile(id: number) {
    const qc = useQueryClient()
    return useServerMutation<boolean, void>({
        endpoint: API_ENDPOINTS.PROFILES.DeleteProfile.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.PROFILES.DeleteProfile.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILES.DeleteProfile.key, id],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILES.GetProfiles.key] })
            toast.success("Profile deleted")
        },
    })
}

export function useGetMigrationStatus(enabled?: boolean) {
    return useServerQuery<MigrationStatus>({
        endpoint: API_ENDPOINTS.PROFILES.GetMigrationStatus.endpoint,
        method: API_ENDPOINTS.PROFILES.GetMigrationStatus.methods[0],
        queryKey: [API_ENDPOINTS.PROFILES.GetMigrationStatus.key],
        enabled: enabled,
    })
}

export function useRunMigration() {
    const qc = useQueryClient()
    return useServerMutation<MigrationStatus, { profileName: string; pin: string }>({
        endpoint: API_ENDPOINTS.PROFILES.RunMigration.endpoint,
        method: API_ENDPOINTS.PROFILES.RunMigration.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILES.RunMigration.key],
        onSuccess: async () => {
            await qc.invalidateQueries()
            toast.success("Migration complete")
        },
    })
}

export function useSkipMigration() {
    const qc = useQueryClient()
    return useServerMutation<boolean, void>({
        endpoint: API_ENDPOINTS.PROFILES.SkipMigration.endpoint,
        method: API_ENDPOINTS.PROFILES.SkipMigration.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILES.SkipMigration.key],
        onSuccess: async () => {
            await qc.invalidateQueries()
        },
    })
}

export function useGetAllowedLibraryPaths(enabled?: boolean) {
    return useServerQuery<string[]>({
        endpoint: API_ENDPOINTS.PROFILES.GetAllowedLibraryPaths.endpoint,
        method: API_ENDPOINTS.PROFILES.GetAllowedLibraryPaths.methods[0],
        queryKey: [API_ENDPOINTS.PROFILES.GetAllowedLibraryPaths.key],
        enabled: enabled,
    })
}

export function useSetAllowedLibraryPaths() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { paths: string[] }>({
        endpoint: API_ENDPOINTS.PROFILES.SetAllowedLibraryPaths.endpoint,
        method: API_ENDPOINTS.PROFILES.SetAllowedLibraryPaths.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILES.SetAllowedLibraryPaths.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILES.GetAllowedLibraryPaths.key] })
            toast.success("Library paths updated")
        },
    })
}
