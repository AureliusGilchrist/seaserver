import { vc_castModalOpen, vc_menuOpen, vc_playlistHoverCardsOpen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_progressPrompt } from "@/app/(main)/_features/video-core/video-core-auto-progress"
import { vc_inSight_open } from "@/app/(main)/_features/video-core/video-core-in-sight"
import { videoCorePreferencesModalAtom } from "@/app/(main)/_features/video-core/video-core-preferences"
import { vc_sequelPrompt, vc_stillWatchingPrompt } from "@/app/(main)/_features/video-core/video-core-watching-checks"
import { vc_resumePrompt } from "@/app/(main)/_features/video-core/video-core.atoms"
import { atom } from "jotai"

/**
 * True while anything the user has to point at is open over the player: menus (including the
 * episode list and watch-party chat, which use vc_menuOpen), modals, popovers and prompts.
 * While it is true the cursor is always shown, even if a right-click hid it.
 */
export const vc_popupOpen = atom(get => {
    return !!get(vc_menuOpen)
        || get(videoCorePreferencesModalAtom)
        || get(vc_castModalOpen)
        || get(vc_inSight_open)
        || get(vc_playlistHoverCardsOpen) > 0
        || !!get(vc_progressPrompt)
        || !!get(vc_sequelPrompt)
        || !!get(vc_stillWatchingPrompt)
        || !!get(vc_resumePrompt)
})
