// Shim: next → type stubs for Metadata and MetadataRoute
export type Metadata = {
    title?: string
    description?: string
    icons?: any
    appleWebApp?: any
    formatDetection?: any
    other?: Record<string, string>
}

export type MetadataRoute = {
    Manifest: {
        name?: string
        short_name?: string
        description?: string
        start_url?: string
        display?: string
        background_color?: string
        theme_color?: string
        icons?: Array<{ src: string; sizes: string; type: string }>
    }
}
