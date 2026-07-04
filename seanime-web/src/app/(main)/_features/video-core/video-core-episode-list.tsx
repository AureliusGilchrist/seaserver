import { Anime_Episode } from "@/api/generated/types"
import { EpisodeGridItem } from "@/app/(main)/_features/anime/_components/episode-grid-item"
import { vc_isMobile, vc_menuOpen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { VideoCoreControlButtonIcon } from "@/app/(main)/_features/video-core/video-core-control-bar"
import { VideoCoreMenu, VideoCoreMenuTitle } from "@/app/(main)/_features/video-core/video-core-menu"
import { useVideoCorePlaylist } from "@/app/(main)/_features/video-core/video-core-playlist"
import { cn } from "@/components/ui/core/styling"
import { useAtomValue, useSetAtom } from "jotai/react"
import React from "react"
import { LuList } from "react-icons/lu"

const MENU_NAME = "episode-list"
const EPISODES_PER_PAGE = 60

// Episode list popup for the player: shows every episode of the current media with its
// metadata (title, thumbnail, summary, filler flag) and jumps straight to the page
// containing the most recently watched episode.
export function VideoCoreEpisodeListMenu() {
    const { playlistState, animeEntry, playSpecificEpisode, isGlobalPlaylistActive } = useVideoCorePlaylist()
    const isMobile = useAtomValue(vc_isMobile)
    const setMenuOpen = useSetAtom(vc_menuOpen)
    const menuOpen = useAtomValue(vc_menuOpen)
    const isOpen = menuOpen === MENU_NAME

    const episodes = React.useMemo(() => {
        return [...(playlistState?.episodes ?? [])].sort((a, b) => (a.progressNumber ?? 0) - (b.progressNumber ?? 0))
    }, [playlistState?.episodes])

    const currentProgressNumber = playlistState?.currentEpisode?.progressNumber ?? 0
    const watchedProgress = animeEntry?.listData?.progress ?? 0

    // "Most recently watched" anchor: the episode currently playing, falling back to the
    // AniList progress when the current episode isn't in the list.
    const anchorProgressNumber = currentProgressNumber || watchedProgress

    const pageCount = Math.max(1, Math.ceil(episodes.length / EPISODES_PER_PAGE))
    const anchorIndex = Math.max(0, episodes.findIndex(ep => ep.progressNumber === anchorProgressNumber))
    const anchorPage = Math.floor(anchorIndex / EPISODES_PER_PAGE)

    const [page, setPage] = React.useState(anchorPage)

    // Re-anchor whenever the popup opens (or the playing episode changes while open)
    React.useEffect(() => {
        if (isOpen) setPage(anchorPage)
    }, [isOpen, anchorPage])

    const listRef = React.useRef<HTMLDivElement>(null)

    // Scroll the anchored episode into view when the popup opens on its page
    React.useEffect(() => {
        if (!isOpen || page !== anchorPage) return
        const t = setTimeout(() => {
            listRef.current?.querySelector("[data-vc-episode-anchor=\"true\"]")?.scrollIntoView({ block: "center" })
        }, 100)
        return () => clearTimeout(t)
    }, [isOpen, page, anchorPage])

    // Hidden when there's nothing to list (no playlist state) or a global playlist drives playback
    if (!playlistState || !episodes.length || isGlobalPlaylistActive) return null

    const pageEpisodes = episodes.slice(page * EPISODES_PER_PAGE, (page + 1) * EPISODES_PER_PAGE)

    return (
        <VideoCoreMenu
            name={MENU_NAME}
            isDrawer={isMobile}
            className="w-[28rem] max-w-[95vw]"
            trigger={<VideoCoreControlButtonIcon
                icons={[["list", LuList]]}
                state="list"
                onClick={() => setMenuOpen(p => p === MENU_NAME ? null : MENU_NAME)}
            />}
        >
            <VideoCoreMenuTitle>Episodes</VideoCoreMenuTitle>

            {pageCount > 1 && (
                <div className="flex flex-wrap gap-1.5 pb-2">
                    {Array.from({ length: pageCount }).map((_, i) => {
                        const first = i * EPISODES_PER_PAGE
                        const last = Math.min((i + 1) * EPISODES_PER_PAGE, episodes.length) - 1
                        const label = `${episodes[first]?.progressNumber ?? first + 1}-${episodes[last]?.progressNumber ?? last + 1}`
                        return (
                            <button
                                key={i}
                                className={cn(
                                    "text-xs px-2 py-1 rounded-md border transition-colors",
                                    i === page
                                        ? "bg-white/20 border-white/40 text-white"
                                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10",
                                )}
                                onClick={() => setPage(i)}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>
            )}

            <div
                ref={listRef}
                data-vc-element="episode-list"
                className="space-y-2 overflow-y-auto max-h-[55vh] pr-1"
            >
                {pageEpisodes.map(episode => (
                    <EpisodeListRow
                        key={`${episode.progressNumber}-${episode.localFile?.path ?? episode.episodeNumber}`}
                        episode={episode}
                        isPlaying={episode.progressNumber === currentProgressNumber}
                        isWatched={(episode.progressNumber ?? 0) <= watchedProgress}
                        isAnchor={episode.progressNumber === anchorProgressNumber}
                        onPlay={() => {
                            setMenuOpen(null)
                            playSpecificEpisode(episode)
                        }}
                    />
                ))}
            </div>
        </VideoCoreMenu>
    )
}

function EpisodeListRow({ episode, isPlaying, isWatched, isAnchor, onPlay }: {
    episode: Anime_Episode
    isPlaying: boolean
    isWatched: boolean
    isAnchor: boolean
    onPlay: () => void
}) {
    return (
        <div data-vc-episode-anchor={isAnchor ? "true" : undefined}>
            <EpisodeGridItem
                media={episode?.baseAnime as any}
                title={episode?.displayTitle || episode?.baseAnime?.title?.userPreferred || ""}
                image={episode?.episodeMetadata?.image || episode?.baseAnime?.coverImage?.large}
                episodeTitle={episode?.episodeTitle}
                fileName={episode?.localFile?.parsedInfo?.original}
                description={episode?.episodeMetadata?.summary || episode?.episodeMetadata?.overview}
                isFiller={episode?.episodeMetadata?.isFiller}
                length={episode?.episodeMetadata?.length}
                episodeNumber={episode?.episodeNumber}
                progressNumber={episode?.progressNumber}
                isWatched={isWatched && !isPlaying}
                isSelected={isPlaying}
                className="flex-none w-full"
                onClick={onPlay}
            />
        </div>
    )
}
