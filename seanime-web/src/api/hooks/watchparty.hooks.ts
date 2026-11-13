import { useServerMutation, useServerQuery } from "../client/requests"
import {
    WatchPartyChatHistory_Variables,
    WatchPartyCreate_Variables,
    WatchPartyHistory_Variables,
    WatchPartyJoin_Variables,
    WatchPartyLeave_Variables,
    WatchPartyPassRemote_Variables,
    WatchPartyRequestRemote_Variables,
    WatchPartySendChat_Variables,
    WatchPartyStop_Variables,
} from "../generated/endpoint.types"
import { API_ENDPOINTS } from "../generated/endpoints"
import { WatchParty_ChatMessage, WatchParty_HistoryItem, WatchParty_Session } from "../generated/types"

/** Every open watch party room on this server, oldest first. */
export function useWatchPartyStatus(enabled: boolean = true) {
    return useServerQuery<Array<WatchParty_Session> | null>({
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
    return useServerMutation<boolean, WatchPartyLeave_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyLeave.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyLeave.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyLeave.key],
    })
}

export function useWatchPartyStop() {
    return useServerMutation<boolean, WatchPartyStop_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyStop.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyStop.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyStop.key],
    })
}

export function useWatchPartyPassRemote() {
    return useServerMutation<WatchParty_Session | null, WatchPartyPassRemote_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyPassRemote.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyPassRemote.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyPassRemote.key],
    })
}

export function useWatchPartyRequestRemote() {
    return useServerMutation<boolean, WatchPartyRequestRemote_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyRequestRemote.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyRequestRemote.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyRequestRemote.key],
    })
}

export function useWatchPartySendChat() {
    return useServerMutation<WatchParty_ChatMessage, WatchPartySendChat_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartySendChat.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartySendChat.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartySendChat.key],
    })
}

export function useWatchPartyChatHistory() {
    return useServerMutation<Array<WatchParty_ChatMessage>, WatchPartyChatHistory_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyChatHistory.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyChatHistory.methods[0],
        mutationKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyChatHistory.key],
    })
}

/** The episodes a profile watched in watch parties, newest first. profileId 0 = me. */
export function useWatchPartyHistory(profileId: number, enabled: boolean = true) {
    return useServerQuery<Array<WatchParty_HistoryItem>, WatchPartyHistory_Variables>({
        endpoint: API_ENDPOINTS.WATCHPARTY.WatchPartyHistory.endpoint,
        method: API_ENDPOINTS.WATCHPARTY.WatchPartyHistory.methods[0],
        queryKey: [API_ENDPOINTS.WATCHPARTY.WatchPartyHistory.key, profileId],
        data: { profileId, limit: 200 },
        enabled,
    })
}
