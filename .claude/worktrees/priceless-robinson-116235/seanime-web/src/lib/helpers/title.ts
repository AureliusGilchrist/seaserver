/**
 * Returns the romaji title as the primary display title, falling back through
 * english → userPreferred → native → "N/A".
 */
export function getDisplayTitle(
    title?: { romaji?: string; english?: string; userPreferred?: string; native?: string } | null,
): string {
    return title?.romaji || title?.english || title?.userPreferred || title?.native || "N/A"
}
