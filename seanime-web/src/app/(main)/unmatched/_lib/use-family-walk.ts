"use client"
import { FamilyEntry, useUnmatchedFamilySearch } from "@/api/hooks/unmatched.hooks"
import React from "react"

/**
 * Walks an anime's relation family outward, one entry at a time, and reports it as it arrives.
 *
 * The server can walk a whole franchise in one request, but it costs an AniList call per entry made
 * back to back, so a large family is minutes of a modal showing nothing. Asked one node at a time it
 * fills in instead: the root and its immediate relatives land first, and each branch appears as its
 * turn comes.
 *
 * Deliberately a hook over a single root rather than a shared store. Each search result owns its own
 * walk, started when somebody expands it, so opening a list of a hundred results costs nothing until
 * a franchise is actually opened — which is the difference between this being usable and being a
 * hundred franchise walks nobody asked for.
 */
export type FamilyNode = {
    entry: FamilyEntry
    /** How many relations deep this sits from the root. Drives the indentation. */
    depth: number
    /** True while this entry's own relations are still being fetched. */
    pending: boolean
}

export function useFamilyWalk() {
    const { mutate: fetchNode } = useUnmatchedFamilySearch()

    const [entries, setEntries] = React.useState<Map<number, FamilyEntry>>(new Map())
    const [depths, setDepths] = React.useState<Map<number, number>>(new Map())
    const [pendingIds, setPendingIds] = React.useState<Set<number>>(new Set())
    const [rootId, setRootId] = React.useState<number | null>(null)

    // The queue and the visited set are refs: they are the walk's bookkeeping, not the render's, and
    // a re-render for every id pushed would be a re-render per entry of the franchise.
    const queueRef = React.useRef<{ id: number, parentId: number, depth: number }[]>([])
    const visitedRef = React.useRef<Set<number>>(new Set())
    const inFlightRef = React.useRef(false)

    const reset = React.useCallback(() => {
        queueRef.current = []
        visitedRef.current = new Set()
        inFlightRef.current = false
        setEntries(new Map())
        setDepths(new Map())
        setPendingIds(new Set())
        setRootId(null)
    }, [])

    const start = React.useCallback((id: number) => {
        queueRef.current = [{ id, parentId: 0, depth: 0 }]
        visitedRef.current = new Set()
        inFlightRef.current = false
        setEntries(new Map())
        setDepths(new Map([[id, 0]]))
        setPendingIds(new Set([id]))
        setRootId(id)
    }, [])

    // One node per pass, re-triggered by its own result landing.
    React.useEffect(() => {
        if (inFlightRef.current) return

        const next = queueRef.current.shift()
        if (!next) return
        if (visitedRef.current.has(next.id)) {
            // Skip it, but nudge the effect so the walk does not stall on a duplicate.
            setPendingIds(prev => {
                const updated = new Set(prev)
                updated.delete(next.id)
                return updated
            })
            return
        }

        visitedRef.current.add(next.id)
        inFlightRef.current = true

        fetchNode({ animeId: next.id, shallow: true }, {
            onSuccess: (data) => {
                inFlightRef.current = false
                if (!data) return

                const arrived = [data.root, ...(data.entries || [])].filter(Boolean) as FamilyEntry[]

                setEntries(prev => {
                    const updated = new Map(prev)
                    for (const entry of arrived) {
                        if (!entry?.id) continue
                        // First writer wins for the parent link, so the tree does not reshuffle
                        // itself as deeper answers arrive under entries already placed.
                        const existing = updated.get(entry.id)
                        updated.set(entry.id, existing
                            ? { ...entry, parentId: existing.parentId }
                            : { ...entry, parentId: entry.id === next.id ? next.parentId : next.id })
                    }
                    return updated
                })

                const discovered = arrived.filter(entry =>
                    entry.id && entry.id !== next.id && !visitedRef.current.has(entry.id))

                setDepths(prev => {
                    const updated = new Map(prev)
                    updated.set(next.id, next.depth)
                    for (const entry of discovered) {
                        if (!updated.has(entry.id)) updated.set(entry.id, next.depth + 1)
                    }
                    return updated
                })

                for (const entry of discovered) {
                    queueRef.current.push({ id: entry.id, parentId: next.id, depth: next.depth + 1 })
                }

                setPendingIds(prev => {
                    const updated = new Set(prev)
                    updated.delete(next.id)
                    for (const entry of discovered) updated.add(entry.id)
                    return updated
                })
            },
            onError: () => {
                inFlightRef.current = false
                // One node failing costs its branch, not the walk.
                setPendingIds(prev => {
                    const updated = new Set(prev)
                    updated.delete(next.id)
                    return updated
                })
            },
        })
    }, [pendingIds, fetchNode])

    /**
     * The family as a flat, ordered list: parents immediately followed by their children, each
     * carrying the depth to indent it by.
     *
     * Flat rather than nested because that is what the list renders, and because a tree of React
     * components re-rendering per arrival is the thing that made the old picker flicker.
     */
    const nodes = React.useMemo<FamilyNode[]>(() => {
        if (rootId === null) return []

        const byParent = new Map<number, FamilyEntry[]>()
        for (const entry of entries.values()) {
            if (entry.id === rootId) continue
            const parent = entry.parentId || rootId
            if (!byParent.has(parent)) byParent.set(parent, [])
            byParent.get(parent)!.push(entry)
        }

        // Siblings run in the order the series does — an entry further along the franchise sits
        // further down the list — with relation type only breaking ties.
        const seasonOrder: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 }
        const relationOrder: Record<string, number> = {
            PREQUEL: 0, SEQUEL: 1, SIDE_STORY: 2, ALTERNATIVE: 3,
            SPIN_OFF: 4, PARENT: 5, SUMMARY: 6, CHARACTER: 7, OTHER: 8,
        }
        const airedAt = (e: FamilyEntry) => (e.seasonYear || 0) * 10 + (seasonOrder[e.season || ""] ?? 0)
        for (const siblings of byParent.values()) {
            siblings.sort((a, b) => {
                const aYear = a.seasonYear || 0
                const bYear = b.seasonYear || 0
                if ((aYear === 0) !== (bYear === 0)) return aYear === 0 ? 1 : -1
                if (aYear !== 0 && airedAt(a) !== airedAt(b)) return airedAt(a) - airedAt(b)
                return (relationOrder[a.relationType] ?? 9) - (relationOrder[b.relationType] ?? 9)
            })
        }

        const out: FamilyNode[] = []
        const emitted = new Set<number>()
        const walk = (id: number, depth: number) => {
            if (emitted.has(id)) return
            emitted.add(id)

            const entry = entries.get(id)
            if (entry) out.push({ entry, depth, pending: pendingIds.has(id) })

            for (const child of byParent.get(id) || []) {
                walk(child.id, depth + 1)
            }
        }
        walk(rootId, 0)

        return out
    }, [entries, pendingIds, rootId, depths])

    return {
        rootId,
        nodes,
        /** How many entries are still waiting on their own relations. */
        remaining: pendingIds.size,
        isWalking: pendingIds.size > 0,
        start,
        reset,
    }
}
