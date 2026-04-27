"use client"

import React from "react"
import { useAtomValue } from "jotai"
import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { useRewards } from "./reward-provider"

// ─── Particle types ───────────────────────────────────────────────────────────

type Vec2 = { x: number; y: number }

interface Particle {
    x: number
    y: number
    vx: number
    vy: number
    life: number       // 0..1, decreases each frame
    maxLife: number
    size: number
    rotation: number
    rotationSpeed: number
    color: string
    type: string
}

// ─── Shape drawing ────────────────────────────────────────────────────────────

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
    const alpha = Math.min(1, p.life * 3) * Math.min(1, (p.life) * 2) // fade in/out
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)

    switch (p.type) {
        case "sakura":
        case "rose":
        case "feathers": {
            // petal shape
            const c = p.type === "rose" ? "#f43f5e" : p.type === "feathers" ? "#f8fafc" : p.color
            ctx.fillStyle = c
            ctx.beginPath()
            ctx.ellipse(0, 0, p.size * 1.2, p.size * 0.6, 0, 0, Math.PI * 2)
            ctx.fill()
            if (p.type === "sakura") {
                ctx.fillStyle = "#fda4af"
                ctx.beginPath()
                ctx.ellipse(0, 0, p.size * 0.5, p.size * 0.2, 0, 0, Math.PI * 2)
                ctx.fill()
            }
            break
        }
        case "snow": {
            ctx.strokeStyle = p.color
            ctx.lineWidth = p.size * 0.35
            ctx.lineCap = "round"
            for (let i = 0; i < 6; i++) {
                ctx.save()
                ctx.rotate((i * Math.PI) / 3)
                ctx.beginPath()
                ctx.moveTo(0, 0)
                ctx.lineTo(0, -p.size)
                ctx.stroke()
                ctx.restore()
            }
            break
        }
        case "sparks":
        case "lightning": {
            ctx.strokeStyle = p.color
            ctx.lineWidth = p.size * 0.4
            ctx.lineCap = "round"
            ctx.beginPath()
            ctx.moveTo(0, -p.size)
            ctx.lineTo(p.size * 0.4, 0)
            ctx.lineTo(-p.size * 0.2, 0)
            ctx.lineTo(p.size * 0.6, p.size)
            ctx.stroke()
            break
        }
        case "embers": {
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size)
            grad.addColorStop(0, "#fbbf24")
            grad.addColorStop(0.5, p.color)
            grad.addColorStop(1, "transparent")
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.arc(0, 0, p.size, 0, Math.PI * 2)
            ctx.fill()
            break
        }
        case "bubbles": {
            ctx.strokeStyle = p.color
            ctx.lineWidth = p.size * 0.2
            ctx.beginPath()
            ctx.arc(0, 0, p.size, 0, Math.PI * 2)
            ctx.stroke()
            ctx.fillStyle = p.color
            ctx.globalAlpha = alpha * 0.15
            ctx.fill()
            ctx.globalAlpha = alpha
            // shine
            ctx.fillStyle = "#fff"
            ctx.globalAlpha = alpha * 0.5
            ctx.beginPath()
            ctx.arc(-p.size * 0.3, -p.size * 0.3, p.size * 0.25, 0, Math.PI * 2)
            ctx.fill()
            break
        }
        case "leaves": {
            ctx.fillStyle = p.color
            ctx.beginPath()
            ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = "#92400e"
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(-p.size, 0)
            ctx.lineTo(p.size, 0)
            ctx.stroke()
            break
        }
        case "stars": {
            ctx.fillStyle = p.color
            const outerR = p.size, innerR = p.size * 0.4
            ctx.beginPath()
            for (let i = 0; i < 5; i++) {
                const a1 = (i * 4 * Math.PI) / 5 - Math.PI / 2
                const a2 = ((i * 4 + 2) * Math.PI) / 5 - Math.PI / 2
                if (i === 0) ctx.moveTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR)
                else ctx.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR)
                ctx.lineTo(Math.cos(a2) * innerR, Math.sin(a2) * innerR)
            }
            ctx.closePath()
            ctx.fill()
            break
        }
        case "hearts": {
            ctx.fillStyle = p.color
            ctx.beginPath()
            ctx.moveTo(0, p.size * 0.3)
            ctx.bezierCurveTo(-p.size * 1.2, -p.size * 0.5, -p.size * 1.5, p.size * 0.8, 0, p.size * 1.4)
            ctx.bezierCurveTo(p.size * 1.5, p.size * 0.8, p.size * 1.2, -p.size * 0.5, 0, p.size * 0.3)
            ctx.fill()
            break
        }
        case "music": {
            ctx.fillStyle = p.color
            ctx.beginPath()
            ctx.arc(0, p.size * 0.6, p.size * 0.5, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillRect(p.size * 0.4, -p.size, p.size * 0.2, p.size * 1.5)
            ctx.fillRect(p.size * 0.4, -p.size, p.size * 0.8, p.size * 0.2)
            break
        }
        case "confetti": {
            ctx.fillStyle = p.color
            ctx.fillRect(-p.size * 0.6, -p.size * 0.3, p.size * 1.2, p.size * 0.6)
            break
        }
        case "fireflies": {
            const grad2 = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2)
            grad2.addColorStop(0, "#ffffff")
            grad2.addColorStop(0.3, p.color)
            grad2.addColorStop(1, "transparent")
            ctx.fillStyle = grad2
            ctx.beginPath()
            ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2)
            ctx.fill()
            break
        }
        case "rain": {
            ctx.strokeStyle = p.color
            ctx.lineWidth = p.size * 0.3
            ctx.lineCap = "round"
            ctx.beginPath()
            ctx.moveTo(0, -p.size * 2)
            ctx.lineTo(0, p.size * 2)
            ctx.stroke()
            break
        }
        case "crystals": {
            ctx.fillStyle = p.color
            ctx.beginPath()
            ctx.moveTo(0, -p.size * 1.5)
            ctx.lineTo(p.size * 0.6, 0)
            ctx.lineTo(0, p.size * 1.5)
            ctx.lineTo(-p.size * 0.6, 0)
            ctx.closePath()
            ctx.fill()
            ctx.globalAlpha = alpha * 0.5
            ctx.fillStyle = "#fff"
            ctx.beginPath()
            ctx.moveTo(0, -p.size * 1.5)
            ctx.lineTo(p.size * 0.2, 0)
            ctx.lineTo(0, p.size * 1.5)
            ctx.closePath()
            ctx.fill()
            break
        }
        case "void":
        case "cosmos":
        case "galaxy":
        case "prismatic": {
            const colors = p.type === "prismatic"
                ? ["#f43f5e", "#f97316", "#facc15", "#4ade80", "#60a5fa", "#a78bfa"]
                : [p.color]
            const col = colors[Math.floor(Math.random() * colors.length)]
            const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size)
            gr.addColorStop(0, col)
            gr.addColorStop(1, "transparent")
            ctx.fillStyle = gr
            ctx.beginPath()
            ctx.arc(0, 0, p.size, 0, Math.PI * 2)
            ctx.fill()
            if (p.type === "void") {
                // add a dark core
                ctx.fillStyle = "#0f0c29"
                ctx.globalAlpha = alpha * 0.6
                ctx.beginPath()
                ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2)
                ctx.fill()
            }
            break
        }
        default: {
            ctx.fillStyle = p.color
            ctx.beginPath()
            ctx.arc(0, 0, p.size, 0, Math.PI * 2)
            ctx.fill()
        }
    }

    ctx.restore()
}

