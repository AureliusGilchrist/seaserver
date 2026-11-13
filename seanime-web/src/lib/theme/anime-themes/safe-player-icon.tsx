import React from "react"
import type { PlayerIconOverrides, ThemeIconComponent } from "./types"

type IconProps = { className?: string }

class IconErrorBoundary extends React.Component<{ fallback: React.ReactNode, children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() {
        return { failed: true }
    }
    componentDidCatch() {
        // A broken theme icon must never take the player down; the stock icon is shown instead.
    }
    render() {
        return this.state.failed ? this.props.fallback : this.props.children
    }
}

/** True when the rendered svg has something visible in it. */
function drawsSomething(svg: SVGSVGElement): boolean {
    if (!svg.querySelector("path, rect, circle, ellipse, line, polyline, polygon, g, use, text")) return false
    // getBBox is in the svg's own units, so it reports a full shape even when the svg itself is laid
    // out at 0×0 (e.g. its size class was never generated). Check the on-screen box too — but only
    // when the svg is rendered at all; inside a display:none control bar it has no boxes.
    if (svg.getClientRects().length > 0) {
        const rect = svg.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) return false
    }
    try {
        const box = svg.getBBox()
        return box.width > 0 && box.height > 0
    }
    catch {
        // getBBox throws while the element isn't rendered (display: none); assume it's fine.
        return true
    }
}

/**
 * Wraps a theme's player icon so the stock icon shows instead when the themed one throws, renders
 * no <svg>, or draws nothing. The check runs once after mount.
 */
export function withIconFallback(themed: ThemeIconComponent | undefined, stock: React.ElementType<IconProps>): React.ElementType<IconProps> {
    if (!themed) return stock
    const Themed = themed as React.ElementType<IconProps>
    const Stock = stock
    const Safe = ({ className }: IconProps) => {
        const ref = React.useRef<HTMLSpanElement>(null)
        const [broken, setBroken] = React.useState(false)
        React.useLayoutEffect(() => {
            const svg = ref.current?.querySelector("svg")
            if (!svg || !drawsSomething(svg)) setBroken(true)
        }, [])
        if (broken) return <Stock className={className} />
        return (
            <IconErrorBoundary fallback={<Stock className={className} />}>
                <span ref={ref} className="contents" data-theme-player-icon>
                    <Themed className={className} />
                </span>
            </IconErrorBoundary>
        )
    }
    Safe.displayName = `SafePlayerIcon(${(themed as any).displayName || themed.name || "icon"})`
    return Safe
}

const cache = new WeakMap<object, Map<string, React.ElementType<IconProps>>>()

/**
 * Same as withIconFallback but memoised per icon set and key, so the wrapper component keeps its
 * identity between renders (a new identity would remount the icon and replay its animation).
 */
export function safePlayerIcon(set: PlayerIconOverrides, key: keyof PlayerIconOverrides, stock: React.ElementType<IconProps>): React.ElementType<IconProps> {
    const themed = set[key]
    if (!themed) return stock
    let perSet = cache.get(set)
    if (!perSet) {
        perSet = new Map()
        cache.set(set, perSet)
    }
    const k = `${String(key)}:${(stock as any).displayName || (stock as any).name || ""}`
    let safe = perSet.get(k)
    if (!safe) {
        safe = withIconFallback(themed, stock)
        perSet.set(k, safe)
    }
    return safe
}
