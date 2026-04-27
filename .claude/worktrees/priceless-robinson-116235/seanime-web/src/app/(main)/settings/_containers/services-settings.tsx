import {
    useCancelMangaHydration,
    useHydrateAllManga,
    useGetMangaHydrationStatus,
} from "@/api/hooks/manga.hooks"
import {
    useHydrateAllAnime,
    useCancelAnimeHydration,
    useGetAnimeHydrationStatus,
} from "@/api/hooks/anime_collection.hooks"
import {
    useRunFindAnimeLibrarySorting,
    useRunFindMangaLibrarySorting,
    useRunScanAnimeLibrary,
    useRunScanMangaLibrary,
    useRunUpdateAnimeLibrary,
    useRunUpdateMangaLibrary,
} from "@/api/hooks/services.hooks"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { ProgressBar } from "@/components/ui/progress-bar"
import React from "react"
import { SettingsCard } from "../_components/settings-card"

export function ServicesSettings() {
    const { mutate: updateAnime, isPending: isUpdatingAnime, isSuccess: updateAnimeSuccess } = useRunUpdateAnimeLibrary()
    const { mutate: updateManga, isPending: isUpdatingManga, isSuccess: updateMangaSuccess } = useRunUpdateMangaLibrary()
    const { mutate: scanAnime, isPending: isScanningAnime, isSuccess: scanAnimeSuccess } = useRunScanAnimeLibrary()
    const { mutate: scanManga, isPending: isScanningManga, isSuccess: scanMangaSuccess } = useRunScanMangaLibrary()
    const { mutate: findAnimeSorting, isPending: isFindingAnimeSorting, isSuccess: findAnimeSortingSuccess } = useRunFindAnimeLibrarySorting()
    const { mutate: findMangaSorting, isPending: isFindingMangaSorting, isSuccess: findMangaSortingSuccess } = useRunFindMangaLibrarySorting()
    const { mutate: hydrateManga, isPending: isHydratingManga } = useHydrateAllManga()
    const { mutate: cancelHydration, isPending: isCancellingHydration } = useCancelMangaHydration()
    const { data: hydrationStatus } = useGetMangaHydrationStatus()
    const { mutate: hydrateAnime, isPending: isHydratingAnime } = useHydrateAllAnime()
    const { mutate: cancelAnimeHydration, isPending: isCancellingAnimeHydration } = useCancelAnimeHydration()
    const { data: animeHydrationStatus } = useGetAnimeHydrationStatus()

    const isAnyPending = isUpdatingAnime || isUpdatingManga || isScanningAnime || isScanningManga || isFindingAnimeSorting || isFindingMangaSorting || isHydratingManga || !!hydrationStatus?.isRunning || isHydratingAnime || !!animeHydrationStatus?.isRunning

    // "Run All" sequential chain state
    const [animeAllStep, setAnimeAllStep] = React.useState<string | null>(null)
    const [mangaAllStep, setMangaAllStep] = React.useState<string | null>(null)
    const animeAllRef = React.useRef(false)
    const mangaAllRef = React.useRef(false)

    // Chain anime operations: update → scan → sorting → hydrate
    const runAllAnime = React.useCallback(() => {
        if (animeAllRef.current) return
        animeAllRef.current = true
        setAnimeAllStep("Updating anime library...")
        updateAnime(undefined, {
            onSettled: () => {
                setAnimeAllStep("Scanning anime library...")
                scanAnime(undefined, {
                    onSettled: () => {
                        setAnimeAllStep("Computing anime sorting...")
                        findAnimeSorting(undefined, {
                            onSettled: () => {
                                setAnimeAllStep("Hydrating anime metadata...")
                                hydrateAnime(undefined, {
                                    onSettled: () => {
                                        setAnimeAllStep(null)
                                        animeAllRef.current = false
                                    },
                                })
                            },
                        })
                    },
                })
            },
        })
    }, [updateAnime, scanAnime, findAnimeSorting, hydrateAnime])

    // Chain manga operations: update → scan → sorting → hydrate
    const runAllManga = React.useCallback(() => {
        if (mangaAllRef.current) return
        mangaAllRef.current = true
        setMangaAllStep("Updating manga library...")
        updateManga(undefined, {
            onSettled: () => {
                setMangaAllStep("Scanning manga library...")
                scanManga(undefined, {
                    onSettled: () => {
                        setMangaAllStep("Computing manga sorting...")
                        findMangaSorting(undefined, {
                            onSettled: () => {
                                setMangaAllStep("Hydrating manga metadata...")
                                hydrateManga(undefined, {
                                    onSettled: () => {
                                        setMangaAllStep(null)
                                        mangaAllRef.current = false
                                    },
                                })
                            },
                        })
                    },
                })
            },
        })
    }, [updateManga, scanManga, findMangaSorting, hydrateManga])

    return (
        <div className="space-y-4">
            <SettingsCard title="Run all services" description="Sequentially run update, scan, sorting, and metadata hydration.">
                <div className="flex gap-2 flex-wrap items-center">
                    <Button intent="primary" size="sm" onClick={runAllAnime} disabled={isAnyPending || !!animeAllStep}>
                        Run all anime services
                    </Button>
                    <Button intent="primary" size="sm" onClick={runAllManga} disabled={isAnyPending || !!mangaAllStep}>
                        Run all manga services
                    </Button>
                </div>
                {animeAllStep && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-[--muted]">
                        <LoadingSpinner />
                        <span>{animeAllStep}</span>
                    </div>
                )}
                {mangaAllStep && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-[--muted]">
                        <LoadingSpinner />
                        <span>{mangaAllStep}</span>
                    </div>
                )}
            </SettingsCard>
            <SettingsCard title="Library updates" description="Refresh your AniList anime or manga collection.">
                <div className="flex gap-2 flex-wrap items-center">
                    <Button intent="white-subtle" size="sm" onClick={() => updateAnime()} disabled={isAnyPending}>
                        Update anime library
                    </Button>
                    <Button intent="white-subtle" size="sm" onClick={() => updateManga()} disabled={isAnyPending}>
                        Update manga library
                    </Button>
                </div>
                {(isUpdatingAnime || isUpdatingManga) && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-[--muted]">
                        <LoadingSpinner />
                        <span>{isUpdatingAnime ? "Refreshing anime collection from AniList..." : "Refreshing manga collection from AniList..."}</span>
                    </div>
                )}
                {!isUpdatingAnime && updateAnimeSuccess && (
                    <p className="mt-2 text-xs text-green-400">Anime library updated successfully.</p>
                )}
                {!isUpdatingManga && updateMangaSuccess && (
                    <p className="mt-2 text-xs text-green-400">Manga library updated successfully.</p>
                )}
            </SettingsCard>

            <SettingsCard title="Library scans" description="Trigger a local anime or manga library scan.">
                <div className="flex gap-2 flex-wrap items-center">
                    <Button intent="white-subtle" size="sm" onClick={() => scanAnime()} disabled={isAnyPending}>
                        Scan anime library
                    </Button>
                    <Button intent="white-subtle" size="sm" onClick={() => scanManga()} disabled={isAnyPending}>
                        Scan manga library
                    </Button>
                </div>
                {(isScanningAnime || isScanningManga) && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-[--muted]">
                        <LoadingSpinner />
                        <span>{isScanningAnime ? "Scanning anime library files..." : "Scanning manga library files..."}</span>
                    </div>
                )}
                {!isScanningAnime && scanAnimeSuccess && (
                    <p className="mt-2 text-xs text-green-400">Anime library scan completed.</p>
                )}
                {!isScanningManga && scanMangaSuccess && (
                    <p className="mt-2 text-xs text-green-400">Manga library scan completed.</p>
                )}
            </SettingsCard>

            <SettingsCard
                title="Library sorting (Gojuuon)"
                description="Compute GoJuuon (五十音) sort order for your local library. This groups anime by series and sorts by Japanese syllabary order. Runs automatically every day at 3 AM."
            >
                <div className="flex gap-2 flex-wrap items-center">
                    <Button intent="white-subtle" size="sm" onClick={() => findAnimeSorting()} disabled={isAnyPending}>
                        Find anime library sorting
                    </Button>
                    <Button intent="white-subtle" size="sm" onClick={() => findMangaSorting()} disabled={isAnyPending}>
                        Find manga library sorting
                    </Button>
                </div>
                {(isFindingAnimeSorting || isFindingMangaSorting) && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-[--muted]">
                        <LoadingSpinner />
                        <span>{isFindingAnimeSorting ? "Computing anime GoJuuon sort order..." : "Computing manga GoJuuon sort order..."}</span>
                    </div>
                )}
                {!isFindingAnimeSorting && findAnimeSortingSuccess && (
                    <p className="mt-2 text-xs text-green-400">Anime sorting computed successfully.</p>
                )}
                {!isFindingMangaSorting && findMangaSortingSuccess && (
                    <p className="mt-2 text-xs text-green-400">Manga sorting computed successfully.</p>
                )}
            </SettingsCard>

            <SettingsCard
                title="Metadata hydration"
                description="Hydrate metadata in the background for entries that are missing information. Anime hydration re-fetches AniList data for every unique media ID in your local files."
            >
                <div className="flex gap-2 flex-wrap mb-3 items-center">
                    <Button intent="white-subtle" size="sm" onClick={() => hydrateAnime()} disabled={isAnyPending}>
                        Hydrate anime metadata
                    </Button>
                    <Button intent="white-subtle" size="sm" onClick={() => hydrateManga()} disabled={isAnyPending}>
                        Hydrate manga metadata
                    </Button>
                    {!!animeHydrationStatus?.isRunning && (
                        <Button intent="alert-subtle" size="sm" onClick={() => cancelAnimeHydration()} disabled={isCancellingAnimeHydration || !!animeHydrationStatus?.cancelRequested}>
                            {animeHydrationStatus?.cancelRequested ? "Cancelling..." : "Cancel anime hydration"}
                        </Button>
                    )}
                    {!!hydrationStatus?.isRunning && (
                        <Button intent="alert-subtle" size="sm" onClick={() => cancelHydration()} disabled={isCancellingHydration || !!hydrationStatus?.cancelRequested}>
                            {hydrationStatus?.cancelRequested ? "Cancelling..." : "Cancel manga hydration"}
                        </Button>
                    )}
                </div>

                {!!animeHydrationStatus && (animeHydrationStatus.isRunning || animeHydrationStatus.total > 0 || animeHydrationStatus.processed > 0) && (
                    <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">Anime</p>
                            {animeHydrationStatus.isRunning && <LoadingSpinner />}
                        </div>
                        <ProgressBar size="sm" value={animeHydrationStatus.progress} />
                        <div className="text-xs text-[--muted] space-y-1">
                            <p>{animeHydrationStatus.processed}/{animeHydrationStatus.total} processed ({Math.round(animeHydrationStatus.progress)}%)</p>
                            <p>Hydrated: {animeHydrationStatus.hydrated} | Skipped: {animeHydrationStatus.skipped} | Failed: {animeHydrationStatus.failed}</p>
                            {!!animeHydrationStatus.wasCancelled && <p className="text-yellow-400">Status: cancelled</p>}
                            {!animeHydrationStatus.isRunning && !animeHydrationStatus.wasCancelled && animeHydrationStatus.processed > 0 && (
                                <p className="text-green-400">Status: completed</p>
                            )}
                        </div>
                        {!!animeHydrationStatus.details?.length && (
                            <div className="max-h-40 overflow-y-auto rounded-md border border-gray-800 px-2 py-1 text-xs space-y-1">
                                {[...animeHydrationStatus.details].slice(-10).reverse().map((detail, idx) => (
                                    <p key={`${detail.timestamp}-${detail.mediaId}-${idx}`} className={
                                        detail.action === "failed" ? "text-red-400" :
                                        detail.action === "cancelled" ? "text-yellow-400" :
                                        "text-[--muted]"
                                    }>
                                        {detail.action.toUpperCase()} {detail.mediaId ? `#${detail.mediaId}` : ""} {detail.title || ""} {detail.message ? `- ${detail.message}` : ""}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {!!hydrationStatus && (hydrationStatus.isRunning || hydrationStatus.total > 0 || hydrationStatus.processed > 0) && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">Manga</p>
                            {hydrationStatus.isRunning && <LoadingSpinner />}
                        </div>
                        <ProgressBar size="sm" value={hydrationStatus.progress} />
                        <div className="text-xs text-[--muted] space-y-1">
                            <p>{hydrationStatus.processed}/{hydrationStatus.total} processed ({Math.round(hydrationStatus.progress)}%)</p>
                            <p>AniList hydrated: {hydrationStatus.aniListHydrated} | Synthetic hydrated: {hydrationStatus.syntheticHydrated}</p>
                            <p>Skipped: {hydrationStatus.skipped} | Failed: {hydrationStatus.failed}</p>
                            {!!hydrationStatus.wasCancelled && <p className="text-yellow-400">Status: cancelled</p>}
                            {!hydrationStatus.isRunning && !hydrationStatus.wasCancelled && hydrationStatus.processed > 0 && (
                                <p className="text-green-400">Status: completed</p>
                            )}
                        </div>
                        {!!hydrationStatus.details?.length && (
                            <div className="max-h-40 overflow-y-auto rounded-md border border-gray-800 px-2 py-1 text-xs space-y-1">
                                {[...hydrationStatus.details].slice(-10).reverse().map((detail, idx) => (
                                    <p key={`manga-${detail.timestamp}-${detail.mediaId}-${idx}`} className={
                                        detail.action === "failed" ? "text-red-400" :
                                        detail.action === "cancelled" ? "text-yellow-400" :
                                        "text-[--muted]"
                                    }>
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
