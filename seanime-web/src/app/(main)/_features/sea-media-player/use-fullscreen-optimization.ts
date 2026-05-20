import { useEffect, useRef, useCallback } from 'react'

/**
 * Advanced fullscreen performance optimization hook
 * Implements multiple layers of optimization to eliminate lag during online streaming
 */
export function useFullscreenOptimization() {
    const frameCountRef = useRef(0)
    const lastFullscreenStateRef = useRef(false)
    const optimizationTimerRef = useRef<number | null>(null)

    // Detect fullscreen state changes
    const isFullscreen = useCallback(() => {
        return document.fullscreenElement !== null
    }, [])

    // Advanced frame throttling for fullscreen
    const shouldProcessFrame = useCallback((aggressive = false) => {
        const currentFullscreen = isFullscreen()
        const frameCount = frameCountRef.current++
        
        // Different throttling rates based on fullscreen state and mode
        if (currentFullscreen) {
            if (aggressive) {
                return frameCount % 30 === 0 // Very aggressive during fullscreen
            } else {
                return frameCount % 15 === 0 // Moderate during fullscreen
            }
        } else {
            return frameCount % 5 === 0 // Normal when not fullscreen
        }
    }, [isFullscreen])

    // Optimize browser rendering during fullscreen
    const optimizeRendering = useCallback(() => {
        if (isFullscreen()) {
            // Request hardware acceleration
            if (typeof document !== 'undefined') {
                document.body.style.transform = 'translateZ(0)'
                document.body.style.willChange = 'transform'
            }
            
            // Reduce browser overhead
            if (typeof window !== 'undefined') {
                // Suggest browser to prioritize video rendering
                if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
                    (window as any).scheduler.postTask(() => {}, { priority: 'user-blocking' })
                }
            }
        } else {
            // Reset optimizations when exiting fullscreen
            if (typeof document !== 'undefined') {
                document.body.style.transform = ''
                document.body.style.willChange = ''
            }
        }
    }, [isFullscreen])

    // Monitor fullscreen state changes
    useEffect(() => {
        const checkFullscreen = () => {
            const currentFullscreen = isFullscreen()
            
            if (currentFullscreen !== lastFullscreenStateRef.current) {
                lastFullscreenStateRef.current = currentFullscreen
                optimizeRendering()
                
                // Clear any existing optimization timer
                if (optimizationTimerRef.current) {
                    clearTimeout(optimizationTimerRef.current)
                }
                
                // Apply additional optimizations after fullscreen change
                optimizationTimerRef.current = setTimeout(() => {
                    if (currentFullscreen) {
                        // Force garbage collection if available
                        if ('gc' in window) {
                            (window as any).gc()
                        }
                        
                        // Optimize video element
                        const videos = document.querySelectorAll('video')
                        videos.forEach(video => {
                            video.style.transform = 'translateZ(0)'
                            video.style.willChange = 'transform'
                            video.setAttribute('playsinline', 'false')
                        })
                    }
                }, 100)
            }
        }

        // Check fullscreen state every 100ms
        const interval = setInterval(checkFullscreen, 100)
        
        return () => {
            clearInterval(interval)
            if (optimizationTimerRef.current) {
                clearTimeout(optimizationTimerRef.current)
            }
        }
    }, [isFullscreen, optimizeRendering])

    // Network optimization for streaming
    const optimizeNetwork = useCallback(() => {
        if (isFullscreen() && 'connection' in navigator) {
            const connection = (navigator as any).connection
            
            // Suggest browser to optimize for video streaming
            if (connection && 'effectiveType' in connection) {
                // Adjust quality based on connection during fullscreen
                const effectiveType = connection.effectiveType
                if (effectiveType === 'slow-2g' || effectiveType === '2g') {
                    return { shouldReduceQuality: true, targetBitrate: 500 }
                } else if (effectiveType === '3g') {
                    return { shouldReduceQuality: true, targetBitrate: 1500 }
                }
            }
        }
        return { shouldReduceQuality: false, targetBitrate: null }
    }, [isFullscreen])

    return {
        isFullscreen,
        shouldProcessFrame,
        optimizeNetwork,
        optimizeRendering
    }
}
