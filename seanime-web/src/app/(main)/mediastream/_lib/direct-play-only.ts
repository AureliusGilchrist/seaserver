import { Models_MediastreamSettings } from "@/api/generated/types"
import { __isMobileShell__ } from "@/types/constants"

/**
 * Direct play only is one setting for the whole server, and the Android WebView cannot decode much
 * of what a desktop client can (most MKV, HEVC, AC3). Held to it, the phone had nothing to play, so
 * the phone always keeps transcoding to fall back on.
 */
export function isDirectPlayOnly(settings: Models_MediastreamSettings | null | undefined) {
    return !!settings?.directPlayOnly && !__isMobileShell__
}
