"use client"
import { PageWrapper } from "@/components/shared/page-wrapper"

interface MangaMissedSequelsProps {
    onHoverImage?: (image: string | null) => void
    cardSizeClass?: string
}

export function MangaMissedSequels(_props: MangaMissedSequelsProps) {
    return (
        <PageWrapper className="px-4 py-8">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-lg font-semibold">Manga Sequel Discovery</h2>
                <p className="mt-1 text-sm text-[--muted]">
                    Manga sequel discovery is not currently supported. Remove this item in Home Settings.
                </p>
            </div>
        </PageWrapper>
    )
}
