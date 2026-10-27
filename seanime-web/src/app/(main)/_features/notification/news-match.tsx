import React from "react"

/** Why a news headline notified, as the server recorded it (news.NotifyMatch). */
export type NewsMatch = {
    mode?: "all" | "lists" | "keywords"
    matchedTitle?: string
    matchedList?: string
    matchedMedia?: "anime" | "manga"
    /** The exact text that matched, as written in the article. */
    matchedText?: string
    /** Where it was found: the headline or the post. */
    matchedIn?: "title" | "body"
}

export function parseNewsMatch(metadata?: string | null): NewsMatch | null {
    if (!metadata) return null
    try {
        const m = JSON.parse(metadata) as NewsMatch | null
        return m?.mode ? m : null
    }
    catch {
        return null
    }
}

/**
 * The headline or post preview with the name that made it notify set in bold. Only the part the
 * server found the name in is highlighted; anything else renders as plain text.
 */
export function HighlightedNewsText({ text, match, part }: { text: string, match: NewsMatch | null, part: "title" | "body" }) {
    const needle = match?.matchedIn === part ? match.matchedText : undefined
    if (!needle) return <>{text}</>
    let idx = text.indexOf(needle)
    if (idx < 0) idx = text.toLowerCase().indexOf(needle.toLowerCase())
    if (idx < 0) return <>{text}</>
    return (
        <>
            {text.slice(0, idx)}
            <strong className="font-bold text-[--foreground]">{text.slice(idx, idx + needle.length)}</strong>
            {text.slice(idx + needle.length)}
        </>
    )
}

/** One line under a news notification saying why it arrived. */
export function NewsReason({ match }: { match: NewsMatch | null }) {
    if (!match) return null
    let reason: React.ReactNode = null
    if (match.mode === "all") reason = "You get every article"
    else if (match.mode === "lists" && match.matchedTitle) {
        const list = match.matchedList ? `${match.matchedMedia === "manga" ? "manga " : ""}${match.matchedList} list` : "list"
        reason = <>On your {list}: <strong className="font-semibold">{match.matchedTitle}</strong></>
    }
    else if (match.mode === "keywords") reason = match.matchedTitle ? <>Keyword: <strong className="font-semibold">{match.matchedTitle}</strong></> : "Matches your keywords"
    if (!reason) return null
    return <p className="mt-1 truncate text-[11px] text-brand-300/80">{reason}</p>
}
