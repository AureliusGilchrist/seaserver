"use client"

import React from "react"

/**
 * Mouse Trail (Reward Shop → UI Enhancements → Mouse Trail). A fixed, click-through canvas that
 * spawns small particles where the cursor moves. Off in fullscreen (players) and for users who
 * ask for reduced motion.
 */

type Particle = {
    x: number
    y: number
    vx: number
    vy: number
    life: number
    max: number
    size: number
    hue: number
    glyph?: string
    rot: number
    vr: number
}

type TrailSpec = {
    colors?: string[]
    hue?: [number, number] // random hue range (hsl)
    glyphs?: string[]
    gravity?: number
    rise?: number
    size?: [number, number]
    life?: [number, number]
    spread?: number
    perMove?: number
    line?: boolean // continuous streak instead of particles
    glow?: boolean
}

const SPECS: Record<string, TrailSpec> = {
    sparkle:   { colors: ["#fde68a", "#fbbf24", "#fff"], size: [1, 2.5], life: [20, 40], spread: 1.2, glow: true },
    dots:      { colors: ["rgba(255,255,255,0.7)"], size: [2, 3.5], life: [25, 40], spread: 0.2 },
    fire:      { colors: ["#f97316", "#ef4444", "#fbbf24"], size: [2, 4], life: [18, 32], rise: 0.6, spread: 0.8, glow: true },
    ice:       { colors: ["#bfdbfe", "#7dd3fc", "#e0f2fe"], size: [1.5, 3], life: [30, 50], gravity: 0.03, spread: 0.6 },
    stars:     { glyphs: ["✦", "✧", "⋆"], colors: ["#fde68a", "#c4b5fd"], size: [8, 13], life: [30, 50], spread: 0.8 },
    sakura:    { glyphs: ["🌸"], size: [10, 14], life: [50, 80], gravity: 0.04, spread: 0.7 },
    lightning: { colors: ["#fde047", "#93c5fd"], line: true, life: [8, 12], glow: true },
    rainbow:   { hue: [0, 360], line: true, life: [16, 22] },
    bubbles:   { colors: ["rgba(103,232,249,0.6)"], size: [3, 6], life: [40, 70], rise: 0.5, spread: 0.4 },
    leaves:    { glyphs: ["🍂", "🍁"], size: [10, 14], life: [50, 80], gravity: 0.05, spread: 0.8 },
    hearts:    { glyphs: ["💖", "💗"], size: [9, 13], life: [40, 60], rise: 0.5, spread: 0.4 },
    snow:      { glyphs: ["❄"], colors: ["#e2e8f0"], size: [8, 12], life: [50, 80], gravity: 0.03, spread: 0.6 },
    galaxy:    { colors: ["#818cf8", "#c084fc", "#f0abfc", "#fff"], size: [1, 2.5], life: [40, 70], spread: 1.6, glow: true, perMove: 3 },
    magic:     { colors: ["#a855f7", "#e879f9"], size: [2.5, 5], life: [30, 50], spread: 0.5, glow: true },
    neon:      { colors: ["#a855f7", "#06b6d4"], line: true, life: [14, 20], glow: true },
    confetti:  { hue: [0, 360], size: [2, 4], life: [40, 60], gravity: 0.08, spread: 1.5, perMove: 2 },
    smoke:     { colors: ["rgba(148,163,184,0.35)"], size: [5, 10], life: [40, 70], rise: 0.35, spread: 0.4 },
    void:      { colors: ["#7c3aed", "#1e1b4b", "#000"], size: [2, 4], life: [30, 50], spread: 1.0, glow: true },
    gold:      { colors: ["#fbbf24", "#f59e0b", "#fde68a"], size: [1, 2.2], life: [30, 50], gravity: 0.02, spread: 1.0, glow: true, perMove: 2 },
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const MAX_PARTICLES = 220

export function MouseTrail({ kind }: { kind: string }) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const spec = SPECS[kind]
    const [suppressed, setSuppressed] = React.useState(false)

    // Hidden in fullscreen (the players) and when the system asks for reduced motion.
    React.useEffect(() => {
        const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)")
        const update = () => setSuppressed(!!document.fullscreenElement || !!mq?.matches)
        update()
        document.addEventListener("fullscreenchange", update)
        mq?.addEventListener?.("change", update)
        return () => {
            document.removeEventListener("fullscreenchange", update)
            mq?.removeEventListener?.("change", update)
        }
    }, [])

    React.useEffect(() => {
        if (!spec || suppressed) return
        const canvas = canvasRef.current
        const ctx = canvas?.getContext("2d")
        if (!canvas || !ctx) return

        const resize = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
        }
        resize()
        window.addEventListener("resize", resize)

        const particles: Particle[] = []
        const points: { x: number, y: number, life: number, hue: number }[] = []
        let last: { x: number, y: number } | null = null
        let raf = 0
        let running = false

        const spawn = (x: number, y: number) => {
            if (spec.line) {
                points.push({ x, y, life: rand(...(spec.life ?? [14, 20])), hue: rand(...(spec.hue ?? [0, 0])) })
                return
            }
            const n = spec.perMove ?? 1
            for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
                const life = rand(...(spec.life ?? [30, 50]))
                const spread = spec.spread ?? 0.6
                particles.push({
                    x: x + rand(-3, 3),
                    y: y + rand(-3, 3),
                    vx: rand(-spread, spread),
                    vy: rand(-spread, spread) - (spec.rise ?? 0),
                    life,
                    max: life,
                    size: rand(...(spec.size ?? [2, 3])),
                    hue: rand(...(spec.hue ?? [0, 0])),
                    glyph: spec.glyphs ? spec.glyphs[Math.floor(Math.random() * spec.glyphs.length)] : undefined,
                    rot: rand(0, Math.PI * 2),
                    vr: rand(-0.05, 0.05),
                })
            }
        }

        const color = (p: { hue: number }, i: number) =>
            spec.hue ? `hsl(${p.hue}, 90%, 65%)` : (spec.colors?.[i % (spec.colors?.length ?? 1)] ?? "#fff")

        const tick = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            if (spec.glow) {
                ctx.shadowBlur = 8
            } else {
                ctx.shadowBlur = 0
            }

            if (spec.line) {
                for (let i = points.length - 1; i >= 0; i--) {
                    points[i].life -= 1
                    if (points[i].life <= 0) points.splice(i, 1)
                }
                for (let i = 1; i < points.length; i++) {
                    const a = points[i - 1], b = points[i]
                    const alpha = Math.min(1, b.life / 12)
                    const c = color(b, i)
                    ctx.strokeStyle = c
                    ctx.shadowColor = c
                    ctx.globalAlpha = alpha
                    ctx.lineWidth = kind === "lightning" ? rand(1, 2.5) : 3
                    ctx.lineCap = "round"
                    ctx.beginPath()
                    if (kind === "lightning") {
                        ctx.moveTo(a.x + rand(-4, 4), a.y + rand(-4, 4))
                    } else {
                        ctx.moveTo(a.x, a.y)
                    }
                    ctx.lineTo(b.x, b.y)
                    ctx.stroke()
                }
            } else {
                for (let i = particles.length - 1; i >= 0; i--) {
                    const p = particles[i]
                    p.life -= 1
                    if (p.life <= 0) {
                        particles.splice(i, 1)
                        continue
                    }
                    p.vy += spec.gravity ?? 0
                    p.x += p.vx
                    p.y += p.vy
                    p.rot += p.vr
                    const alpha = Math.max(0, p.life / p.max)
                    const c = color(p, i)
                    ctx.globalAlpha = alpha
                    ctx.shadowColor = c
                    if (p.glyph) {
                        ctx.save()
                        ctx.translate(p.x, p.y)
                        ctx.rotate(p.rot)
                        ctx.fillStyle = c
                        ctx.font = `${p.size}px sans-serif`
                        ctx.textAlign = "center"
                        ctx.textBaseline = "middle"
                        ctx.fillText(p.glyph, 0, 0)
                        ctx.restore()
                    } else {
                        ctx.fillStyle = c
                        ctx.beginPath()
                        ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2)
                        ctx.fill()
                    }
                }
            }
            ctx.globalAlpha = 1

            if (particles.length || points.length) {
                raf = requestAnimationFrame(tick)
            } else {
                running = false
            }
        }

        // Never compete with a playing video for frames.
        const videoPlaying = () => Array.from(document.querySelectorAll("video")).some(v => !v.paused && !v.ended && v.readyState > 2)

        const onMove = (e: PointerEvent) => {
            if (e.pointerType === "touch") return
            if (videoPlaying()) return
            const x = e.clientX, y = e.clientY
            if (last && Math.hypot(x - last.x, y - last.y) < 4) return
            last = { x, y }
            spawn(x, y)
            if (!running) {
                running = true
                raf = requestAnimationFrame(tick)
            }
        }
        window.addEventListener("pointermove", onMove, { passive: true })

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("resize", resize)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
    }, [kind, spec, suppressed])

    if (!spec || suppressed) return null
    return (
        <canvas
            ref={canvasRef}
            data-sea-mouse-trail={kind}
            aria-hidden
            className="fixed inset-0 pointer-events-none z-[9998]"
        />
    )
}
