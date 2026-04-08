import { useServerQuery } from "@/api/client/requests"
import { VideoCore_InSightCharacterDetails } from "@/api/generated/types"

export function useVideoCoreInSightGetCharacterDetails(malId: number) {
    return useServerQuery<VideoCore_InSightCharacterDetails>({
        endpoint: `/api/v1/videocore/insight/character-details/${malId}`,
        method: "GET",
        queryKey: ["VideoCoreInSightGetCharacterDetails", malId],
    })
}
