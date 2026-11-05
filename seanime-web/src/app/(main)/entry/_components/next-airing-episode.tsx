import { AL_BaseAnime } from "@/api/generated/types"
import { cn } from "@/components/ui/core/styling"
import { ThemeMediaPageInfoBoxSize, useThemeSettings } from "@/lib/theme/hooks"
import { addSeconds, format, formatDistanceToNow } from "date-fns"
import React from "react"
import { BiCalendarAlt } from "react-icons/bi"

export function NextAiringEpisode(props: { media: AL_BaseAnime }) {
    const [tick, setTick] = React.useState(0)
    React.useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 5000)
        return () => clearInterval(id)
    }, [])

    const secs = props.media.nextAiringEpisode?.timeUntilAiring || 0
    const target = addSeconds(new Date(), secs)
    const distance = formatDistanceToNow(target, { addSuffix: true })
    const day = format(target, "EEEE")
    const ts = useThemeSettings()

    return <>
        {!!props.media.nextAiringEpisode && (
            <div
                className={cn(
                    "flex h-11 items-center gap-2.5 rounded-full bg-black/40 pl-3.5 pr-4 text-sm ring-1 ring-white/10 backdrop-blur-md",
                    ts.mediaPageBannerInfoBoxSize === ThemeMediaPageInfoBoxSize.Fluid && "justify-start",
                )}
                data-anime-entry-next-airing-episode
            >
                <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-sky-400" />
                </span>
                <span className="font-semibold text-white">Episode {props.media.nextAiringEpisode?.episode}</span>
                <span key={`${tick}-${distance}`} className="text-white/70 transition-opacity duration-300">{distance}</span>
                <span className="h-3.5 w-px bg-white/15" />
                <BiCalendarAlt className="text-base text-[--muted]" />
                <span className="text-[--muted]">{day}</span>
            </div>
        )}
    </>
}
