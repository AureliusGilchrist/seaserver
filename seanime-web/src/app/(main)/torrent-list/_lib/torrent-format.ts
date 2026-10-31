/**
 * Turns a torrent client's formatted rate back into bytes per second.
 *
 * Only for a server too old to send the numeric rates: the frontend can update ahead of it. Handles
 * the shapes clients actually emit — "1.2 MiB/s", "500 KB/s", "0 B/s", "1.5 Mbps", a bare number —
 * and returns 0 for anything it cannot read, since a total that silently drops one torrent is better
 * than a total that reads NaN.
 */
export function parseSpeedToBytes(speed: string | undefined | null): number {
    if (!speed) return 0

    const match = String(speed).trim().match(/^([\d.,]+)\s*([kmgt]?i?)([b])(ps|\/s)?$/i)
    if (!match) return 0

    const value = parseFloat(match[1].replace(/,/g, ""))
    if (!isFinite(value)) return 0

    const multipliers: Record<string, number> = { "": 1, k: 1024, ki: 1024, m: 1024 ** 2, mi: 1024 ** 2, g: 1024 ** 3, gi: 1024 ** 3, t: 1024 ** 4, ti: 1024 ** 4 }
    const unit = (match[2] || "").toLowerCase()
    const bytes = value * (multipliers[unit] ?? 1)

    // "Mbps" is bits, not bytes — eight of them to the byte.
    const isBits = match[3] === "b" && (match[4] || "").toLowerCase() === "ps"
    return isBits ? bytes / 8 : bytes
}

/** Formats bytes per second the way the rows do, so the total reads like the parts. */
export function formatSpeed(bytesPerSecond: number): string {
    if (!isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s"

    const units = ["B/s", "KB/s", "MB/s", "GB/s"]
    let value = bytesPerSecond
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export function formatSize(bytes: number): string {
    if (!isFinite(bytes) || bytes <= 0) return "0 B"

    const units = ["B", "KB", "MB", "GB", "TB"]
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}
