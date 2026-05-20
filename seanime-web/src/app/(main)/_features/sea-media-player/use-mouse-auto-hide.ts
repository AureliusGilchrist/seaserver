import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Mouse auto-hide hook for fullscreen video player
 * Hides mouse cursor and controls after a few seconds of inactivity in fullscreen
 */
export function useMouseAutoHide(
    isFullscreen: boolean,
    hideDelay: number = 3000 // 3 seconds default
) {
    const [isMouseVisible, setIsMouseVisible] = useState(true)
    const timeoutRef = useRef<number | undefined>()
    const lastActivityRef = useRef(Date.now())

    // Show mouse and reset timer
    const showMouse = useCallback(() => {
        setIsMouseVisible(true)
        lastActivityRef.current = Date.now()
        
        // Clear existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
        }
        
        // Only set hide timeout if in fullscreen
        if (isFullscreen) {
            timeoutRef.current = window.setTimeout(() => {
                setIsMouseVisible(false)
            }, hideDelay)
        }
    }, [isFullscreen, hideDelay])

    // Hide mouse immediately
    const hideMouse = useCallback(() => {
        setIsMouseVisible(false)
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = undefined
        }
    }, [])

    // Handle mouse movement
    const handleMouseMove = useCallback((event: MouseEvent) => {
        // Only show mouse if there's actual movement (not just tiny jitter)
        const movementThreshold = 2
        if (event.movementX > movementThreshold || event.movementY > movementThreshold) {
            showMouse()
        }
    }, [showMouse])

    // Handle mouse enter/leave
    const handleMouseEnter = useCallback(() => {
        showMouse()
    }, [showMouse])

    const handleMouseLeave = useCallback(() => {
        // Don't hide immediately on leave, let the timeout handle it
        // This prevents flickering when mouse moves near edges
    }, [])

    // Handle keyboard activity (should also show controls)
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        // Show mouse on any key press in fullscreen
        if (isFullscreen) {
            showMouse()
        }
    }, [isFullscreen, showMouse])

    // Set up event listeners
    useEffect(() => {
        if (!isFullscreen) {
            // Always show mouse when not fullscreen
            setIsMouseVisible(true)
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
                timeoutRef.current = undefined
            }
            return
        }

        // Add event listeners for fullscreen mode
        document.addEventListener('mousemove', handleMouseMove, { passive: true })
        document.addEventListener('mouseenter', handleMouseEnter, { passive: true })
        document.addEventListener('mouseleave', handleMouseLeave, { passive: true })
        document.addEventListener('keydown', handleKeyDown, { passive: true })

        // Initial state - show mouse when entering fullscreen
        showMouse()

        return () => {
            // Clean up event listeners
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseenter', handleMouseEnter)
            document.removeEventListener('mouseleave', handleMouseLeave)
            document.removeEventListener('keydown', handleKeyDown)
            
            // Clear timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
                timeoutRef.current = undefined
            }
        }
    }, [isFullscreen, handleMouseMove, handleMouseEnter, handleMouseLeave, handleKeyDown, showMouse])

    // Apply cursor style to document
    useEffect(() => {
        if (isFullscreen) {
            if (isMouseVisible) {
                document.body.style.cursor = 'auto'
                // Remove any cursor hiding styles
                document.body.classList.remove('cursor-hidden')
            } else {
                document.body.style.cursor = 'none'
                // Add cursor hiding class for additional CSS targeting
                document.body.classList.add('cursor-hidden')
            }
        } else {
            // Always show cursor when not fullscreen
            document.body.style.cursor = 'auto'
            document.body.classList.remove('cursor-hidden')
        }

        return () => {
            // Reset cursor style on cleanup
            document.body.style.cursor = 'auto'
            document.body.classList.remove('cursor-hidden')
        }
    }, [isFullscreen, isMouseVisible])

    return {
        isMouseVisible,
        showMouse,
        hideMouse
    }
}

/**
 * Enhanced version that also provides visibility state for UI controls
 */
export function useMouseAutoHideWithControls(
    isFullscreen: boolean,
    hideDelay: number = 3000
) {
    const { isMouseVisible, showMouse, hideMouse } = useMouseAutoHide(isFullscreen, hideDelay)
    
    // Controls visibility follows mouse visibility with a slight delay
    const [areControlsVisible, setAreControlsVisible] = useState(true)
    const controlsTimeoutRef = useRef<number | undefined>()

    useEffect(() => {
        if (isMouseVisible) {
            setAreControlsVisible(true)
            
            // Clear existing controls timeout
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current)
            }
        } else {
            // Hide controls after a short delay after mouse hides
            controlsTimeoutRef.current = window.setTimeout(() => {
                setAreControlsVisible(false)
            }, 500) // 500ms delay after mouse hides
        }

        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current)
            }
        }
    }, [isMouseVisible])

    return {
        isMouseVisible,
        areControlsVisible,
        showMouse,
        hideMouse
    }
}
