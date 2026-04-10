import { Badge } from "@/components/ui/badge"
import { SeaLink } from "@/components/shared/sea-link"
import React from "react"

type MangaEntryStaffProps = {
    staff?: {
        edges?: Array<{
            role?: string | null
            node?: {
                name?: { full?: string | null } | null
                id: number
                image?: { medium?: string | null } | null
            } | null
        } | null> | null
    } | null | undefined
}

export function MangaEntryStaff(props: MangaEntryStaffProps) {

    const { staff } = props

    if (!staff?.edges?.length) return null

    return (
        <>
            {staff.edges.map((edge) => {
                if (!edge?.node?.name?.full) return null
                return (
                    <SeaLink key={edge.node.id} href={`/staff?id=${edge.node.id}`}>
                        <Badge
                            size="lg"
                            intent="gray"
                            className="rounded-full px-0 border-transparent bg-transparent cursor-pointer transition-all hover:bg-transparent hover:text-white hover:-translate-y-0.5"
                        >
                            {edge.node.name.full}
                        </Badge>
                    </SeaLink>
                )
            })}
        </>
    )
}
