"use client"
import React from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
    ambienceCommandAtom,
    ambienceCurrentTrackAtom,
    ambienceIsPlayingAtom,
    ambienceLiveDurationAtom,
    ambiencePositionAtom,
    ambienceQueueAtom,
    ambienceQueueIndexAtom,
    ambienceRepeatAtom,
    ambienceShuffleAtom,
    ambienceVolumeAtom,
} from "@/app/(main)/ambience/_lib/ambience-atoms"
import { getServerBaseUrl } from "@/api/client/server-url"

function resolveUrl(url: string): string {
    if (!url) return url
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url
    return `${getServerBaseUrl()}${url}`
}

/**
 * Mounts a single hidden <audio> element in the root layout so playback
 * persists across page navigations. All state is driven by jotai atoms;
 * the visible UI on /ambience reads/writes the same atoms.
 */
export function AmbiencePlayerMount() {
    const audioRef = React.useRef<HTMLAudioElement | null>(null)

    const currentTrack = useAtomValue(ambienceCurrentTrackAtom)
    const setCurrentTrack = useSetAtom(ambienceCurrentTrackAtom)
    const [isPlaying, setIsPlaying] = useAtom(ambienceIsPlayingAtom)
    const [queue, setQueue] = useAtom(ambienceQueueAtom)
    const [queueIndex, setQueueIndex] = useAtom(ambienceQueueIndexAtom)
    const volume = useAtomValue(ambienceVolumeAtom)
    const repeat = useAtomValue(ambienceRepeatAtom)
    const shuffle = useAtomValue(ambienceShuffleAtom)
    const setPosition = useSetAtom(ambiencePositionAtom)
    const setLiveDuration = useSetAtom(ambienceLiveDurationAtom)
    const [command, setCommand] = useAtom(ambienceCommandAtom)

    // Compute the next/previous index given current state.
    const computeNextIndex = React.useCallback((dir: 1 | -1): number => {
        if (queue.length === 0) return -1
        if (shuffle && queue.length > 1) {
            // Random index that's not the current one.
            let next = Math.floor(Math.random() * queue.length)
            if (next === queueIndex) next = (next + 1) % queue.length
            return next
        }
        const next = queueIndex + dir
        if (next >= queue.length) return repeat === "all" ? 0 : -1
        if (next < 0) return repeat === "all" ? queue.length - 1 : 0
        return next
    }, [queue, queueIndex, repeat, shuffle])

    // When the queue or index changes, update the active track.
    React.useEffect(() => {
        if (queueIndex < 0 || queueIndex >= queue.length) {
            setCurrentTrack(null)
            return
        }
        setCurrentTrack(queue[queueIndex])
    }, [queue, queueIndex, setCurrentTrack])

    // Update volume on the audio element.
    React.useEffect(() => {
        if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, volume))
    }, [volume])

    // Sync isPlaying → audio element play/pause.
    React.useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        if (isPlaying && currentTrack) {
            const p = audio.play()
            if (p && typeof p.catch === "function") {
                p.catch(() => {
                    // Autoplay rejected (no user gesture). Surface as paused.
                    setIsPlaying(false)
                })
            }
        } else {
            audio.pause()
        }
    }, [isPlaying, currentTrack, setIsPlaying])

    // Process command bus (seek/next/prev/play-queue).
    React.useEffect(() => {
        if (!command) return
        const audio = audioRef.current
        switch (command.type) {
            case "seek":
                if (audio) audio.currentTime = command.positionSec
                break
            case "next": {
                const next = computeNextIndex(1)
                if (next >= 0) {
                    setQueueIndex(next)
                    setIsPlaying(true)
                } else {
                    setIsPlaying(false)
                }
                break
            }
            case "prev": {
                if (audio && audio.currentTime > 3) {
                    audio.currentTime = 0
                } else {
                    const prev = computeNextIndex(-1)
                    if (prev >= 0) {
                        setQueueIndex(prev)
                        setIsPlaying(true)
                    }
                }
                break
            }
            case "play-queue":
                setQueue(command.queue)
                setQueueIndex(command.startIndex)
                setIsPlaying(true)
                break
        }
        setCommand(null)
    }, [command, computeNextIndex, setCommand, setIsPlaying, setQueue, setQueueIndex])

    const onTimeUpdate = React.useCallback(() => {
        const audio = audioRef.current
        if (!audio) return
        setPosition(audio.currentTime)
    }, [setPosition])

    const onLoadedMetadata = React.useCallback(() => {
        const audio = audioRef.current
        if (!audio) return
        setLiveDuration(isFinite(audio.duration) ? audio.duration : 0)
    }, [setLiveDuration])

    const onEnded = React.useCallback(() => {
        const audio = audioRef.current
        if (!audio) return
        if (repeat === "one") {
            audio.currentTime = 0
            audio.play().catch(() => setIsPlaying(false))
            return
        }
        const next = computeNextIndex(1)
        if (next >= 0) {
            setQueueIndex(next)
            setIsPlaying(true)
        } else {
            setIsPlaying(false)
        }
    }, [computeNextIndex, repeat, setIsPlaying, setQueueIndex])

    const src = currentTrack ? resolveUrl(currentTrack.url) : ""

    return (
        <audio
            ref={audioRef}
            src={src}
            preload="metadata"
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onEnded={onEnded}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            style={{ display: "none" }}
        />
    )
}
