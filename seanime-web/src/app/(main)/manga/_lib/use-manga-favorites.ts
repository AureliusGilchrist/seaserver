import React from "react"

const STORAGE_KEY = "manga_favorites"

type FavoriteSet = number[]

function loadFavorites(): FavoriteSet {
    if (typeof window === "undefined") return []
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        const filtered: number[] = []
        for (const n of parsed) {
            if (typeof n === "number") filtered.push(n)
        }
        return filtered
    } catch {
        return []
    }
}

function saveFavorites(favs: FavoriteSet) {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favs))
    } catch {
        // ignore storage errors
    }
}

export function useMangaFavorites() {
    const [favorites, setFavorites] = React.useState<FavoriteSet>(() => loadFavorites())

    const isFavorite = React.useCallback((id?: number | string | null) => {
        if (id == null) return false
        const num = Number(id)
        return favorites.includes(num)
    }, [favorites])

    const toggleFavorite = React.useCallback((id?: number | string | null) => {
        if (id == null) return
        const num = Number(id)
        setFavorites((prev) => {
            const exists = prev.includes(num)
            const next = exists ? prev.filter((n) => n !== num) : [...prev, num]
            saveFavorites(next)
            return next
        })
    }, [])

    const addFavorite = React.useCallback((id?: number | string | null) => {
        if (id == null) return
        const num = Number(id)
        setFavorites((prev) => {
            if (prev.includes(num)) return prev
            const next = [...prev, num]
            saveFavorites(next)
            return next
        })
    }, [])

    const removeFavorite = React.useCallback((id?: number | string | null) => {
        if (id == null) return
        const num = Number(id)
        setFavorites((prev) => {
            if (!prev.includes(num)) return prev
            const next = prev.filter((n) => n !== num)
            saveFavorites(next)
            return next
        })
    }, [])

    React.useEffect(() => {
        // keep in sync with external changes (e.g., other tabs)
        const handler = () => setFavorites(loadFavorites())
        window.addEventListener("storage", handler)
        return () => window.removeEventListener("storage", handler)
    }, [])

    return { favorites, isFavorite, toggleFavorite, addFavorite, removeFavorite }
}
