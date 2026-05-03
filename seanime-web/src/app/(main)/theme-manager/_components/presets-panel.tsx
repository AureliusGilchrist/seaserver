"use client"
import React from "react"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import { useUICustomize } from "@/lib/ui-customize/ui-customize-provider"
import type { UICustomizeState } from "@/lib/ui-customize/ui-customize-definitions"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useAtomValue } from "jotai"
import { cn } from "@/components/ui/core/styling"
import {
    LuDownload, LuUpload, LuTrash2, LuCopy, LuCheck, LuPlus, LuBookmark,
} from "react-icons/lu"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UISetupPreset {
    id: string
    name: string
    description: string
    createdAt: string
    themeId: string
    backgroundImageUrl: string | null
    effects: {
        dim: number
        blur: number
        exposure: number
        saturation: number
        contrast: number
        vignetteStrength: number
        vignetteSize: number
        glowStrength: number
        glowSpeed: number
        glowScale: number
        scanlinesStrength: number
        scanlinesSize: number
        noiseStrength: number
        noiseSpeed: number
    }
    uiCustomize: UICustomizeState
}

function presetsKey(profileKey: string) { return `sea-ui-setup-presets-${profileKey}` }

function loadPresets(profileKey: string): UISetupPreset[] {
    try {
        const raw = localStorage.getItem(presetsKey(profileKey))
        return raw ? (JSON.parse(raw) as UISetupPreset[]) : []
    } catch {
        return []
    }
}

