import { Anime_Playlist, Anime_PlaylistEpisode, Nullish } from "@/api/generated/types"
import { useCurrentDevicePlaybackSettings } from "@/app/(main)/_atoms/playback.atoms"
import { useWebsocketSender } from "@/app/(main)/_hooks/handle-websockets"
import { useMediastreamActiveOnDevice } from "@/app/(main)/mediastream/_lib/mediastream.atoms"
import { clientIdAtom } from "@/app/websocket-provider"
import { logger } from "@/lib/helpers/debug"
import { WSEvents } from "@/lib/server/ws-events"
import { __isElectronDesktop__ } from "@/types/constants"
import { atom, useAtomValue } from "jotai"
import { useAtom } from "jotai/react"
import { toast } from "sonner"

/*
 * Playlists have been removed from the interface: there is no way left to create or start one.
 * The players still ask this hook whether a playlist is playing (to offer next/previous within
 * it), so it stays, and with nothing ever starting a playlist it always answers "no".
 */

function playlist_isSameEpisode(a: Nullish<Anime_PlaylistEpisode>, b: Nullish<Anime_PlaylistEpisode>) {
    if (!a || !b) return false
    return a.episode?.aniDBEpisode === b.episode?.aniDBEpisode && a.episode?.baseAnime?.id === b.episode?.baseAnime?.id
}

const log = logger("PLAYLIST MANAGER")

const pm_currentPlaylist = atom<Anime_Playlist | null>(null)
const pm_currentPlaylistEpisode = atom<Anime_PlaylistEpisode | null>(null)
const pm_confirmProgressUpdateModalOpen = atom<"next" | "previous" | null>(null)

export function usePlaylistManager() {
    const { sendMessage } = useWebsocketSender()
    const clientId = useAtomValue(clientIdAtom)

    const [currentPlaylist, setCurrentPlaylist] = useAtom(pm_currentPlaylist)
    const [currentPlaylistEpisode, setCurrentPlaylistEpisode] = useAtom(pm_currentPlaylistEpisode)
    const [confirmOpen, setConfirmOpen] = useAtom(pm_confirmProgressUpdateModalOpen)

    const { downloadedMediaPlayback, torrentStreamingPlayback, electronPlaybackMethod } = useCurrentDevicePlaybackSettings()
    const { activeOnDevice } = useMediastreamActiveOnDevice()

    function startPlaylist(playlist: Anime_Playlist) {
        toast.info("Starting playlist...")
        sendMessage({
            type: WSEvents.PLAYLIST,
            payload: {
                type: "start-playlist",
                payload: {
                    clientId: clientId,
                    dbId: playlist.dbId,
                    localFilePlaybackMethod: __isElectronDesktop__ && electronPlaybackMethod !== "default"
                        ? electronPlaybackMethod
                        : activeOnDevice ? "transcode" : downloadedMediaPlayback,
                    streamPlaybackMethod: __isElectronDesktop__ && electronPlaybackMethod !== "default"
                        ? electronPlaybackMethod
                        : torrentStreamingPlayback,
                },
            },
        })
    }

    function stopPlaylist() {
        log.info("Sending stop playlist event")
        sendMessage({
            type: WSEvents.PLAYLIST,
            payload: {
                type: "stop-playlist",
            },
        })
    }

    function reopenEpisode() {
        log.info("Sending reopen episode event")
        sendMessage({
            type: WSEvents.PLAYLIST,
            payload: {
                type: "reopen-episode",
            },
        })
    }

    function playEpisode(which: "next" | "previous", isCurrentCompleted: boolean) {
        log.info("Sending play episode event", which, isCurrentCompleted)
        if (isCurrentCompleted) {
            sendMessage({
                type: WSEvents.PLAYLIST,
                payload: {
                    type: "play-episode",
                    payload: {
                        which,
                        isCurrentCompleted: false, // server doesn't need to update progress
                    },
                },
            })
        } else {
            log.info("Awaiting confirmation to update progress for", which)
            setConfirmOpen(which)
        }
    }

    function onConfirmedProgress(shouldUpdate: boolean) {
        if (confirmOpen) {
            setConfirmOpen(null)
            log.info("Sending play episode event", confirmOpen, shouldUpdate)
            sendMessage({
                type: WSEvents.PLAYLIST,
                payload: {
                    type: "play-episode",
                    payload: {
                        which: confirmOpen,
                        isCurrentCompleted: shouldUpdate,
                    },
                },
            })
        }
    }

    const currentPlaylistEpisodeIndex = currentPlaylist?.episodes?.findIndex(n => playlist_isSameEpisode(n, currentPlaylistEpisode)) ?? -1

    const nextPlaylistEpisode = currentPlaylist?.episodes?.[currentPlaylistEpisodeIndex + 1]
    const prevPlaylistEpisode = currentPlaylist?.episodes?.[currentPlaylistEpisodeIndex - 1]

    return {
        currentPlaylist,
        startPlaylist,
        stopPlaylist,
        reopenEpisode,
        playEpisode,
        nextPlaylistEpisode,
        prevPlaylistEpisode,
        onConfirmedProgress,
    }
}
