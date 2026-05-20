import { useEffect, useRef, useCallback } from 'react'

/**
 * Advanced browser and hardware optimization for fullscreen video playback
 * Optimizes GPU acceleration, memory management, and browser rendering pipeline
 */
export function useBrowserOptimization() {
    const optimizationTimerRef = useRef<number | null>(null)
    const performanceObserverRef = useRef<PerformanceObserver | null>(null)

    // Force hardware acceleration
    const enableHardwareAcceleration = useCallback(() => {
        const isFullscreen = document.fullscreenElement !== null
        
        if (isFullscreen) {
            // Apply hardware acceleration hints
            document.body.style.transform = 'translateZ(0)'
            document.body.style.willChange = 'transform'
            document.body.style.backfaceVisibility = 'hidden'
            
            // Optimize video elements
            const videos = document.querySelectorAll('video')
            videos.forEach(video => {
                const videoEl = video as HTMLVideoElement
                videoEl.style.transform = 'translateZ(0)'
                videoEl.style.willChange = 'transform'
                videoEl.style.backfaceVisibility = 'hidden'
                videoEl.style.perspective = '1000px'
                videoEl.style.contain = 'strict'
                
                // Force GPU layer
                videoEl.style.boxShadow = '0 0 1px transparent'
                
                // Optimize for streaming
                videoEl.setAttribute('data-optimized', 'fullscreen')
                videoEl.preload = 'metadata'
                
                // Disable power saving features
                videoEl.setAttribute('data-keepalive', 'true')
            })
            
            // Optimize canvas elements
            const canvases = document.querySelectorAll('canvas')
            canvases.forEach(canvas => {
                const canvasEl = canvas as HTMLCanvasElement
                canvasEl.style.transform = 'translateZ(0)'
                canvasEl.style.willChange = 'transform'
                canvasEl.getContext('webgl')?.getExtension('OES_texture_float')
            })
        } else {
            // Reset optimizations when not fullscreen
            document.body.style.transform = ''
            document.body.style.willChange = ''
            document.body.style.backfaceVisibility = ''
            
            const videos = document.querySelectorAll('video[data-optimized]')
            videos.forEach(video => {
                const videoEl = video as HTMLVideoElement
                videoEl.style.transform = ''
                videoEl.style.willChange = ''
                videoEl.style.backfaceVisibility = ''
                videoEl.style.perspective = ''
                videoEl.style.contain = ''
                videoEl.style.boxShadow = ''
                videoEl.removeAttribute('data-optimized')
                videoEl.removeAttribute('data-keepalive')
            })
            
            const canvases = document.querySelectorAll('canvas')
            canvases.forEach(canvas => {
                const canvasEl = canvas as HTMLCanvasElement
                canvasEl.style.transform = ''
                canvasEl.style.willChange = ''
            })
        }
    }, [])

    // Optimize browser rendering pipeline
    const optimizeRenderingPipeline = useCallback(() => {
        const isFullscreen = document.fullscreenElement !== null
        
        if (isFullscreen) {
            // Reduce browser overhead
            if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
                // Prioritize video rendering tasks
                (window as any).scheduler.postTask(() => {}, { 
                    priority: 'user-blocking',
                    delay: 0
                })
            }
            
            // Optimize paint timing
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    // Force layout recalculation during idle time
                    document.body.offsetHeight
                }, { timeout: 100 })
            }
            
            // Reduce browser memory pressure
            if ('memory' in performance) {
                const memory = (performance as any).memory
                if (memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.8) {
                    // Force garbage collection if available
                    if ('gc' in window) {
                        (window as any).gc()
                    }
                }
            }
        }
    }, [])

    // Optimize network stack for streaming
    const optimizeNetworkStack = useCallback(() => {
        const isFullscreen = document.fullscreenElement !== null
        
        if (isFullscreen && 'connection' in navigator) {
            const connection = (navigator as any).connection
            
            // Optimize for video streaming
            if ('effectiveType' in connection) {
                const effectiveType = connection.effectiveType
                
                // Adjust network settings based on connection quality
                switch (effectiveType) {
                    case 'slow-2g':
                    case '2g':
                        // Reduce network overhead
                        connection.saveData = false // We need quality for fullscreen
                        break
                    case '3g':
                    case '4g':
                        // Optimize for high quality
                        connection.saveData = false
                        break
                }
            }
            
            // Prioritize video traffic
            if ('addEffectiveConnectionType' in connection) {
                // Hint to browser about video streaming
                (connection as any).addEffectiveConnectionType('4g')
            }
        }
    }, [])

    // Monitor and optimize performance metrics
    const monitorPerformance = useCallback(() => {
        if (!('PerformanceObserver' in window)) return

        const isFullscreen = document.fullscreenElement !== null
        
        if (isFullscreen) {
            // Monitor frame rate
            if (!performanceObserverRef.current) {
                performanceObserverRef.current = new PerformanceObserver((list) => {
                    const entries = list.getEntries()
                    entries.forEach(entry => {
                        if (entry.entryType === 'measure' && entry.name.includes('video')) {
                            // Optimize if frame drops detected
                            if (entry.duration > 33) { // Below 30fps
                                enableHardwareAcceleration()
                            }
                        }
                    })
                })
                
                performanceObserverRef.current.observe({ 
                    entryTypes: ['measure', 'navigation', 'resource'] 
                })
            }
            
            // Measure video performance
            const videos = document.querySelectorAll('video')
            videos.forEach((video, index) => {
                performance.mark(`video-start-${index}`)
                performance.measure(`video-performance-${index}`, `video-start-${index}`)
            })
        } else {
            // Clean up observer when not fullscreen
            if (performanceObserverRef.current) {
                performanceObserverRef.current.disconnect()
                performanceObserverRef.current = null
            }
        }
    }, [enableHardwareAcceleration])

    // Apply optimizations when fullscreen state changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isFullscreen = document.fullscreenElement !== null
            
            if (isFullscreen) {
                // Apply all optimizations immediately
                enableHardwareAcceleration()
                optimizeRenderingPipeline()
                optimizeNetworkStack()
                
                // Start continuous optimization
                optimizationTimerRef.current = window.setInterval(() => {
                    optimizeRenderingPipeline()
                    optimizeNetworkStack()
                    monitorPerformance()
                }, 2000)
            } else {
                // Clean up when exiting fullscreen
                if (optimizationTimerRef.current !== null) {
                    clearInterval(optimizationTimerRef.current)
                    optimizationTimerRef.current = undefined
                }
                
                // Reset optimizations
                enableHardwareAcceleration()
                
                if (performanceObserverRef.current) {
                    performanceObserverRef.current.disconnect()
                    performanceObserverRef.current = null
                }
            }
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)
        
        // Initial optimization
        enableHardwareAcceleration()
        
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            if (optimizationTimerRef.current) {
                clearInterval(optimizationTimerRef.current)
            }
            if (performanceObserverRef.current) {
                performanceObserverRef.current.disconnect()
            }
        }
    }, [enableHardwareAcceleration, optimizeRenderingPipeline, optimizeNetworkStack, monitorPerformance])

    // Advanced GPU optimization
    const optimizeGPU = useCallback(() => {
        const isFullscreen = document.fullscreenElement !== null
        
        if (isFullscreen) {
            // Create hidden canvas for GPU warm-up
            const canvas = document.createElement('canvas')
            canvas.style.position = 'absolute'
            canvas.style.left = '-9999px'
            canvas.style.top = '-9999px'
            canvas.width = 1
            canvas.height = 1
            
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
            if (gl) {
                // Warm up GPU
                const glContext = gl as WebGLRenderingContext
                glContext.clearColor(0, 0, 0, 1)
                glContext.clear(glContext.COLOR_BUFFER_BIT)
                
                // Force GPU context creation
                const texture = glContext.createTexture()
                glContext.bindTexture(glContext.TEXTURE_2D, texture)
            }
            
            document.body.appendChild(canvas)
            
            // Remove after warm-up
            setTimeout(() => {
                document.body.removeChild(canvas)
            }, 100)
        }
    }, [])

    return {
        enableHardwareAcceleration,
        optimizeRenderingPipeline,
        optimizeNetworkStack,
        optimizeGPU
    }
}

/**
 * Advanced power management optimization
 */
export function usePowerOptimization() {
    const wakeLockRef = useRef<WakeLockSentinel | null>(null)

    // Prevent screen sleep during fullscreen video
    const preventSleep = useCallback(async () => {
        const isFullscreen = document.fullscreenElement !== null
        
        if (isFullscreen && 'wakeLock' in navigator) {
            try {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
                
                wakeLockRef.current.addEventListener('release', () => {
                    wakeLockRef.current = null
                })
            } catch (error) {
                console.warn('Failed to prevent screen sleep:', error)
            }
        } else {
            // Release wake lock when not fullscreen
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {})
                wakeLockRef.current = null
            }
        }
    }, [])

    useEffect(() => {
        document.addEventListener('fullscreenchange', preventSleep)
        
        return () => {
            document.removeEventListener('fullscreenchange', preventSleep)
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {})
                wakeLockRef.current = null
            }
        }
    }, [preventSleep])

    return {
        preventSleep
    }
}
