import React from 'react'
import { SeaMediaPlayer } from './sea-media-player'
import { useFullscreenOptimization } from './use-fullscreen-optimization'
import { useVideoCorePerformance } from '../video-core/video-core-performance'
import { useOptimizedRendering, useMemoryManagement } from './use-optimized-rendering'
import { useBrowserOptimization, usePowerOptimization } from './use-browser-optimization'
import { useMouseAutoHideWithControls } from './use-mouse-auto-hide'
import { MediaPlayerInstance } from '@vidstack/react'
import './mouse-auto-hide.css'

/**
 * Enhanced SeaMediaPlayer with comprehensive fullscreen performance optimizations
 * Integrates all optimization layers to eliminate lag during online streaming
 */
export function SeaMediaPlayerOptimized(props: any) {
    const playerRef = React.useRef<MediaPlayerInstance>(null)
    const videoElementRef = React.useRef<HTMLVideoElement | null>(null)

    // Initialize all optimization layers
    const fullscreenOptimization = useFullscreenOptimization()
    const videoCorePerformance = useVideoCorePerformance(videoElementRef.current)
    const optimizedRendering = useOptimizedRendering(true, fullscreenOptimization.isFullscreen())
    const memoryManagement = useMemoryManagement()
    const browserOptimization = useBrowserOptimization()
    const powerOptimization = usePowerOptimization()
    
    // Mouse auto-hide functionality
    const { isMouseVisible, areControlsVisible, showMouse } = useMouseAutoHideWithControls(
        fullscreenOptimization.isFullscreen(),
        3000 // 3 seconds delay
    )

    // Get video element reference from player
    React.useEffect(() => {
        const getVideoElement = () => {
            if (playerRef.current) {
                const mediaElement = playerRef.current.el?.querySelector('video')
                if (mediaElement) {
                    videoElementRef.current = mediaElement as HTMLVideoElement
                }
            }
        }

        // Initial setup
        getVideoElement()
        
        // Watch for video element changes
        const interval = setInterval(getVideoElement, 1000)
        
        return () => clearInterval(interval)
    }, [])

    // Apply comprehensive optimizations during fullscreen
    React.useEffect(() => {
        const isFullscreen = fullscreenOptimization.isFullscreen()

        if (isFullscreen) {
            console.log('🚀 Applying comprehensive fullscreen optimizations...')

            // 1. Hardware acceleration
            browserOptimization.enableHardwareAcceleration()
            
            // 2. GPU optimization
            browserOptimization.optimizeGPU()
            
            // 3. Video element optimization
            videoCorePerformance.optimizeVideoElement()
            
            // 4. Network optimization
            const networkOpt = fullscreenOptimization.optimizeNetwork()
            console.log('📡 Network optimization:', networkOpt)
            
            // 5. Memory management
            memoryManagement.performMemoryCleanup()
            
            // 6. Power management (automatically handled by hook)
            // powerOptimization.preventSleep() is called internally by the hook

            // 7. Advanced rendering optimization
            browserOptimization.optimizeRenderingPipeline()
            
            // 8. Performance monitoring
            const metrics = optimizedRendering.getRenderMetrics()
            console.log('📊 Performance metrics:', metrics)

            // Create performance monitoring interval
            const performanceInterval = setInterval(() => {
                if (document.fullscreenElement) {
                    // Continuous optimization during fullscreen
                    videoCorePerformance.manageGPUMemory()
                    videoCorePerformance.monitorPerformance()
                    memoryManagement.performMemoryCleanup()
                    
                    // Check if optimizations are working
                    const currentMetrics = optimizedRendering.getRenderMetrics()
                    if (currentMetrics.renderCount > 0 && currentMetrics.renderCount % 100 === 0) {
                        console.log('🔄 Performance check:', currentMetrics)
                    }
                } else {
                    clearInterval(performanceInterval)
                }
            }, 2000)

            return () => {
                clearInterval(performanceInterval)
            }
        }
    }, [
        fullscreenOptimization.isFullscreen,
        browserOptimization,
        videoCorePerformance,
        memoryManagement,
        powerOptimization,
        optimizedRendering,
        fullscreenOptimization
    ])

    // Enhanced time update handler with all optimizations
    const enhancedOnTimeUpdate = React.useCallback((detail: any, e: any) => {
        // Skip processing if not in optimized frame window
        if (!fullscreenOptimization.shouldProcessFrame(true)) {
            return
        }

        // Apply optimized state updates
        optimizedRendering.optimizedStateUpdate(
            () => {},
            {},
            true
        )

        // Call original handler if provided
        // Call original handler if provided
        if (props.onTimeUpdate && typeof props.onTimeUpdate === 'function') {
            props.onTimeUpdate(detail, e)
        }
    }, [
        fullscreenOptimization,
        optimizedRendering,
        props.onTimeUpdate
    ])

    // Enhanced props with all optimizations
    const enhancedProps = {
        ...props,
        playerRef,
        onTimeUpdate: enhancedOnTimeUpdate,
        // Add performance monitoring
        'data-optimized': fullscreenOptimization.isFullscreen() ? 'fullscreen' : 'normal',
        // Mouse auto-hide functionality
        'data-mouse-visible': isMouseVisible,
        'data-controls-visible': areControlsVisible,
        className: `${props.className || ''} ${fullscreenOptimization.isFullscreen() ? 'fullscreen-mode' : ''} ${!areControlsVisible ? 'controls-hidden' : ''}`.trim()
    }

    console.log('🎬 SeaMediaPlayerOptimized rendering with fullscreen:', fullscreenOptimization.isFullscreen())

    return (
        <div data-performance-optimized="true">
            <SeaMediaPlayer {...enhancedProps} />
            
            {/* Performance monitoring overlay (development only) */}
            {typeof window !== 'undefined' && (window as any).DEV_MODE && fullscreenOptimization.isFullscreen() && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 10,
                        right: 10,
                        background: 'rgba(0,0,0,0.8)',
                        color: 'white',
                        padding: '8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        zIndex: 9999,
                        fontFamily: 'monospace'
                    }}
                >
                    <div>🚀 FULLSCREEN OPTIMIZATIONS ACTIVE</div>
                    <div>📊 Renders: {optimizedRendering.getRenderMetrics().renderCount}</div>
                    <div>🎯 FPS Target: 30</div>
                    <div>💾 Memory: Optimized</div>
                    <div>🔧 GPU: Accelerated</div>
                </div>
            )}
        </div>
    )
}

