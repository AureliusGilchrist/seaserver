import React, { useState, useRef, useEffect } from "react"
import { cn } from "@/components/ui/core/styling"
import { IconButton } from "@/components/ui/button"
import { motion, AnimatePresence } from "motion/react"
import { FaVolumeUp, FaVolumeMute, FaPlay, FaPause } from "react-icons/fa"
import { useAtom } from "jotai"
import { globalVolumeAtom, globalMuteAtom, pvVolumeActionsAtom } from "../_stores/pv-volume-store"

type PVBackgroundPlayerProps = {
    trailerId?: string | null
    className?: string
}

export function PVBackgroundPlayer({ trailerId, className }: PVBackgroundPlayerProps) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [isVisible, setIsVisible] = useState(false)
    const videoRef = useRef<HTMLIFrameElement>(null)
    const playerRef = useRef<any>(null)

    // Use global volume and mute state
    const [globalVolume] = useAtom(globalVolumeAtom)
    const [isGloballyMuted, setIsGloballyMuted] = useAtom(globalMuteAtom)
    const [, dispatchVolumeAction] = useAtom(pvVolumeActionsAtom)
    
    // Use global volume (10% default)
    const volume = globalVolume
    const isMuted = isGloballyMuted

    useEffect(() => {
        // Initialize YouTube API
        if (!trailerId) return

        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)

        window.onYouTubeIframeAPIReady = () => {
            if (videoRef.current) {
                playerRef.current = new (window as any).YT.Player(videoRef.current, {
                    videoId: trailerId,
                    playerVars: {
                        autoplay: 0,
                        controls: 0,
                        disablekb: 1,
                        enablejsapi: 1,
                        fs: 0,
                        loop: 1,
                        modestbranding: 1,
                        mute: 0,
                        rel: 0,
                        showinfo: 0,
                        iv_load_policy: 3,
                        playlist: trailerId // For looping
                    },
                    events: {
                        onReady: (event: any) => {
                            event.target.setVolume(volume * 100)
                            if (isMuted) {
                                event.target.mute()
                            }
                        }
                    }
                })
            }
        }

        return () => {
            if (playerRef.current) {
                playerRef.current.destroy()
            }
        }
    }, [trailerId])

    useEffect(() => {
        if (playerRef.current) {
            playerRef.current.setVolume(isMuted ? 0 : volume * 100)
        }
    }, [volume, isMuted])

    const togglePlay = () => {
        if (!playerRef.current) return
        
        if (isPlaying) {
            playerRef.current.pauseVideo()
        } else {
            playerRef.current.playVideo()
            setIsVisible(true)
        }
        setIsPlaying(!isPlaying)
    }

    const toggleMute = () => {
        if (!playerRef.current) return
        
        const newMuteState = !isGloballyMuted
        setIsGloballyMuted(newMuteState)
        
        if (newMuteState) {
            playerRef.current.mute()
        } else {
            playerRef.current.unMute()
        }
    }

    const handleVolumeChange = (value: number) => {
    dispatchVolumeAction({
        type: 'setGlobalVolume',
        volume: value
    })
    
    // Unmute if volume is increased and currently muted
    if (value > 0 && isGloballyMuted) {
        setIsGloballyMuted(false)
    }
}

    if (!trailerId) return null

    return (
        <div className={cn("fixed inset-0 z-0 overflow-hidden", className)}>
            {/* Background PV */}
            <div className="absolute inset-0">
                <iframe
                    ref={videoRef}
                    className="w-full h-full scale-150 opacity-30"
                    style={{ 
                        filter: 'blur(20px) brightness(0.4)',
                        transform: 'scale(1.5) translate(-25%, -25%)'
                    }}
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                />
            </div>

            {/* Glass overlay with bumpmap effect */}
            <motion.div 
                className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/10"
                style={{
                    backdropFilter: 'blur(2px) saturate(1.2)',
                    WebkitBackdropFilter: 'blur(2px) saturate(1.2)',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1 }}
            >
                {/* Subtle shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 animate-pulse" />
            </motion.div>

            {/* Controls */}
            <div className="fixed bottom-8 right-8 z-50 space-y-4">
                <AnimatePresence>
                    {isVisible && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: 20 }}
                            className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-3"
                            style={{
                                boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                            }}
                        >
                            {/* Volume slider */}
                            <div className="flex items-center gap-3">
                                <IconButton
                                    size="sm"
                                    icon={isMuted || volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
                                    onClick={toggleMute}
                                    className="text-white/80 hover:text-white hover:bg-white/10"
                                />
                                <div className="flex items-center gap-2">
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={volume}
                                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                        className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                                        style={{
                                            background: `linear-gradient(to right, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.8) ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%, rgba(255,255,255,0.2) 100%)`
                                        }}
                                    />
                                    <span className="text-white/60 text-xs w-8">
                                        {Math.round(volume * 100)}%
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main controls */}
                <div className="flex gap-2">
                    <IconButton
                        size="lg"
                        icon={isPlaying ? <FaPause /> : <FaPlay />}
                        onClick={togglePlay}
                        className="bg-black/60 backdrop-blur-xl border border-white/10 text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                        style={{
                            boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                        }}
                    />
                    
                    <IconButton
                        size="lg"
                        icon={<FaVolumeUp />}
                        onClick={() => setIsVisible(!isVisible)}
                        className="bg-black/60 backdrop-blur-xl border border-white/10 text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                        style={{
                            boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                        }}
                    />
                </div>
            </div>
        </div>
    )
}

// Add this to your global types
declare global {
    interface Window {
        onYouTubeIframeAPIReady?: () => void
        YT: any
    }
}
