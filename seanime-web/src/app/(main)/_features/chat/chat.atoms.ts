import { atom } from "jotai"

/**
 * The unlocked ECDH private key for this browser session. Kept in memory only —
 * closing the tab or locking the chat clears it, which is what makes the PIN
 * gate meaningful. Never persisted.
 */
export const chatPrivateKeyAtom = atom<CryptoKey | null>(null)

/** Whether the chat modal is open. */
export const chatModalOpenAtom = atom<boolean>(false)

/**
 * Profile id currently open in the thread view. Undefined = conversation list.
 */
export const chatActivePeerAtom = atom<number | undefined>(undefined)

/**
 * Per-peer typing state as seen from incoming WS pings:
 * { [peerId]: { isTyping: boolean, at: number } }
 */
export const chatPeerTypingAtom = atom<Record<number, { isTyping: boolean, at: number }>>({})

/**
 * Set of peer ids whose conversations have a live unread marker coming from
 * WS events (complements the server-computed unread counts).
 */
export const chatWsUnreadTickAtom = atom<number>(0)
