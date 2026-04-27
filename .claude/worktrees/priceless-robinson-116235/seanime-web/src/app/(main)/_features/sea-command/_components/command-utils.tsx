import { AL_BaseAnime, AL_BaseManga } from "@/api/generated/types"
import { SyntheticManga } from "@/api/hooks/manga.hooks"
import { useMediaPreviewModal } from "@/app/(main)/_features/media/_containers/media-preview-modal"
import { imageShimmer } from "@/components/shared/image-helpers"
import { SeaImage } from "@/components/shared/sea-image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command"
import { LuSparkles } from "react-icons/lu"
import { useSeaCommandContext } from "../sea-command"


export function CommandItemMedia({ media, type, isSynthetic }: { media: AL_BaseAnime | AL_BaseManga, type: "anime" | "manga", isSynthetic?: boolean }) {
    const { setPreviewModalMediaId } = useMediaPreviewModal()
    return (
        <div className="flex gap-3 items-center w-full">
            <div className="size-12 flex-none rounded-[--radius-md] relative overflow-hidden">
                <SeaImage
                    src={media.coverImage?.medium || ""}
                    alt="episode image"
                    fill
                    className="object-center object-cover"
                    placeholder={imageShimmer(700, 475)}
                />
            </div>
            <div className="flex gap-1 items-center w-full">
                <p className="w-full line-clamp-1">{media?.title?.userPreferred || ""}</p>
                {isSynthetic && (
                    <Badge intent="warning" size="sm" className="flex-shrink-0 gap-1">
                        <LuSparkles className="text-xs" />
                        Synthetic
                    </Badge>
                )}
            </div>
            <div className="flex-1"></div>
            {!isSynthetic && (
                <Button
                    size="sm" intent="gray-basic" onClick={e => {
                    e.stopPropagation()
                    setPreviewModalMediaId(media.id, type)
                }} className="flex-shrink-0"
                >
                    Preview
                </Button>
            )}
        </div>
    )
}

export function CommandItemSyntheticManga({ manga }: { manga: SyntheticManga }) {
    return (
        <div className="flex gap-3 items-center w-full">
            <div className="size-12 flex-none rounded-[--radius-md] relative overflow-hidden">
                <SeaImage
                    src={manga.coverImage || ""}
                    alt="manga cover"
                    fill
                    className="object-center object-cover"
                    placeholder={imageShimmer(700, 475)}
                />
            </div>
            <div className="flex gap-2 items-center w-full">
                <p className="line-clamp-1">{manga.title}</p>
                <Badge intent="warning" size="sm" className="flex-shrink-0 gap-1">
                    <LuSparkles className="text-xs" />
                    Synthetic
                </Badge>
            </div>
            <div className="flex-1"></div>
            <span className="text-xs text-[--muted] flex-shrink-0">
                {manga.chapters > 0 ? `${manga.chapters} ch` : ""}
            </span>
        </div>
    )
}

export function CommandHelperText({ command, description, show }: { command: string, description: string, show: boolean }) {
    if (!show) return null
    return (
        <p className="py-1 px-6 text-center text-sm sm:px-14 tracking-widest text-[--muted]">
            <span className="text-[--foreground]">{command}</span> <span className="tracking-wide">{description}</span>
        </p>
    )
}

export function SeaCommandAutocompleteSuggestions({
    commands,
}: {
    commands: { command: string, description: string, show?: boolean }[]
}) {

    const { input, setInput, select, command: { isCommand, command, args }, scrollToTop } = useSeaCommandContext()

    if (input !== "/") return null

    return (
        <>

            <CommandGroup heading="Suggestions">
                {commands.filter(command => command.show === true).map(command => (
                    <CommandItem
                        key={command.command}
                        onSelect={() => {
                            setInput(`/${command.command}`)
                        }}
                    >
                        <span className="tracking-widest text-sm">/{command.command}</span>
                        <CommandShortcut className="text-[--muted]">{command.description}</CommandShortcut>
                    </CommandItem>
                ))}
            </CommandGroup>
        </>
    )
}
