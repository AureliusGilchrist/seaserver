import { useEffect, useRef, useCallback, useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'

/**
 * Advanced React rendering optimizations for fullscreen video playback
 * Reduces unnecessary re-renders and optimizes state management during streaming
 */
export function useOptimizedRendering(isPlaying: boolean, isFullscreen: boolean) {
    const renderCountRef = useRef(0)
    const lastRenderTimeRef = useRef(Date.now())
    const optimizationFrameRef = useRef<number>()

    // Memoized render scheduler to prevent excessive re-renders
    const scheduleRender = useCallback((callback: () => void, priority: 'high' | 'normal' | 'low' = 'normal') => {
        const now = Date.now()
        const timeSinceLastRender = now - lastRenderTimeRef.current

        // Throttle renders based on priority and fullscreen state
        const throttleTime = isFullscreen ? 
            (priority === 'high' ? 16 : priority === 'normal' ? 33 : 100) :
            (priority === 'high' ? 8 : priority === 'normal' ? 16 : 50)

        if (timeSinceLastRender < throttleTime) {
            // Schedule for later
            const delay = throttleTime - timeSinceLastRender
            setTimeout(callback, delay)
        } else {
            // Execute immediately
            callback()
            lastRenderTimeRef.current = now
        }
    }, [isFullscreen])

    // Optimized state update that prevents unnecessary re-renders
    const optimizedStateUpdate = useCallback((
        setter: (value: any) => void,
        value: any,
        shouldUpdate: boolean = true
    ) => {
        if (!shouldUpdate) return

        scheduleRender(() => {
            setter(value)
            renderCountRef.current++
        }, 'normal')
    }, [scheduleRender])

    // Performance monitoring
    const getRenderMetrics = useCallback(() => {
        return {
            renderCount: renderCountRef.current,
            averageRenderTime: renderCountRef.current > 0 ? 
                (Date.now() - lastRenderTimeRef.current) / renderCountRef.current : 0,
            isOptimized: isFullscreen
        }
    }, [isFullscreen])

    return {
        scheduleRender,
        optimizedStateUpdate,
        getRenderMetrics
    }
}

/**
 * Advanced memory management for video components
 */
export function useMemoryManagement() {
    const memoryCleanupRef = useRef<number | null>(null)
    const lastCleanupRef = useRef(Date.now())

    const performMemoryCleanup = useCallback(() => {
        const now = Date.now()
        
        // Only cleanup every 5 seconds to avoid excessive operations
        if (now - lastCleanupRef.current < 5000) return
        lastCleanupRef.current = now

        // Clear unused event listeners
        const videos = document.querySelectorAll('video')
        videos.forEach(video => {
            // Clone video to clear event listeners
            const clone = video.cloneNode(true) as HTMLVideoElement
            video.parentNode?.replaceChild(clone, video)
        })

        // Force garbage collection if available
        if ('gc' in window) {
            (window as any).gc()
        }

        // Clear unused image data
        const images = document.querySelectorAll('img[data-optimized]')
        images.forEach(img => {
            const imageEl = img as HTMLImageElement
            if (imageEl.complete) {
                imageEl.removeAttribute('src')
            }
        })
    }, [])

    // Schedule cleanup during fullscreen
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (document.fullscreenElement) {
                // Schedule regular cleanup during fullscreen
                memoryCleanupRef.current = window.setInterval(performMemoryCleanup, 10000)
            } else {
                // Cleanup once when exiting fullscreen
                performMemoryCleanup()
                if (memoryCleanupRef.current) {
                    clearInterval(memoryCleanupRef.current)
                    memoryCleanupRef.current = null
                }
            }
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            if (memoryCleanupRef.current) {
                clearInterval(memoryCleanupRef.current)
            }
        }
    }, [performMemoryCleanup])

    return {
        performMemoryCleanup
    }
}

/**
 * Advanced animation frame optimization
 */
export function useAnimationFrameOptimization() {
    const animationFrameRef = useRef<number>()
    const callbackRef = useRef<(() => void) | null>(null)

    const optimizedRequestAnimationFrame = useCallback((callback: () => void) => {
        // Cancel previous frame if exists
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }

        callbackRef.current = callback

        // Use different timing based on fullscreen state
        const isFullscreen = document.fullscreenElement !== null
        const targetFPS = isFullscreen ? 30 : 60
        const targetFrameTime = 1000 / targetFPS

        let lastFrameTime = 0

        const animate = (timestamp: number) => {
            if (!callbackRef.current) return

            if (timestamp - lastFrameTime >= targetFrameTime) {
                callbackRef.current()
                lastFrameTime = timestamp
            }

            animationFrameRef.current = requestAnimationFrame(animate)
        }

        animationFrameRef.current = requestAnimationFrame(animate)
    }, [])

    const cancelOptimizedAnimation = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
            animationFrameRef.current = undefined
        }
        callbackRef.current = null
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return cancelOptimizedAnimation
    }, [cancelOptimizedAnimation])

    return {
        optimizedRequestAnimationFrame,
        cancelOptimizedAnimation
    }
}

/**
 * Advanced state management optimization
 */
export function useOptimizedState<T>(initialValue: T) {
    const stateRef = useRef<T>(initialValue)
    const subscribersRef = useRef<Set<(value: T) => void>>(new Set())
    const updateTimeoutRef = useRef<number>()

    const subscribe = useCallback((callback: (value: T) => void) => {
        subscribersRef.current.add(callback)
        return () => {
            subscribersRef.current.delete(callback)
        }
    }, [])

    const setState = useCallback((newValue: T | ((prev: T) => T), debounce: number = 0) => {
        const updateValue = () => {
            const value = typeof newValue === 'function' ? 
                (newValue as (prev: T) => T)(stateRef.current) : newValue
            
            if (value !== stateRef.current) {
                stateRef.current = value
                
                // Notify all subscribers
                subscribersRef.current.forEach(callback => {
                    try {
                        callback(value)
                    } catch (error) {
                        console.error('Error in state subscriber:', error)
                    }
                })
            }
        }

        if (debounce > 0) {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current)
            }
            updateTimeoutRef.current = window.setTimeout(updateValue, debounce)
        } else {
            updateValue()
        }
    }, [])

    const getState = useCallback(() => stateRef.current, [])

    return {
        subscribe,
        setState,
        getState
    }
}
