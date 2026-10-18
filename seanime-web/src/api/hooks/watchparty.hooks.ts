import { useServerMutation, useServerQuery } from "../client/requests"
import {
    WatchPartyCreate_Variables,
    WatchPartyJoin_Variables,
    WatchPartyLeave_Variables,
    WatchPartyStop_Variables,
} from "../generated/endpoint.types"
import { API_ENDPOINTS } from "../generated/endpoints"
import { WatchParty_Session } from "../generated/types"

export function useWatchPartyStatus(enabled: boolean = true) {
    return useServerQuery<WatchParty_Session | null>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyStatus.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyStatus.methods[0],
        queryKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyStatus.key],
        enabled,
    })
}

export function useWatchPartyCreate() {
    return useServerMutation<WatchParty_Session | null, WatchPartyCreate_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyCreate.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyCreate.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyCreate.key],
    })
}

export function useWatchPartyJoin() {
    return useServerMutation<WatchParty_Session | null, WatchPartyJoin_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyJoin.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyJoin.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyJoin.key],
    })
}

export function useWatchPartyLeave() {
    return useServerMutation<WatchParty_Session | null, WatchPartyLeave_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyLeave.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyLeave.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyLeave.key],
    })
}

export function useWatchPartyStop() {
    return useServerMutation<WatchParty_Session | null, WatchPartyStop_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyStop.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyStop.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyStop.key],
    })
}
