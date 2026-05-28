import * as React from "react"

/**
 * Polyfill for React.useEffectEvent (canary).
 * Returns a stable function whose body is updated on every render.
 */
export function useEffectEvent<T extends (...args: any[]) => any>(fn: T): T {
    const ref = React.useRef(fn)
    React.useEffect(() => {
        ref.current = fn
    })
    return React.useCallback(((...args: any[]) => ref.current(...args)) as T, [])
}