function savePresets(presets: UISetupPreset[], profileKey: string) {
    try { localStorage.setItem(presetsKey(profileKey), JSON.stringify(presets)) } catch {}
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PresetsPanel() {
    const currentProfile = useAtomValue(currentProfileAtom)
    const profileKey = currentProfile?.id ? String(currentProfile.id) : "default"
    const {
        themeId,
        setThemeId,
        activeBackgroundUrl,
        setActiveBackgroundUrl,
        backgroundDim, setBackgroundDim,
        backgroundBlur, setBackgroundBlur,
        backgroundExposure, setBackgroundExposure,
        backgroundSaturation, setBackgroundSaturation,
        backgroundContrast, setBackgroundContrast,
        vignetteStrength, setVignetteStrength,
        vignetteSize, setVignetteSize,
        glowStrength, setGlowStrength,
        glowSpeed, setGlowSpeed,
        glowScale, setGlowScale,
        scanlinesStrength, setScanlinesStrength,
        scanlinesSize, setScanlinesSize,
        noiseStrength, setNoiseStrength,
        noiseSpeed, setNoiseSpeed,
    } = useAnimeTheme()

    const { state: uiState, setAllState } = useUICustomize()

    const [presets, setPresets] = React.useState<UISetupPreset[]>(() => loadPresets(profileKey))

    // Reload when profile switches
    React.useEffect(() => {
        setPresets(loadPresets(profileKey))
    }, [profileKey])
    const [nameInput, setNameInput] = React.useState("")
    const [descInput, setDescInput] = React.useState("")
    const [importJson, setImportJson] = React.useState("")
    const [importError, setImportError] = React.useState("")
    const [copiedId, setCopiedId] = React.useState<string | null>(null)
    const [appliedId, setAppliedId] = React.useState<string | null>(null)

    // Capture the current full setup as a preset object
    const captureCurrentSetup = (): Omit<UISetupPreset, "id" | "name" | "description" | "createdAt"> => ({
        themeId,
        backgroundImageUrl: activeBackgroundUrl,
        effects: {
            dim: backgroundDim,
            blur: backgroundBlur,
            exposure: backgroundExposure,
            saturation: backgroundSaturation,
            contrast: backgroundContrast,
            vignetteStrength,
            vignetteSize,
            glowStrength,
            glowSpeed,
            glowScale,
            scanlinesStrength,
            scanlinesSize,
            noiseStrength,
            noiseSpeed,
        },
        uiCustomize: { ...uiState },
    })

    const handleSave = () => {
        if (!nameInput.trim()) return
        const preset: UISetupPreset = {
            id: `preset-${Date.now()}`,
            name: nameInput.trim(),
            description: descInput.trim(),
            createdAt: new Date().toISOString(),
            ...captureCurrentSetup(),
        }
        const updated = [preset, ...presets]
        setPresets(updated)
        savePresets(updated, profileKey)
        setNameInput("")
        setDescInput("")
    }

    const handleApply = (preset: UISetupPreset) => {
        // Apply theme
        setThemeId(preset.themeId as any)
        // Apply wallpaper
        setActiveBackgroundUrl(preset.backgroundImageUrl)
        // Apply effects
        const e = preset.effects
        setBackgroundDim(e.dim ?? 0.3)
        setBackgroundBlur(e.blur ?? 30)
        setBackgroundExposure(e.exposure ?? 1)
        setBackgroundSaturation(e.saturation ?? 1)
        setBackgroundContrast(e.contrast ?? 1)
        setVignetteStrength(e.vignetteStrength ?? 0)
        setVignetteSize(e.vignetteSize ?? 0.5)
        setGlowStrength(e.glowStrength ?? 0)
        setGlowSpeed(e.glowSpeed ?? 1)
        setGlowScale(e.glowScale ?? 1)
        setScanlinesStrength(e.scanlinesStrength ?? 0)
        setScanlinesSize(e.scanlinesSize ?? 0.5)
        setNoiseStrength(e.noiseStrength ?? 0)
        setNoiseSpeed(e.noiseSpeed ?? 1)
        // Apply UI customize
        if (preset.uiCustomize) setAllState(preset.uiCustomize)

        setAppliedId(preset.id)
        setTimeout(() => setAppliedId(null), 2000)
    }

    const handleDelete = (id: string) => {
        const updated = presets.filter(p => p.id !== id)
        setPresets(updated)
        savePresets(updated, profileKey)
    }

    const handleExport = (preset: UISetupPreset) => {
        const json = JSON.stringify(preset, null, 2)
        navigator.clipboard.writeText(json).then(() => {
            setCopiedId(preset.id)
            setTimeout(() => setCopiedId(null), 2000)
        })
    }

    const handleExportAll = () => {
        const json = JSON.stringify(presets, null, 2)
        const blob = new Blob([json], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "seanime-presets.json"
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleImport = () => {
        setImportError("")
        try {
            const parsed = JSON.parse(importJson)
            // Support both single preset and array
            const items: UISetupPreset[] = (Array.isArray(parsed) ? parsed : [parsed]) as UISetupPreset[]
            // Basic validation
            for (const item of items) {
                if (!item.name || !item.themeId) throw new Error("Invalid preset: missing name or themeId")
                // Ensure IDs are unique
                if (!item.id) item.id = `preset-${Date.now()}-${Math.random()}`
            }
            const updated = [...items, ...presets]
            setPresets(updated)
            savePresets(updated, profileKey)
            setImportJson("")
        } catch (e: any) {
            setImportError(e.message ?? "Invalid JSON")
        }
    }

    return (
        <div className="space-y-8">
            {/* ── Save current setup ── */}
            <div className="rounded-2xl border border-[--border] bg-[--paper] p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <LuBookmark className="w-4 h-4 text-[--color-brand-400]" />
                    <h2 className="text-lg font-semibold">Save Current Setup</h2>
                </div>
                <p className="text-sm text-[--muted]">
                    Captures your active theme, wallpaper, all effect sliders, and UI customizations into a single reusable preset.
                </p>
                <div className="space-y-3">
                    <input
                        type="text"
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        placeholder="Preset name…"
                        className="w-full bg-[--background] border border-[--border] rounded-xl px-4 py-2.5 text-sm text-[--foreground] placeholder:text-[--muted] focus:outline-none focus:border-[--color-brand-500] transition-colors"
                    />
                    <textarea
                        value={descInput}
                        onChange={e => setDescInput(e.target.value)}
                        placeholder="Description (optional)…"
                        rows={2}
                        className="w-full resize-none bg-[--background] border border-[--border] rounded-xl px-4 py-2.5 text-sm text-[--foreground] placeholder:text-[--muted] focus:outline-none focus:border-[--color-brand-500] transition-colors"
                    />
                    <button
                        onClick={handleSave}
                        disabled={!nameInput.trim()}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                            nameInput.trim()
                                ? "bg-[--color-brand-600] text-white hover:bg-[--color-brand-500]"
                                : "bg-[--color-gray-800] text-[--muted] cursor-not-allowed opacity-50",
                        )}
                    >
                        <LuPlus className="w-4 h-4" />
                        Save Preset
                    </button>
                </div>
            </div>

            {/* ── Saved presets ── */}
            {presets.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">My Presets <span className="text-[--muted] text-sm font-normal">({presets.length})</span></h2>
                        <button
                            onClick={handleExportAll}
                            className="flex items-center gap-1.5 text-xs text-[--muted] hover:text-[--foreground] px-3 py-1.5 rounded-lg bg-[--paper] border border-[--border] transition-colors"
                        >
                            <LuDownload className="w-3.5 h-3.5" />
                            Export All
                        </button>
                    </div>

                    <div className="grid gap-3">
                        {presets.map(preset => (
                            <div
                                key={preset.id}
                                className="rounded-xl border border-[--border] bg-[--paper] p-4 space-y-3"
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm truncate">{preset.name}</p>
                                        {preset.description && (
                                            <p className="text-xs text-[--muted] mt-0.5 line-clamp-2">{preset.description}</p>
                                        )}
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[--background] border border-[--border] text-[--muted]">{preset.themeId}</span>
                                            {preset.backgroundImageUrl && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[--background] border border-[--border] text-[--muted]">wallpaper</span>
                                            )}
                                            <span className="text-[10px] text-[--muted]">{new Date(preset.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        onClick={() => handleApply(preset)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            appliedId === preset.id
                                                ? "bg-green-600/20 text-green-400 border border-green-600/30"
                                                : "bg-[--color-brand-600]/20 text-[--color-brand-400] border border-[--color-brand-600]/30 hover:bg-[--color-brand-600]/30",
                                        )}
                                    >
                                        {appliedId === preset.id ? <LuCheck className="w-3.5 h-3.5" /> : <LuUpload className="w-3.5 h-3.5" />}
                                        {appliedId === preset.id ? "Applied!" : "Apply"}
                                    </button>
                                    <button
                                        onClick={() => handleExport(preset)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[--muted] bg-[--background] border border-[--border] hover:text-[--foreground] transition-colors"
                                    >
                                        {copiedId === preset.id ? <LuCheck className="w-3.5 h-3.5 text-green-400" /> : <LuCopy className="w-3.5 h-3.5" />}
                                        {copiedId === preset.id ? "Copied!" : "Copy JSON"}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(preset.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[--muted] bg-[--background] border border-[--border] hover:text-red-400 hover:border-red-400/30 transition-colors ml-auto"
                                    >
                                        <LuTrash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {presets.length === 0 && (
                <div className="text-center py-12 text-[--muted] text-sm">
                    <LuBookmark className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p>No presets saved yet.</p>
                    <p className="text-xs mt-1 opacity-70">Set up your perfect look and save it above.</p>
                </div>
            )}

            {/* ── Import ── */}
            <div className="rounded-2xl border border-[--border] bg-[--paper] p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <LuUpload className="w-4 h-4 text-[--color-brand-400]" />
                    <h2 className="text-lg font-semibold">Import Preset</h2>
                </div>
                <p className="text-sm text-[--muted]">Paste a preset JSON (single object or array) shared by someone else.</p>
                <textarea
                    value={importJson}
                    onChange={e => { setImportJson(e.target.value); setImportError("") }}
                    placeholder='Paste preset JSON here…'
                    rows={5}
                    className="w-full resize-none font-mono text-xs bg-[--background] border border-[--border] rounded-xl px-4 py-3 text-[--foreground] placeholder:text-[--muted] focus:outline-none focus:border-[--color-brand-500] transition-colors"
                />
                {importError && (
                    <p className="text-xs text-red-400">{importError}</p>
                )}
                <button
                    onClick={handleImport}
                    disabled={!importJson.trim()}
                    className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                        importJson.trim()
                            ? "bg-[--color-brand-600] text-white hover:bg-[--color-brand-500]"
                            : "bg-[--color-gray-800] text-[--muted] cursor-not-allowed opacity-50",
                    )}
                >
                    <LuDownload className="w-4 h-4" />
                    Import & Add to My Presets
                </button>
            </div>
        </div>
    )
}
