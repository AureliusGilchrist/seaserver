import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// Global volume state (10% default)
export const globalVolumeAtom = atomWithStorage<number>("pv-global-volume", 0.1)

// Global mute state
export const globalMuteAtom = atomWithStorage<boolean>("pv-global-mute", false)

// Actions atom
export const pvVolumeActionsAtom = atom(
  null,
  (get, set, action: { type: 'setGlobalVolume'; volume: number } | { type: 'setGlobalMute'; muted: boolean }) => {
    if (action.type === 'setGlobalVolume') {
      set(globalVolumeAtom, action.volume)
    } else if (action.type === 'setGlobalMute') {
      set(globalMuteAtom, action.muted)
    }
  }
)