// ─── Spawner ──────────────────────────────────────────────────────────────────

function spawnParticle(type: string, color: string, secondary: string, w: number, h: number): Particle {
    const size = 2 + Math.random() * 5

    // Gravity / velocity presets per type
    let vx = (Math.random() - 0.5) * 1.5
    let vy = 0
    let x = Math.random() * w
    let y = -20
    let maxLife = 0.8 + Math.random() * 0.6
    let rotationSpeed = (Math.random() - 0.5) * 0.06

    switch (type) {
        case "sakura":
        case "feathers":
        case "rose":
            vx = (Math.random() - 0.5) * 1.2
            vy = 0.5 + Math.random() * 1.2
            x = Math.random() * w
            y = -20
            break
        case "leaves":
            vx = (Math.random() - 0.5) * 2
            vy = 0.8 + Math.random() * 1.5
            rotationSpeed = (Math.random() - 0.5) * 0.1
            break
        case "snow":
            vx = (Math.random() - 0.5) * 0.8
            vy = 0.4 + Math.random() * 0.8
            maxLife = 1.5 + Math.random()
            break
        case "embers":
        case "sparks":
        case "fireflies":
            vx = (Math.random() - 0.5) * 2
            vy = -(0.5 + Math.random() * 2)
            x = Math.random() * w
            y = h + 20
            maxLife = 0.6 + Math.random() * 0.8
            break
        case "bubbles":
            vx = (Math.random() - 0.5) * 0.8
            vy = -(0.3 + Math.random() * 1.2)
            x = Math.random() * w
            y = h + 20
            maxLife = 1.2 + Math.random()
            break
        case "hearts":
            vx = (Math.random() - 0.5) * 1.5
            vy = -(0.4 + Math.random() * 1.5)
            x = Math.random() * w
            y = h + 20
            maxLife = 1 + Math.random()
            break
        case "music":
            vx = (Math.random() - 0.5) * 1.2
            vy = -(0.3 + Math.random() * 1)
            x = Math.random() * w
            y = h + 20
            maxLife = 1.2 + Math.random() * 0.8
            break
        case "rain":
            vx = -0.3
            vy = 8 + Math.random() * 5
            x = Math.random() * w
            y = -20
            maxLife = 0.3 + Math.random() * 0.2
            break
        case "lightning":
            vx = (Math.random() - 0.5) * 4
            vy = -(1 + Math.random() * 3)
            x = Math.random() * w
            y = h * 0.5 + Math.random() * h * 0.5
            maxLife = 0.3 + Math.random() * 0.3
            break
        case "confetti":
            vx = (Math.random() - 0.5) * 3
            vy = 1 + Math.random() * 2
            x = Math.random() * w
            y = -20
            rotationSpeed = (Math.random() - 0.5) * 0.2
            break
        case "crystals":
            vx = (Math.random() - 0.5) * 2
            vy = 0.5 + Math.random() * 1.5
            x = Math.random() * w
            y = -20
            rotationSpeed = (Math.random() - 0.5) * 0.04
            break
        case "stars":
        case "cosmos":
        case "galaxy":
        case "prismatic":
        case "void":
            vx = (Math.random() - 0.5) * 1.5
            vy = (Math.random() - 0.5) * 1.5
            x = Math.random() * w
            y = Math.random() * h
            maxLife = 1 + Math.random() * 1.5
            break
    }

    const confettiColors = ["#f43f5e", "#f97316", "#facc15", "#4ade80", "#60a5fa", "#a78bfa", "#f472b6"]
    const particleColor = type === "confetti"
        ? confettiColors[Math.floor(Math.random() * confettiColors.length)]
        : (Math.random() > 0.5 ? color : secondary) || color

    return {
        x, y, vx, vy,
        life: maxLife,
        maxLife,
        size: size * (type === "bubbles" ? 2 : 1),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed,
        color: particleColor,
        type,
    }
}

