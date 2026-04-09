import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { INTERNAL_MigrationStatus as MigrationStatus, INTERNAL_ProfileSummary as ProfileSummary } from "@/api/generated/types"

type ProfileLoginResponse = { token: string; profile: ProfileSummary }
import { currentProfileAtom, profileSessionTokenAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"
import { toast } from "sonner"

export function useGetProfiles(enabled?: boolean) {
    return useServerQuery<ProfileSummary[]>({
        endpoint: API_ENDPOINTS.PROFILE.GetProfiles.endpoint,
        method: API_ENDPOINTS.PROFILE.GetProfiles.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE.GetProfiles.key],
        enabled: enabled,
    })
}

export function useGetCurrentProfile(enabled?: boolean) {
    return useServerQuery<ProfileSummary>({
        endpoint: API_ENDPOINTS.PROFILE.GetCurrentProfile.endpoint,
        method: API_ENDPOINTS.PROFILE.GetCurrentProfile.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE.GetCurrentProfile.key],
        enabled: enabled,
    })
}

export function useProfileLogin() {
    const qc = useQueryClient()
    const setProfileToken = useSetAtom(profileSessionTokenAtom)
    const setCurrentProfile = useSetAtom(currentProfileAtom)

    return useServerMutation<ProfileLoginResponse, { profileId: number; pin: string }>({
        endpoint: API_ENDPOINTS.PROFILE.ProfileLogin.endpoint,
        method: API_ENDPOINTS.PROFILE.ProfileLogin.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE.ProfileLogin.key],
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
        endpoint: API_ENDPOINTS.PROFILE.ProfileLogout.endpoint,
        method: API_ENDPOINTS.PROFILE.ProfileLogout.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE.ProfileLogout.key],
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
        endpoint: API_ENDPOINTS.PROFILE.CreateProfile.endpoint,
        method: API_ENDPOINTS.PROFILE.CreateProfile.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE.CreateProfile.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILE.GetProfiles.key] })
            toast.success("Profile created")
        },
    })
}

export function useUpdateProfile(id: number) {
    const qc = useQueryClient()
    return useServerMutation<ProfileSummary, { name?: string; pin?: string; isAdmin?: boolean }>({
        endpoint: API_ENDPOINTS.PROFILE.UpdateProfile.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.PROFILE.UpdateProfile.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE.UpdateProfile.key, id],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILE.GetProfiles.key] })
            toast.success("Profile updated")
        },
    })
}

export function useDeleteProfile(id: number) {
    const qc = useQueryClient()
    return useServerMutation<boolean, void>({
        endpoint: API_ENDPOINTS.PROFILE.DeleteProfile.endpoint.replace("{id}", String(id)),
        method: API_ENDPOINTS.PROFILE.DeleteProfile.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE.DeleteProfile.key, id],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILE.GetProfiles.key] })
            toast.success("Profile deleted")
        },
    })
}

export function useGetMigrationStatus(enabled?: boolean) {
    return useServerQuery<MigrationStatus>({
        endpoint: API_ENDPOINTS.PROFILE.GetMigrationStatus.endpoint,
        method: API_ENDPOINTS.PROFILE.GetMigrationStatus.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE.GetMigrationStatus.key],
        enabled: enabled,
    })
}

export function useRunMigration() {
    const qc = useQueryClient()
    return useServerMutation<MigrationStatus, { profileName: string; pin: string }>({
        endpoint: API_ENDPOINTS.PROFILE.RunMigration.endpoint,
        method: API_ENDPOINTS.PROFILE.RunMigration.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE.RunMigration.key],
        onSuccess: async () => {
            await qc.invalidateQueries()
            toast.success("Migration complete")
        },
    })
}

export function useSkipMigration() {
    const qc = useQueryClient()
    return useServerMutation<boolean, void>({
        endpoint: API_ENDPOINTS.PROFILE.SkipMigration.endpoint,
        method: API_ENDPOINTS.PROFILE.SkipMigration.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE.SkipMigration.key],
        onSuccess: async () => {
            await qc.invalidateQueries()
        },
    })
}

export function useGetAllowedLibraryPaths(enabled?: boolean) {
    return useServerQuery<string[]>({
        endpoint: API_ENDPOINTS.PROFILE.GetAllowedLibraryPaths.endpoint,
        method: API_ENDPOINTS.PROFILE.GetAllowedLibraryPaths.methods[0],
        queryKey: [API_ENDPOINTS.PROFILE.GetAllowedLibraryPaths.key],
        enabled: enabled,
    })
}

export function useSetAllowedLibraryPaths() {
    const qc = useQueryClient()
    return useServerMutation<boolean, { paths: string[] }>({
        endpoint: API_ENDPOINTS.PROFILE.SetAllowedLibraryPaths.endpoint,
        method: API_ENDPOINTS.PROFILE.SetAllowedLibraryPaths.methods[0],
        mutationKey: [API_ENDPOINTS.PROFILE.SetAllowedLibraryPaths.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PROFILE.GetAllowedLibraryPaths.key] })
            toast.success("Library paths updated")
        },
    })
}
