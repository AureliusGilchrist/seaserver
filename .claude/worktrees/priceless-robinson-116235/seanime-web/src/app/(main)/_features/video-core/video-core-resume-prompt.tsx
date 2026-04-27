import { vc_resumePrompt } from "@/app/(main)/_features/video-core/video-core.atoms"
import { Button } from "@/components/ui/button"
import { useAtom } from "jotai/react"
import React from "react"

const RESUME_AUTO_TIMEOUT_MS = 30_000

/**
 * Centered overlay that asks the user whether to resume from a saved position.
 * Auto-resumes after 30 seconds if no action is taken.
 */
export function VideoCoreResumePrompt({ videoRef }: { videoRef: React.MutableRefObject<HTMLVideoElement | null> }) {
    const [prompt, setPrompt] = useAtom(vc_resumePrompt)
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const [countdown, setCountdown] = React.useState(Math.ceil(RESUME_AUTO_TIMEOUT_MS / 1000))

    // Auto-resume timer
    React.useEffect(() => {
        if (!prompt) return

        setCountdown(Math.ceil(RESUME_AUTO_TIMEOUT_MS / 1000))

        const countdownInterval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownInterval)
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        timerRef.current = setTimeout(() => {
            // Auto-resume
            if (videoRef.current && prompt) {
                videoRef.current.currentTime = prompt.time
                videoRef.current.play().catch(() => {})
            }
            setPrompt(null)
        }, RESUME_AUTO_TIMEOUT_MS)

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            clearInterval(countdownInterval)
        }
    }, [prompt?.time])

    if (!prompt) return null

    const handleResume = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (timerRef.current) clearTimeout(timerRef.current)
        if (videoRef.current) {
            videoRef.current.currentTime = prompt.time
            videoRef.current.play().catch(() => {})
        }
        setPrompt(null)
    }

    const handleStartOver = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (timerRef.current) clearTimeout(timerRef.current)
        if (videoRef.current) {
            videoRef.current.currentTime = 0
            videoRef.current.play().catch(() => {})
        }
        setPrompt(null)
    }

    return (
        <div
            data-vc-element="resume-prompt"
            className="absolute inset-0 flex items-center justify-center z-[55]"
            onClick={e => e.stopPropagation()}
            onPointerMove={e => e.stopPropagation()}
        >
            <div className="bg-gray-950/80 backdrop-blur-md rounded-xl p-6 text-center shadow-2xl border border-[--border] max-w-sm">
                <p className="text-white text-lg font-medium mb-1">Resume playback?</p>
                <p className="text-gray-300 text-sm mb-5">
                    You left off at <span className="font-semibold text-white">{prompt.formatted}</span>
                </p>
                <div className="flex gap-3 justify-center">
                    <Button
                        size="sm"
                        intent="white"
                        onClick={handleResume}
                    >
                        Resume
                    </Button>
                    <Button
                        size="sm"
                        intent="gray-outline"
                        onClick={handleStartOver}
                    >
                        Start Over
                    </Button>
                </div>
                <p className="text-gray-500 text-xs mt-3">
                    Auto-resuming in {countdown}s
                </p>
            </div>
        </div>
    )
}
