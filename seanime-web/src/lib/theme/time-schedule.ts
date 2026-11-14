import React from "react"

/**
 * Time-of-day switching for Personal -> Display: light/dark by the clock and wallpapers by the clock.
 * Everything is in the device's local time, to the minute.
 */

export const DEFAULT_LIGHT_START_HOUR = 7
export const DEFAULT_DARK_START_HOUR = 19

export type WallpaperScheduleEntry = { fromHour: number, url: string, label?: string }

/** The local time as fractional hours (14.5 = 2:30 pm), updated at every minute boundary. */
export function useLocalHour(): number {
    const read = () => {
        const d = new Date()
        return d.getHours() + d.getMinutes() / 60
    }
    const [hour, setHour] = React.useState(read)
    React.useEffect(() => {
        let t: ReturnType<typeof setTimeout>
        const tick = () => {
            setHour(read())
            // Re-arm for just after the next minute starts.
            t = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
        }
        t = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
        // A laptop waking from sleep: catch up at once instead of on the next minute.
        const onVisible = () => document.visibilityState === "visible" && setHour(read())
        document.addEventListener("visibilitychange", onVisible)
        return () => {
            clearTimeout(t)
            document.removeEventListener("visibilitychange", onVisible)
        }
    }, [])
    return hour
}

/** Whether `hour` falls in [start, end), a window that may cross midnight. */
export function inHourWindow(hour: number, start: number, end: number): boolean {
    if (start === end) return false
    return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

/** The entry whose window holds `hour`: the latest one starting at or before it, wrapping past midnight. */
export function pickScheduledWallpaper(entries: WallpaperScheduleEntry[] | undefined, hour: number): WallpaperScheduleEntry | null {
    const list = (entries ?? []).filter(e => e && e.url).slice().sort((a, b) => a.fromHour - b.fromHour)
    if (!list.length) return null
    let found: WallpaperScheduleEntry | null = null
    for (const e of list) {
        if (e.fromHour <= hour) found = e
    }
    // Before the first entry of the day: the last one of the day before is still on.
    return found ?? list[list.length - 1]
}

export function formatHour(h: number): string {
    const hh = Math.floor(h) % 24
    const suffix = hh < 12 ? "am" : "pm"
    const twelve = hh % 12 === 0 ? 12 : hh % 12
    return `${twelve} ${suffix}`
}
