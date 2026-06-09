import { useServerMutation } from "../client/requests"
import { DirectstreamConvertSubs_Variables, DirectstreamPlayLocalFile_Variables } from "../generated/endpoint.types"
import { API_ENDPOINTS } from "../generated/endpoints"
import { Mediastream_MediaContainer } from "../generated/types"

export function useDirectstreamPlayLocalFile() {
    return useServerMutation<Mediastream_MediaContainer, DirectstreamPlayLocalFile_Variables>({
        endpoint: API_ENDPOINTS.DIRECTSTREAM.DirectstreamPlayLocalFile.endpoint,
        method: API_ENDPOINTS.DIRECTSTREAM.DirectstreamPlayLocalFile.methods[0],
        mutationKey: [API_ENDPOINTS.DIRECTSTREAM.DirectstreamPlayLocalFile.key],
        onSuccess: async () => {

        },
    })
}

export function useDirectstreamConvertSubs() {
    return useServerMutation<string, DirectstreamConvertSubs_Variables>({
        endpoint: API_ENDPOINTS.DIRECTSTREAM.DirectstreamConvertSubs.endpoint,
        method: API_ENDPOINTS.DIRECTSTREAM.DirectstreamConvertSubs.methods[0],
        mutationKey: [API_ENDPOINTS.DIRECTSTREAM.DirectstreamConvertSubs.key],
        onSuccess: async (data) => {
        },
        // Override the default error toast. Subtitle fetch/convert failures are expected for
        // some sources (e.g. Cloudflare-challenged CDNs) and are handled gracefully by the
        // caller (the track stays listed and selectable). The per-call onError still rejects
        // the promise so the caption manager can react; we just avoid spamming a toast on
        // every episode load.
        onError: () => {
        },
    })
}
