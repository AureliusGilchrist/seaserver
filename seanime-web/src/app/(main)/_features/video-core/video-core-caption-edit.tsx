"use client"
import { useServerMutation } from "@/api/client/requests"
import { vc_subtitleManager } from "@/app/(main)/_features/video-core/video-core"
import { vc_containerElement, vc_isFullscreen, vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { cn } from "@/components/ui/core/styling"
import { useAtomValue } from "jotai"
import React from "react"
import { createPortal } from "react-dom"
import { LuPencilLine, LuX } from "react-icons/lu"
import { toast } from "sonner"
import { captionPlainText, captionRawText, type CaptionCue, hasInnerStyling, parseCaptionCues, parseEditableTrack } from "./_lib/caption-cues"

export { parseEditableTrack }

/**
 * Quick edit captions (local player): change the wording of the line on screen. The server edits the
 * subtitle track where it lives — the copy being played at once, and the track inside the video
 * file in the background — so the change stays for every later watch.
 */

/** The button in the subtitle menu, shown for an editable (local file) track. */
export function VideoCoreCaptionEditButton({ selectedTrack }: { selectedTrack: number | null }) {
    const subtitleManager = useAtomValue(vc_subtitleManager)
    const [open, setOpen] = React.useState(false)
    const src = subtitleManager?.getFileTrackSrc?.(selectedTrack) ?? null
    const editable = parseEditableTrack(src)
    if (!editable || selectedTrack == null) return null
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white"
            >
                <LuPencilLine className="size-3.5" /> Quick edit captions
            </button>
            {open && <CaptionEditDialog src={src!} track={editable} trackNumber={selectedTrack} onClose={() => setOpen(false)} />}
        </>
    )
}

function CaptionEditDialog({ src, track, trackNumber, onClose }: {
    src: string
    track: { clientId: string, trackIndex: number, ext: string }
    trackNumber: number
    onClose: () => void
}) {
    const video = useAtomValue(vc_videoElement)
    const subtitleManager = useAtomValue(vc_subtitleManager)
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const container = useAtomValue(vc_containerElement)
    const [cues, setCues] = React.useState<CaptionCue[] | null>(null)
    const [drafts, setDrafts] = React.useState<Record<number, string>>({})
    const [error, setError] = React.useState<string | null>(null)
    const wasPlaying = React.useRef(false)

    const { mutateAsync: save, isPending } = useServerMutation<boolean, {
        clientId: string, trackIndex: number, start: number, end: number, oldText: string, newText: string
    }>({
        endpoint: "/api/v1/mediastream/subs-edit",
        method: "POST",
    })

    // Pause while editing; the lines on screen now (or the last one before now) are the ones offered.
    React.useEffect(() => {
        if (video && !video.paused) {
            wasPlaying.current = true
            video.pause()
        }
        const now = video?.currentTime ?? 0
        let cancelled = false
        fetch(src, { cache: "no-store" })
            .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then(text => {
                if (cancelled) return
                const all = parseCaptionCues(text, track.ext)
                let showing = all.filter(c => c.start <= now + 0.05 && c.end >= now - 0.05)
                if (!showing.length) {
                    const before = all.filter(c => c.end <= now).sort((a, b) => b.end - a.end)[0]
                    if (before) showing = [before]
                }
                setCues(showing)
                setDrafts(Object.fromEntries(showing.map((c, i) => [i, captionPlainText(c.raw, track.ext)])))
            })
            .catch((e: unknown) => !cancelled && setError(`Could not read the subtitle track (${e instanceof Error ? e.message : String(e)}).`))
        return () => {
            cancelled = true
        }
    }, [src])

    const close = () => {
        onClose()
        if (wasPlaying.current) video?.play().catch(() => {})
    }

    const submit = async () => {
        if (!cues) return
        let changed = 0
        try {
            for (let i = 0; i < cues.length; i++) {
                const c = cues[i]
                const plain = drafts[i] ?? ""
                if (plain === captionPlainText(c.raw, track.ext)) continue
                await save({
                    clientId: track.clientId,
                    trackIndex: track.trackIndex,
                    start: c.start,
                    end: c.end,
                    oldText: c.raw,
                    newText: captionRawText(c.raw, plain, track.ext),
                })
                changed++
            }
        }
        catch {
            // the request hook shows the error
            return
        }
        if (changed) {
            await subtitleManager?.reloadFileTrack?.(trackNumber)
            toast.success(changed === 1 ? "Caption updated. Saving it into the video file…" : `${changed} captions updated. Saving them into the video file…`)
        }
        close()
    }

    const body = (
        <div
            className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4"
            onClick={e => {
                e.stopPropagation()
                close()
            }}
            onPointerMove={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            data-caption-edit-dialog
        >
            <div
                className="w-full max-w-lg rounded-2xl border border-white/10 bg-gray-950/90 p-5 text-white shadow-2xl backdrop-blur-xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-semibold"><LuPencilLine className="size-4" /> Quick edit captions</h3>
                    <button type="button" aria-label="Close" onClick={close} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                        <LuX className="size-4" />
                    </button>
                </div>
                {error && <p className="text-sm text-red-300">{error}</p>}
                {!error && !cues && <p className="text-sm text-white/60">Reading the subtitle track…</p>}
                {cues && !cues.length && <p className="text-sm text-white/60">No caption on screen here. Seek to the line you want to change and try again.</p>}
                {cues && cues.length > 0 && (
                    <div className="space-y-3">
                        {cues.map((c, i) => (
                            <div key={i} className="space-y-1">
                                <p className="text-[11px] tabular-nums text-white/45">{fmt(c.start)} → {fmt(c.end)}</p>
                                <textarea
                                    autoFocus={i === 0}
                                    rows={Math.min(5, Math.max(2, (drafts[i] ?? "").split("\n").length))}
                                    value={drafts[i] ?? ""}
                                    onChange={e => setDrafts(d => ({ ...d, [i]: e.target.value }))}
                                    onKeyDown={e => {
                                        e.stopPropagation()
                                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit()
                                        if (e.key === "Escape") close()
                                    }}
                                    className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-brand-300/50"
                                />
                                {hasInnerStyling(c.raw, track.ext) && (
                                    <p className="text-[11px] text-amber-300/80">This line has styling in the middle of it; saving keeps only the styling at its start.</p>
                                )}
                            </div>
                        ))}
                        <p className="text-xs text-white/45">Changes the subtitle file itself (MKV files are rewritten in place). Ctrl+Enter saves.</p>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/10">Cancel</button>
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={submit}
                                className={cn("rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-400", isPending && "opacity-60")}
                            >
                                {isPending ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
    // In fullscreen only the player's own element is visible.
    return createPortal(body, isFullscreen && container ? container : document.body)
}

function fmt(s: number) {
    const m = Math.floor(s / 60)
    const sec = (s % 60).toFixed(2).padStart(5, "0")
    return `${m}:${sec}`
}
