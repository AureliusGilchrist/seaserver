import { atom } from "jotai"

// List saves in flight, by media id: "saving" while the request is out, "done" for a moment after
// AniList accepted it (the check that flashes under the list status), "queued" when the server
// took it but AniList hasn't yet — the queue it went to is what useAnilistEditQueue reads.
export type AnilistSaveState = "saving" | "done" | "queued"

export const anilistSaveStateAtom = atom<Record<number, AnilistSaveState>>({})
