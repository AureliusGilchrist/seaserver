"use client"
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

export type AmbiencePlaybackTrack = {
    /** SoundTrack.uuid */
    uuid: string
    title: string
    artist: string
    /** "/sounds-cache/<filename>" — relative; resolveUrl prepends server base. */
    url: string
    durationSec: number
}

export type AmbienceRepeatMode = "off" | "one" | "all"

/** Currently-playing track (full metadata) — null when nothing is playing. */
export const ambienceCurrentTrackAtom = atom<AmbiencePlaybackTrack | null>(null)

/** Track UUIDs forming the current play queue. The audio element walks this list. */
export const ambienceQueueAtom = atom<AmbiencePlaybackTrack[]>([])

/** Current index inside ambienceQueueAtom. -1 when nothing playing. */
export const ambienceQueueIndexAtom = atom<number>(-1)

/** True when the audio element should be playing. */
export const ambienceIsPlayingAtom = atom<boolean>(false)

/** Volume 0..1 — persisted. */
export const ambienceVolumeAtom = atomWithStorage<number>("seanime-ambience-volume", 0.7)

/** Repeat mode — persisted. */
export const ambienceRepeatAtom = atomWithStorage<AmbienceRepeatMode>("seanime-ambience-repeat", "off")

/** Shuffle — persisted. */
export const ambienceShuffleAtom = atomWithStorage<boolean>("seanime-ambience-shuffle", false)

/** Current playhead position in seconds (kept in-memory only). */
export const ambiencePositionAtom = atom<number>(0)

/** Total duration as reported by the audio element (overrides metadata if available). */
export const ambienceLiveDurationAtom = atom<number>(0)

/** Optional command bus — UI sets these to request seek/skip/etc, mount component reads + clears. */
export type AmbienceCommand =
    | { type: "seek"; positionSec: number }
    | { type: "next" }
    | { type: "prev" }
    | { type: "play-queue"; queue: AmbiencePlaybackTrack[]; startIndex: number }

export const ambienceCommandAtom = atom<AmbienceCommand | null>(null)
