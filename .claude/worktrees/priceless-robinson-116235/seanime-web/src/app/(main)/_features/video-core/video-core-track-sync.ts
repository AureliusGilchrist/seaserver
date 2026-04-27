import { useEffect, useCallback, useRef } from "react"
import { useAtom, useSetAtom } from "jotai"
import { vc_perMediaTrackOverrides, vc_trackPrefsLoaded, vc_saveTrackOverride, PerMediaTrackOverride } from "./video-core.atoms"
import { useGetTrackPreferences, useUpsertTrackPreference } from "@/api/hooks/mediastream.hooks"

/**
 * Syncs per-media track overrides between the Jotai atom and the server.
 * - On mount: loads all track preferences from the server into the atom.
 * - Sets vc_saveTrackOverride atom so menus can write through to server.
 */
export function useTrackPreferenceSync() {
    const { data: serverPrefs, isSuccess } = useGetTrackPreferences()
    const { mutate: upsert } = useUpsertTrackPreference()
    const [overrides, setOverrides] = useAtom(vc_perMediaTrackOverrides)
    const setLoaded = useSetAtom(vc_trackPrefsLoaded)
    const setSaveCallback = useSetAtom(vc_saveTrackOverride)
    const overridesRef = useRef(overrides)
    overridesRef.current = overrides

    // Populate atom from server data on initial load
    useEffect(() => {
        if (isSuccess && serverPrefs) {
            const mapped: Record<string, PerMediaTrackOverride> = {}
            for (const [mediaId, pref] of Object.entries(serverPrefs)) {
                mapped[mediaId] = {
                    audioLanguage: (pref as any).audioLanguage || undefined,
                    audioCodecID: (pref as any).audioCodecId || (pref as any).audioCodecID || undefined,
                    subtitleLanguage: (pref as any).subtitleLanguage || undefined,
                    subtitleCodecID: (pref as any).subtitleCodecId || (pref as any).subtitleCodecID || undefined,
                }
            }
            setOverrides(mapped)
            setLoaded(true)
        }
    }, [isSuccess, serverPrefs])

    // Register the write-through callback so menus can call it
    useEffect(() => {
        const save = (mediaId: string, override: Partial<PerMediaTrackOverride>) => {
            setOverrides(prev => {
                const merged = { ...prev[mediaId], ...override }
                return { ...prev, [mediaId]: merged }
            })
            const current = overridesRef.current[mediaId] || {}
            const merged = { ...current, ...override }
            upsert({
                mediaId,
                audioLanguage: merged.audioLanguage,
                audioCodecID: merged.audioCodecID,
                subtitleLanguage: merged.subtitleLanguage,
                subtitleCodecID: merged.subtitleCodecID,
            })
        }
        setSaveCallback(() => save)
        return () => setSaveCallback(null)
    }, [upsert, setOverrides, setSaveCallback])
}