// ─── Main component ───────────────────────────────────────────────────────────

// Max particles per type
const MAX_COUNTS: Record<string, number> = {
    none: 0,
    sakura: 35, snow: 60, sparks: 50, embers: 45, bubbles: 25,
    leaves: 30, stars: 40, rose: 30, cosmos: 50, fireflies: 20,
    rain: 120, feathers: 25, hearts: 20, music: 15, confetti: 60,
    crystals: 30, lightning: 15, void: 35, galaxy: 50, prismatic: 45,
}

const SPAWN_RATE: Record<string, number> = {
    rain: 8, lightning: 3, sparks: 4, confetti: 5,
}

type ActiveSet = { key: string; color: string; secondary: string; maxCount: number }

function updateSet(set: ActiveSet, particles: Particle[], frame: number, w: number, h: number): Particle[] {
    const { key, color, secondary, maxCount } = set
    const rate = SPAWN_RATE[key] ?? 1
    const ambientTypes = ["stars", "cosmos", "galaxy", "void", "prismatic"]
    let pool = particles.filter(p => (p as any).__set === key)
    const others = particles.filter(p => (p as any).__set !== key)

    if (pool.length < maxCount && frame % Math.max(1, Math.round(6 / rate)) === 0) {
        const p = spawnParticle(key, color, secondary, w, h) as any
        p.__set = key
        pool.push(p)
    }

    pool = pool.filter(p => {
        const decay = key === "fireflies" ? 0.001 : key === "rain" ? 0.04 : 0.004
        p.life -= decay
        if (["sakura", "feathers", "rose", "leaves", "crystals", "confetti", "snow"].includes(key)) {
            p.vy += 0.01
            p.vx += Math.sin(frame * 0.02 + p.y * 0.01) * 0.02
        }
        if (["embers", "sparks", "fireflies", "hearts", "music", "bubbles"].includes(key)) {
            p.vy -= 0.008
            p.vx += (Math.random() - 0.5) * 0.05
        }
        if (key === "fireflies") {
            p.vx += Math.sin(frame * 0.03 + p.x) * 0.05
            p.vy += Math.cos(frame * 0.02 + p.y) * 0.05
            p.vx *= 0.98; p.vy *= 0.98
        }
        if (key === "galaxy") {
            const cx = w / 2, cy = h / 2
            const dx = p.x - cx, dy = p.y - cy
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            p.vx += (-dy / dist) * 0.05; p.vy += (dx / dist) * 0.05
            p.vx *= 0.99; p.vy *= 0.99
        }
        p.x += p.vx; p.y += p.vy; p.rotation += p.rotationSpeed
        if (ambientTypes.includes(key) && p.life <= 0) {
            const np = spawnParticle(key, color, secondary, w, h) as any
            np.__set = key
            Object.assign(p, np)
            return true
        }
        return p.life > 0
    })

    return [...others, ...pool]
}

