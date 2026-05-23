import { useQuery } from "@tanstack/react-query"
import type { CursorLibraryManifest } from "./types"

export function useCursorManifest() {
    return useQuery<CursorLibraryManifest>({
        queryKey: ["cursor-library", "manifest"],
        queryFn: async () => {
            const r = await fetch("/api/v1/cursor-library/manifest", { credentials: "include" })
            if (!r.ok) throw new Error("Failed to fetch cursor manifest")
            const j = await r.json()
            return (j?.data ?? j) as CursorLibraryManifest
        },
        staleTime: 60_000,
    })
}
