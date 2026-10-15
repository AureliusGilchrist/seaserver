const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 })

export function formatNumber(value: number): string {
    return Number.isFinite(value) ? numberFormatter.format(value) : String(value)
}
