import { MediaFamilyMember } from "@/api/hooks/anilist.hooks"
import { useClientSettings } from "@/lib/client-settings"

// What the Franchise section on a details page includes. Relation kinds group AniList's relation
// types the way people think of them; media kinds split formats into anime / manga / novels…

export const FRANCHISE_RELATION_KINDS = [
    { id: "sequel", label: "Sequels & prequels", types: ["SEQUEL", "PREQUEL"] },
    { id: "side_story", label: "Side stories", types: ["SIDE_STORY"] },
    { id: "spin_off", label: "Spin-offs", types: ["SPIN_OFF"] },
    { id: "alternative", label: "Alternative versions", types: ["ALTERNATIVE"] },
    { id: "parent", label: "Parent story", types: ["PARENT"] },
    { id: "summary", label: "Summaries & recaps", types: ["SUMMARY"] },
    { id: "compilation", label: "Compilations", types: ["COMPILATION", "CONTAINS"] },
    { id: "adaptation", label: "Adaptations & source", types: ["ADAPTATION", "SOURCE"] },
    { id: "character", label: "Shared characters", types: ["CHARACTER"] },
    { id: "other", label: "Other", types: ["OTHER"] },
] as const

export const FRANCHISE_MEDIA_KINDS = [
    { id: "anime", label: "Anime" },
    { id: "manga", label: "Manga" },
    { id: "novel", label: "Light novels" },
    { id: "one_shot", label: "One-shots" },
    { id: "music", label: "Music" },
] as const

export type FranchiseRelationKind = typeof FRANCHISE_RELATION_KINDS[number]["id"]
export type FranchiseMediaKind = typeof FRANCHISE_MEDIA_KINDS[number]["id"]

export const FRANCHISE_DEFAULT_RELATIONS: FranchiseRelationKind[] =
    FRANCHISE_RELATION_KINDS.map(k => k.id).filter(id => id !== "character")
export const FRANCHISE_DEFAULT_MEDIA_KINDS: FranchiseMediaKind[] = ["anime", "manga", "novel", "one_shot"]
export const FRANCHISE_DEFAULT_INITIAL_COUNT = 8

export function franchiseRelationKind(relation: string): FranchiseRelationKind {
    return FRANCHISE_RELATION_KINDS.find(k => (k.types as readonly string[]).includes(relation))?.id ?? "other"
}

export function franchiseMediaKind(m: Pick<MediaFamilyMember, "type" | "format">): FranchiseMediaKind {
    if (m.type === "ANIME") return m.format === "MUSIC" ? "music" : "anime"
    if (m.format === "NOVEL") return "novel"
    if (m.format === "ONE_SHOT") return "one_shot"
    return "manga"
}

export function useFranchiseSettings() {
    const s = useClientSettings()
    return {
        relations: (s.franchiseRelations ?? FRANCHISE_DEFAULT_RELATIONS) as FranchiseRelationKind[],
        mediaKinds: (s.franchiseMediaKinds ?? FRANCHISE_DEFAULT_MEDIA_KINDS) as FranchiseMediaKind[],
        initialCount: Math.max(2, Math.min(48, s.franchiseInitialCount ?? FRANCHISE_DEFAULT_INITIAL_COUNT)),
    }
}

const RELATION_LABELS: Record<string, string> = {
    CURRENT: "You are here",
    SEQUEL: "Sequel",
    PREQUEL: "Prequel",
    SIDE_STORY: "Side story",
    SPIN_OFF: "Spin-off",
    ALTERNATIVE: "Alternative",
    PARENT: "Parent story",
    SUMMARY: "Summary",
    COMPILATION: "Compilation",
    CONTAINS: "Contains",
    ADAPTATION: "Adaptation",
    SOURCE: "Source",
    CHARACTER: "Shared characters",
    OTHER: "Related",
}

export function franchiseRelationLabel(m: Pick<MediaFamilyMember, "relation" | "direct">): string {
    if (m.relation === "CURRENT") return RELATION_LABELS.CURRENT
    if (!m.direct) return "Franchise"
    return RELATION_LABELS[m.relation] ?? m.relation.replace(/_/g, " ").toLowerCase()
}
