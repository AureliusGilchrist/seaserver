import {
    useCancelMangaHydration,
    useHydrateAllManga,
    useGetMangaHydrationStatus,
} from "@/api/hooks/manga.hooks"
import {
    useRunFindAnimeLibrarySorting,
    useRunFindMangaLibrarySorting,
    useRunScanAnimeLibrary,
    useRunScanMangaLibrary,
    useRunUpdateAnimeLibrary,
    useRunUpdateMangaLibrary,
} from "@/api/hooks/services.hooks"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import React from "react"
import { SettingsCard } from "../_components/settings-card"

export function ServicesSettings() {
    const { mutate: updateAnime, isPending: isUpdatingAnime } = useRunUpdateAnimeLibrary()
    const { mutate: updateManga, isPending: isUpdatingManga } = useRunUpdateMangaLibrary()
    const { mutate: scanAnime, isPending: isScanningAnime } = useRunScanAnimeLibrary()
    const { mutate: scanManga, isPending: isScanningManga } = useRunScanMangaLibrary()
    const { mutate: findAnimeSorting, isPending: isFindingAnimeSorting } = useRunFindAnimeLibrarySorting()
    const { mutate: findMangaSorting, isPending: isFindingMangaSorting } = useRunFindMangaLibrarySorting()
    const { mutate: hydrateManga, isPending: isHydratingManga } = useHydrateAllManga()
    const { mutate: cancelHydration, isPending: isCancellingHydration } = useCancelMangaHydration()
    const { data: hydrationStatus } = useGetMangaHydrationStatus()

    const isAnyPending = isUpdatingAnime || isUpdatingManga || isScanningAnime || isScanningManga || isFindingAnimeSorting || isFindingMangaSorting || isHydratingManga || !!hydrationStatus?.isRunning

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

            <SettingsCard
                title="Metadata hydration"
                description="Hydrate manga metadata in the background for entries that are missing information."
            >
                <div className="flex gap-2 flex-wrap mb-3">
                    <Button intent="white-subtle" size="sm" onClick={() => hydrateManga()} disabled={isAnyPending}>
                        Hydrate manga metadata
                    </Button>
                    {!!hydrationStatus?.isRunning && (
                        <Button intent="alert-subtle" size="sm" onClick={() => cancelHydration()} disabled={isCancellingHydration || !!hydrationStatus?.cancelRequested}>
                            {hydrationStatus?.cancelRequested ? "Cancelling..." : "Cancel hydration"}
                        </Button>
                    )}
                </div>

                {!!hydrationStatus && (hydrationStatus.isRunning || hydrationStatus.total > 0 || hydrationStatus.processed > 0) && (
                    <div className="space-y-2">
                        <ProgressBar size="sm" value={hydrationStatus.progress} />
                        <div className="text-xs text-[--muted] space-y-1">
                            <p>{hydrationStatus.processed}/{hydrationStatus.total} processed ({Math.round(hydrationStatus.progress)}%)</p>
                            <p>AniList hydrated: {hydrationStatus.aniListHydrated} | Synthetic hydrated: {hydrationStatus.syntheticHydrated}</p>
                            <p>Skipped: {hydrationStatus.skipped} | Failed: {hydrationStatus.failed}</p>
                            {!!hydrationStatus.wasCancelled && <p>Status: cancelled</p>}
                        </div>
                        {!!hydrationStatus.details?.length && (
                            <div className="max-h-40 overflow-y-auto rounded-md border border-gray-800 px-2 py-1 text-xs space-y-1">
                                {[...hydrationStatus.details].slice(-10).reverse().map((detail, idx) => (
                                    <p key={`${detail.timestamp}-${detail.mediaId}-${idx}`} className="text-[--muted]">
                                        [{detail.source}] {detail.action.toUpperCase()} {detail.mediaId ? `#${detail.mediaId}` : ""} {detail.title || ""} {detail.message ? `- ${detail.message}` : ""}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </SettingsCard>
        </div>
    )
}