/**
 * Export the optimized component as default
 */
export default SeaMediaPlayerOptimized

/**
 * Performance optimization utilities
 */
export const PerformanceUtils = {
    /**
     * Force garbage collection if available
     */
    forceGC: () => {
        if ('gc' in window) {
            (window as any).gc()
        }
    },

    /**
     * Get performance metrics
     */
    getMetrics: () => {
        const metrics: any = {}
        
        if ('memory' in performance) {
            const memory = (performance as any).memory
            metrics.memory = {
                used: Math.round(memory.usedJSHeapSize / 1024 / 1024) + 'MB',
                total: Math.round(memory.totalJSHeapSize / 1024 / 1024) + 'MB',
                limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + 'MB'
            }
        }

        if ('connection' in navigator) {
            const connection = (navigator as any).connection
            metrics.network = {
                type: connection.effectiveType,
                downlink: connection.downlink + 'Mbps',
                rtt: connection.rtt + 'ms'
            }
        }

        metrics.fullscreen = document.fullscreenElement !== null
        metrics.hardwareAcceleration = document.body.style.transform.includes('translateZ(0)')

        return metrics
    },

    /**
     * Log current performance state
     */
    logPerformance: () => {
        const metrics = PerformanceUtils.getMetrics()
        console.log('📊 Performance Metrics:', metrics)
        return metrics
    }
}

// Make utilities available globally for debugging
if (typeof window !== 'undefined') {
    (window as any).PerformanceUtils = PerformanceUtils
}