export function RewardParticlesLayer() {
    const { activeParticleSets } = useRewards()
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const [browserFullscreen, setBrowserFullscreen] = React.useState(false)
    const canvasRef = React.useRef<HTMLCanvasElement>(null)

    // Also detect native browser fullscreen (e.g. manga reader)
    React.useEffect(() => {
        const onFsChange = () => setBrowserFullscreen(!!document.fullscreenElement)
        document.addEventListener("fullscreenchange", onFsChange)
        return () => document.removeEventListener("fullscreenchange", onFsChange)
    }, [])
    const particlesRef = React.useRef<Particle[]>([])
    const animRef = React.useRef<number>(0)
    const frameRef = React.useRef(0)

    const activeSets: ActiveSet[] = activeParticleSets.map(s => ({
        key: s.particleKey,
        color: s.color,
        secondary: s.secondaryColor ?? s.color,
        maxCount: MAX_COUNTS[s.particleKey] ?? 0,
    }))
    const activeKeys = activeSets.map(s => s.key).join(",")

    React.useEffect(() => {
        if (!activeKeys) {
            particlesRef.current = []
            return
        }

        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
        resize()
        window.addEventListener("resize", resize)

        // Remove particles for sets no longer active
        const keySet = new Set(activeSets.map(s => s.key))
        particlesRef.current = particlesRef.current.filter(p => keySet.has((p as any).__set))

        // Pre-seed ambient types
        const ambientTypes = ["stars", "cosmos", "galaxy", "void", "prismatic"]
        for (const s of activeSets) {
            if (ambientTypes.includes(s.key)) {
                const existing = particlesRef.current.filter(p => (p as any).__set === s.key).length
                const toAdd = s.maxCount - existing
                for (let i = 0; i < toAdd; i++) {
                    const p = spawnParticle(s.key, s.color, s.secondary, canvas.width, canvas.height) as any
                    p.__set = s.key
                    particlesRef.current.push(p)
                }
            }
        }

        const tick = () => {
            const w = canvas.width, h = canvas.height
            ctx.clearRect(0, 0, w, h)
            frameRef.current++
            for (const s of activeSets) {
                particlesRef.current = updateSet(s, particlesRef.current, frameRef.current, w, h)
            }
            particlesRef.current.forEach(p => drawParticle(ctx, p))
            animRef.current = requestAnimationFrame(tick)
        }

        animRef.current = requestAnimationFrame(tick)
        return () => {
            cancelAnimationFrame(animRef.current)
            window.removeEventListener("resize", resize)
        }
    }, [activeKeys])

    if (!activeKeys) return null
    if (isFullscreen || browserFullscreen) return null

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[9990]"
            style={{ width: "100vw", height: "100vh" }}
        />
    )
}
