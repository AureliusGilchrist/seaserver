import { atom } from "jotai"

export type AnimeEntryPageView = "library" | "torrentstream" | "debridstream" | "onlinestream" | "localplayer" | "themes"

export const __anime_entryPageViewAtom = atom<AnimeEntryPageView>("library")
