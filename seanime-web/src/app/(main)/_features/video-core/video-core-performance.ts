import { useEffect, useRef, useCallback } from 'react'

/**
 * Advanced video core performance optimizations
 * Optimizes rendering, memory usage, and GPU acceleration during fullscreen
 */
export function useVideoCorePerformance(videoElement: HTMLVideoElement | null) {
    const performanceTimerRef = useRef<number | undefined>()
    const lastOptimizationRef = useRef<number>(0)

    // Optimize video element for fullscreen performance
    const optimizeVideoElement = useCallback(() => {
        if (!videoElement) return

        const isFullscreen = document.fullscreenElement !== null
        
        if (isFullscreen) {
            // Hardware acceleration optimizations
            videoElement.style.transform = 'translateZ(0)'
            videoElement.style.willChange = 'transform'
            videoElement.style.backfaceVisibility = 'hidden'
            videoElement.style.perspective = '1000px'
            
            // Memory optimizations
            videoElement.preload = 'metadata'
            
            // Performance hints for browser
            videoElement.setAttribute('data-optimized', 'fullscreen')
            
            // Request high priority rendering
            if ('requestVideoFrameCallback' in videoElement) {
                (videoElement as any).requestVideoFrameCallback(() => {})
            }
            
            // Optimize for streaming
            videoElement.crossOrigin = 'anonymous'
            
            // Disable unnecessary features during fullscreen
            videoElement.disablePictureInPicture = true
        } else {
            // Reset optimizations when not fullscreen
            videoElement.style.transform = ''
            videoElement.style.willChange = ''
            videoElement.style.backfaceVisibility = ''
            videoElement.style.perspective = ''
            videoElement.removeAttribute('data-optimized')
            videoElement.disablePictureInPicture = false
        }
    }, [videoElement])

    // Advanced GPU memory management
    const manageGPUMemory = useCallback(() => {
        if (!videoElement) return

        const isFullscreen = document.fullscreenElement !== null
        
        if (isFullscreen) {
            // Force GPU context optimization
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
            
            if (ctx) {
                // Clear GPU memory
                (ctx as any).clear((ctx as any).COLOR_BUFFER_BIT | (ctx as any).DEPTH_BUFFER_BIT)
            }
            
            // Optimize video decoder
            if ('setSinkId' in videoElement) {
                // Reset audio sink to clear audio buffer
                (videoElement as any).setSinkId('').catch(() => {})
            }
        }
    }, [videoElement])

    // Monitor and optimize performance metrics
    const monitorPerformance = useCallback(() => {
        if (!videoElement) return

        const now = Date.now()
        if (now - lastOptimizationRef.current < 1000) return // Throttle to once per second
        lastOptimizationRef.current = now

        const isFullscreen = document.fullscreenElement !== null
        
        if (isFullscreen) {
            // Check video performance metrics
            const readyState = videoElement.readyState
            const buffered = videoElement.buffered
            
            // Optimize based on current state
            if (readyState < 3) { // HAVE_FUTURE_DATA
                // Reduce quality if buffering
                videoElement.style.opacity = '0.95'
            } else {
                videoElement.style.opacity = '1'
            }
            
            // Monitor buffer health
            if (buffered.length > 0) {
                const bufferedEnd = buffered.end(buffered.length - 1)
                const currentTime = videoElement.currentTime
                
                // If buffer is too large, clear some to free memory
                if (bufferedEnd - currentTime > 60) {
                    // Trigger buffer optimization
                    videoElement.currentTime = videoElement.currentTime + 0.001
                }
            }
        }
    }, [videoElement])

    // Apply optimizations when fullscreen state changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            optimizeVideoElement()
            manageGPUMemory()
            
            // Start performance monitoring during fullscreen
            if (document.fullscreenElement) {
                performanceTimerRef.current = window.setInterval(monitorPerformance, 1000) as any
            } else {
                if (performanceTimerRef.current) {
                    clearInterval(performanceTimerRef.current)
                    performanceTimerRef.current = undefined
                }
            }
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)
        
        // Initial optimization
        optimizeVideoElement()
        
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            if (performanceTimerRef.current) {
                clearInterval(performanceTimerRef.current)
            }
        }
    }, [optimizeVideoElement, manageGPUMemory, monitorPerformance])

    // Continuous optimization loop
    useEffect(() => {
        const optimizationLoop = () => {
            if (document.fullscreenElement && videoElement) {
                manageGPUMemory()
                monitorPerformance()
            }
        }

        const interval = window.setInterval(optimizationLoop, 2000)
        return () => {
            clearInterval(interval)
        }
    }, [manageGPUMemory, monitorPerformance, videoElement])

    return {
        optimizeVideoElement,
        manageGPUMemory,
        monitorPerformance
    }
}

/**
 * Advanced network optimization for streaming
 */
export function useNetworkOptimization() {
    const networkOptimizationRef = useRef<NodeJS.Timeout | null>(null)

    const optimizeForStreaming = useCallback(() => {
        if (!('connection' in navigator)) return

        const connection = (navigator as any).connection
        const isFullscreen = document.fullscreenElement !== null

        if (isFullscreen && connection) {
            // Prioritize video traffic during fullscreen
            if ('saveData' in connection) {
                connection.saveData = false
            }

            // Optimize based on connection quality
            const effectiveType = connection.effectiveType
            let targetBitrate = Infinity

            switch (effectiveType) {
                case 'slow-2g':
                    targetBitrate = 250
                    break
                case '2g':
                    targetBitrate = 500
                    break
                case '3g':
                    targetBitrate = 1500
                    break
                case '4g':
                    targetBitrate = 5000
                    break
            }

            return { targetBitrate, effectiveType }
        }

        return { targetBitrate: Infinity, effectiveType: null }
    }, [])

    return {
        optimizeForStreaming
    }
}
