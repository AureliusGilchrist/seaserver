import { seaJotaiStorage } from "@/lib/sea-storage/sea-storage"
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { CursorSlot, SelectedSlots } from "./types"

export const selectedSlotsAtom = atomWithStorage<SelectedSlots>(
    "sea-cursor-library-slots",
    {},
    seaJotaiStorage,
)

export const activeSlotEditAtom = atom<CursorSlot>("default")
