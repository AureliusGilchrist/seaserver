export function isCurrentRoute(location: { pathname: string, search: string }, path: string, id?: string): boolean {
    const pathname = location.pathname.replace(/\/+$/, "") || "/"
    return pathname === path && (id === undefined || new URLSearchParams(location.search).get("id") === id)
}
