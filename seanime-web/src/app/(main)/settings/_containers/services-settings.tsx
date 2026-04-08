import {
    useRunFindAnimeLibrarySorting,
    useRunFindMangaLibrarySorting,
    useRunScanAnimeLibrary,
    useRunScanMangaLibrary,
    useRunUpdateAnimeLibrary,
    useRunUpdateMangaLibrary,
} from "@/api/hooks/services.hooks"
import { Button } from "@/components/ui/button"
import React from "react"
import { SettingsCard } from "../_components/settings-card"

export function ServicesSettings() {
    const { mutate: updateAnime, isPending: isUpdatingAnime } = useRunUpdateAnimeLibrary()
    const { mutate: updateManga, isPending: isUpdatingManga } = useRunUpdateMangaLibrary()
    const { mutate: scanAnime, isPending: isScanningAnime } = useRunScanAnimeLibrary()
    const { mutate: scanManga, isPending: isScanningManga } = useRunScanMangaLibrary()
    const { mutate: findAnimeSorting, isPending: isFindingAnimeSorting } = useRunFindAnimeLibrarySorting()
    const { mutate: findMangaSorting, isPending: isFindingMangaSorting } = useRunFindMangaLibrarySorting()

    const isAnyPending = isUpdatingAnime || isUpdatingManga || isScanningAnime || isScanningManga || isFindingAnimeSorting || isFindingMangaSorting

    return (
        <div className="space-y-4">
            <SettingsCard title="Library updates" description="Refresh your AniList anime or manga collection.">
                <div className="flex gap-2 flex-wrap">
                    <Button intent="white-subtle" size="sm" onClick={() => updateAnime()} disabled={isAnyPending}>
                        Update anime library
                    </Button>
                    <Button intent="white-subtle" size="sm" onClick={() => updateManga()} disabled={isAnyPending}>
                        Update manga library
                    </Button>
                </div>
            </SettingsCard>

            <SettingsCard title="Library scans" description="Trigger a local anime or manga library scan.">
                <div className="flex gap-2 flex-wrap">
                    <Button intent="white-subtle" size="sm" onClick={() => scanAnime()} disabled={isAnyPending}>
                        Scan anime library
                    </Button>
                    <Button intent="white-subtle" size="sm" onClick={() => scanManga()} disabled={isAnyPending}>
                        Scan manga library
                    </Button>
                </div>
            </SettingsCard>

            <SettingsCard
                title="Library sorting (Gojuuon)"
                description="Compute GoJuuon (五十音) sort order for your local library. This groups anime by series and sorts by Japanese syllabary order. Runs automatically every day at 3 AM."
            >
                <div className="flex gap-2 flex-wrap">
                    <Button intent="white-subtle" size="sm" onClick={() => findAnimeSorting()} disabled={isAnyPending}>
                        Find anime library sorting
                    </Button>
                    <Button intent="white-subtle" size="sm" onClick={() => findMangaSorting()} disabled={isAnyPending}>
                        Find manga library sorting
                    </Button>
                </div>
            </SettingsCard>
        </div>
    )
}
