import { useServerQuery } from "@/api/client/requests"

type VideoCore_InSightCharacterDetails = { [key: string]: any }

export function useVideoCoreInSightGetCharacterDetails(malId: number) {
    return useServerQuery<VideoCore_InSightCharacterDetails>({
        endpoint: `/api/v1/videocore/insight/character-details/${malId}`,
        method: "GET",
        queryKey: ["VideoCoreInSightGetCharacterDetails", malId],
    })
}
