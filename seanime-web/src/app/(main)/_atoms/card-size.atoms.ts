"use client"
import { atomWithStorage } from "jotai/utils"

// Card size multiplier (0.5 = 50% smaller, 1 = default, 1.5 = 50% larger)
export const animeCardSizeAtom = atomWithStorage<number>("sea-anime-card-size", 1)
export const mangaCardSizeAtom = atomWithStorage<number>("sea-manga-card-size", 1)

// Returns responsive basis classes based on size multiplier
export function getCardSizeClasses(size: number): string {
    // Size ranges: 0.6 (smallest) to 1.4 (largest)
    if (size <= 0.7) {
        // Extra small - more cards per row
        return "md:basis-1/4 lg:basis-1/5 xl:basis-1/6 2xl:basis-1/8 min-[2000px]:basis-1/10"
    } else if (size <= 0.85) {
        // Small
        return "md:basis-1/3 lg:basis-1/4 xl:basis-1/5 2xl:basis-1/7 min-[2000px]:basis-1/9"
    } else if (size <= 1.0) {
        // Default
        return "md:basis-1/3 lg:basis-1/4 xl:basis-1/5 2xl:basis-1/6 min-[2000px]:basis-1/8"
    } else if (size <= 1.15) {
        // Large
        return "md:basis-1/2 lg:basis-1/3 xl:basis-1/4 2xl:basis-1/5 min-[2000px]:basis-1/6"
    } else {
        // Extra large - fewer cards per row
        return "md:basis-1/2 lg:basis-1/3 xl:basis-1/3 2xl:basis-1/4 min-[2000px]:basis-1/5"
    }
}

// Returns grid classes based on size multiplier
export function getGridSizeClasses(size: number): string {
    if (size <= 0.7) {
        return "grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 min-[2000px]:grid-cols-10"
    } else if (size <= 0.85) {
        return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 min-[2000px]:grid-cols-9"
    } else if (size <= 1.0) {
        return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[2000px]:grid-cols-8"
    } else if (size <= 1.15) {
        return "grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2000px]:grid-cols-6"
    } else {
        return "grid-cols-2 md:grid-cols-2 lg:basis-1/3 xl:grid-cols-3 2xl:grid-cols-4 min-[2000px]:grid-cols-5"
    }
}
