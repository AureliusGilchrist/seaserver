const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 })

export function formatNumber(value: number): string {
    return Number.isFinite(value) ? numberFormatter.format(value) : String(value)
}

/**
 * Commas for a count shown as text, and nothing else: a number becomes "12,345", while anything
 * that is not a finite number (undefined, null, an already-formatted string) is returned as it was,
 * so a missing count still renders as nothing rather than as "undefined".
 */
export function formatCount<T>(value: T): T | string {
    return typeof value === "number" && Number.isFinite(value) ? numberFormatter.format(value) : value
}
