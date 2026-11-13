"use client"
/**
 * Watch party: a room of its own with one shared player and a realtime chat on the side.
 *
 * Not seated anywhere → the lobby (create a room, or join one of the open ones).
 * Seated → the room: whoever holds the remote decides what plays, everyone else's player
 * follows it (the server mirrors play/pause/seek and corrects drift), and the remote can
 * be handed around.
 */
import { watchPartySessionAtom } from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { WatchPartyLobby } from "@/app/(main)/watch-party/_components/watch-party-lobby"
import { WatchPartyRoom } from "@/app/(main)/watch-party/_components/watch-party-room"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useAtomValue } from "jotai"
import React from "react"

export default function Page() {
    const session = useAtomValue(watchPartySessionAtom)

    if (session === undefined) return <LoadingSpinner />

    if (!session) return <WatchPartyLobby />

    return <WatchPartyRoom key={session.id} session={session} />
}
