export type ListCollection = {
    MediaListCollection?: {
        lists?: Array<{
            status?: string
            entries?: Array<{ status?: string, progress?: number, media?: { id: number } }>
        }>
    }
}

type ListCounts = { onLists: number, planning: number, current: number, completed: number, progress: number }
const summaries = new WeakMap<ListCollection, ListCounts>()

export function countLists(collection: ListCollection | undefined) {
    if (!collection?.MediaListCollection) return null
    const cached = summaries.get(collection)
    if (cached) return cached
    const entries = new Map<number, { status?: string, progress: number }>()
    for (const list of collection.MediaListCollection.lists ?? []) {
        for (const entry of list.entries ?? []) {
            const id = entry.media?.id
            if (!id) continue
            const status = entry.status ?? list.status
            const previous = entries.get(id)
            if (!previous || (!previous.status && status)) {
                entries.set(id, { status, progress: entry.progress ?? 0 })
            }
        }
    }
    let onLists = 0, planning = 0, current = 0, completed = 0, progress = 0
    for (const entry of entries.values()) {
        if (entry.status === "PLANNING") {
            planning++
            continue
        }
        onLists++
        if (entry.status === "CURRENT" || entry.status === "REPEATING") current++
        if (entry.status === "COMPLETED") completed++
        progress += entry.progress
    }
    const summary = { onLists, planning, current, completed, progress }
    summaries.set(collection, summary)
    return summary
}
