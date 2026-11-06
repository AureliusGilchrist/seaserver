export function normalizeHalfHour(hour: number): number {
    return ((Math.round(hour * 2) % 48) + 48) % 48 / 2
}

export function formatHour(hour: number): string {
    const time = normalizeHalfHour(hour)
    const h = Math.floor(time)
    const minutes = time % 1 ? ":30" : ""
    if (h === 0 && !minutes) return "12 am"
    if (h === 12 && !minutes) return "noon"
    return `${h % 12 || 12}${minutes} ${h < 12 ? "am" : "pm"}`
}

export function isInCheckWindow(hour: number, startHour: number, endHour: number): boolean {
    const start = normalizeHalfHour(startHour)
    const end = normalizeHalfHour(endHour)
    if (start === end) return true
    if (start < end) return hour >= start && hour < end
    return hour >= start || hour < end
}
