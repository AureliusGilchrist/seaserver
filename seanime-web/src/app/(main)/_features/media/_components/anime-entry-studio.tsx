import { Badge } from "@/components/ui/badge"
import { SeaLink } from "@/components/shared/sea-link"
import React from "react"

type AnimeEntryStudioProps = {
    studios?: { nodes?: Array<{ name: string, id: number } | null> | null } | null | undefined
}

export function AnimeEntryStudio(props: AnimeEntryStudioProps) {

    const {
        studios,
        ...rest
    } = props

    if (!studios?.nodes) return null

    const studio = studios.nodes[0]
    if (!studio?.name) return null

    return (
        <SeaLink href={`/studio?id=${studio.id}`}>
            <Badge
                size="lg"
                intent="gray"
                className="rounded-full px-0 border-transparent bg-transparent cursor-pointer transition-all hover:bg-transparent hover:text-white hover:-translate-y-0.5"
                data-anime-entry-studio-badge
            >
                {studio.name}
            </Badge>
        </SeaLink>
    )
}
