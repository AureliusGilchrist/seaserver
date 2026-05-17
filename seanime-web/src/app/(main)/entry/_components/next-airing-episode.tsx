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
                    "flex gap-2 items-center justify-center text-lg",
                    ts.mediaPageBannerInfoBoxSize === ThemeMediaPageInfoBoxSize.Fluid && "justify-start",
                )}
            >
                <span className="font-semibold">Episode {props.media.nextAiringEpisode?.episode}</span>
                <span key={`${tick}-${distance}`} className="transition-opacity duration-300">{distance}</span>
                <BiCalendarAlt className="text-lg text-[--muted]" />
                <span className="text-[--muted]">{day}</span>
            </div>
        )}
    </>
}
