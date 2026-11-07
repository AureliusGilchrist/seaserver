import type { Anime_LibraryCollection } from "@/api/generated/types"

export type LibrarySnapshot = {
    scope: string
    fingerprint: string
    collection: Anime_LibraryCollection
}

export type CompactLibraryResponse = {
    fingerprint: string
    unchanged: boolean
    collection?: Anime_LibraryCollection
}

export function resolveLibraryResponse(
    response: Anime_LibraryCollection | CompactLibraryResponse | undefined,
    previous: LibrarySnapshot | null,
    scope: string,
): { collection: Anime_LibraryCollection, snapshot: LibrarySnapshot | null } {
    if (!response) throw new Error("Library response is missing its collection")
    if (!("fingerprint" in response)) return { collection: response, snapshot: null }
    if (!response.fingerprint) throw new Error("Invalid compact library response")
    if (response.unchanged && (!previous || previous.scope !== scope || previous.fingerprint !== response.fingerprint)) {
        throw new Error("Compact library response does not match the saved collection")
    }
    const collection = response.unchanged ? previous?.collection : response.collection
    if (!collection) throw new Error("Compact library response is missing its collection")
    return { collection, snapshot: { scope, fingerprint: response.fingerprint, collection } }
}
