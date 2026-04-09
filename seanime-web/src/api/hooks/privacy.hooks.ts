import { useServerMutation, useServerQuery } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

// Types matching the Go backend privacy.Settings and privacy.PrivacyStatus
export type PrivacySettings = {
    dohEnabled: boolean
    dohProviders: string[]
    socks5Enabled: boolean
    socks5Address: string
    socks5Port: number
    dnsCryptEnabled: boolean
    failMode: string // "open" | "closed"
}

export type DNSCryptStatus = {
    installed: boolean
    running: boolean
}

export type PrivacyStatus = {
    settings: PrivacySettings
    dnsCrypt: DNSCryptStatus
    activeDoHProvider: string
}

export type ConnectionTestResult = {
    dohWorking: boolean
    dohProvider: string
    socks5Working: boolean
    dnsCryptRunning: boolean
}

export function useGetPrivacySettings(enabled?: boolean) {
    return useServerQuery<PrivacyStatus>({
        endpoint: API_ENDPOINTS.PRIVACY.GetPrivacySettings.endpoint,
        method: API_ENDPOINTS.PRIVACY.GetPrivacySettings.methods[0],
        queryKey: [API_ENDPOINTS.PRIVACY.GetPrivacySettings.key],
        enabled: enabled,
    })
}

export function useSavePrivacySettings() {
    const qc = useQueryClient()
    return useServerMutation<PrivacyStatus, { settings: PrivacySettings }>({
        endpoint: API_ENDPOINTS.PRIVACY.SavePrivacySettings.endpoint,
        method: API_ENDPOINTS.PRIVACY.SavePrivacySettings.methods[0],
        mutationKey: [API_ENDPOINTS.PRIVACY.SavePrivacySettings.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PRIVACY.GetPrivacySettings.key] })
            toast.success("Privacy settings saved")
        },
    })
}

export function useTestPrivacyConnection() {
    return useServerMutation<ConnectionTestResult, void>({
        endpoint: API_ENDPOINTS.PRIVACY.TestPrivacyConnection.endpoint,
        method: API_ENDPOINTS.PRIVACY.TestPrivacyConnection.methods[0],
        mutationKey: [API_ENDPOINTS.PRIVACY.TestPrivacyConnection.key],
    })
}

export function useInstallDNSCrypt() {
    const qc = useQueryClient()
    return useServerMutation<boolean, void>({
        endpoint: API_ENDPOINTS.PRIVACY.InstallDNSCrypt.endpoint,
        method: API_ENDPOINTS.PRIVACY.InstallDNSCrypt.methods[0],
        mutationKey: [API_ENDPOINTS.PRIVACY.InstallDNSCrypt.key],
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [API_ENDPOINTS.PRIVACY.GetPrivacySettings.key] })
            toast.success("DNSCrypt-proxy installed")
        },
    })
}
