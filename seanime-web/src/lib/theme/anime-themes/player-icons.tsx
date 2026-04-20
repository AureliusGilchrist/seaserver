import React from "react"
import { cn } from "@/components/ui/core/styling"
import type { PlayerIconOverrides } from "./types"

// ─────────────────────────────────────────────────────────────────
// Naruto Icons — kunai / shuriken / scroll inspired
// ─────────────────────────────────────────────────────────────────

const NarutoPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Kunai-shaped play triangle */}
        <path d="M7 3 L21 12 L7 21 Z" />
        <line x1="7" y1="3" x2="7" y2="21" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <circle cx="7" cy="12" r="1.5" fill="currentColor" opacity="0.5" />
    </svg>
)

const NarutoPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Twin kunai pause bars */}
        <rect x="5" y="3" width="4" height="18" rx="0.5" />
        <rect x="15" y="3" width="4" height="18" rx="0.5" />
        <circle cx="7" cy="3" r="1" opacity="0.4" />
        <circle cx="17" cy="3" r="1" opacity="0.4" />
    </svg>
)

const NarutoVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Chakra spiral sound waves */}
        <path d="M16.5 7.5 C18 9 18 15 16.5 16.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M19 5 C21.5 8 21.5 16 19 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
)

const NarutoVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16.5 7.5 C18 9 18 15 16.5 16.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
)

const NarutoVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const NarutoVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

const NarutoFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Expanding gate / torii */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        <line x1="3" y1="3" x2="8" y2="8" strokeWidth="1.2" opacity="0.4" />
        <line x1="21" y1="3" x2="16" y2="8" strokeWidth="1.2" opacity="0.4" />
    </svg>
)

const NarutoFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const NarutoSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M4 4 L14 12 L4 20 Z" />
        <path d="M13 4 L23 12 L13 20 Z" opacity="0.7" />
    </svg>
)

const NarutoSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M20 4 L10 12 L20 20 Z" />
        <path d="M11 4 L1 12 L11 20 Z" opacity="0.7" />
    </svg>
)

export const narutoPlayerIcons: PlayerIconOverrides = {
    play: NarutoPlay,
    pause: NarutoPause,
    volumeHigh: NarutoVolumeHigh,
    volumeMid: NarutoVolumeMid,
    volumeLow: NarutoVolumeLow,
    volumeMuted: NarutoVolumeMuted,
    fullscreenEnter: NarutoFullscreenEnter,
    fullscreenExit: NarutoFullscreenExit,
    skipForward: NarutoSkipForward,
    skipBack: NarutoSkipBack,
}

// ─────────────────────────────────────────────────────────────────
// Bleach Icons — zanpakutō / hollow / reiatsu inspired
// ─────────────────────────────────────────────────────────────────

const BleachPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Angular zanpakutō-blade play */}
        <path d="M6 2 L22 12 L6 22 L8 12 Z" />
    </svg>
)

const BleachPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Dual blades */}
        <path d="M5 2 L9 2 L8 22 L5 22 Z" />
        <path d="M15 2 L19 2 L19 22 L16 22 Z" />
    </svg>
)

const BleachVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Reiatsu pressure waves — angular */}
        <path d="M16 7 L18 9 L16 12 L18 15 L16 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 5 L22 8 L19 12 L22 16 L19 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const BleachVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 7 L18 9 L16 12 L18 15 L16 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const BleachVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const BleachVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
)

const BleachFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" className={cn("size-[1em]", className)}>
        {/* Senkaimon gate — sharp angles */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
    </svg>
)

const BleachFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const BleachSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 3 L15 12 L3 21 Z" />
        <rect x="17" y="3" width="3" height="18" />
    </svg>
)

const BleachSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M21 3 L9 12 L21 21 Z" />
        <rect x="4" y="3" width="3" height="18" />
    </svg>
)

export const bleachPlayerIcons: PlayerIconOverrides = {
    play: BleachPlay,
    pause: BleachPause,
    volumeHigh: BleachVolumeHigh,
    volumeMid: BleachVolumeMid,
    volumeLow: BleachVolumeLow,
    volumeMuted: BleachVolumeMuted,
    fullscreenEnter: BleachFullscreenEnter,
    fullscreenExit: BleachFullscreenExit,
    skipForward: BleachSkipForward,
    skipBack: BleachSkipBack,
}

// ─────────────────────────────────────────────────────────────────
// One Piece Icons — anchor / straw hat / log pose inspired
// ─────────────────────────────────────────────────────────────────

const OnePiecePlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Bold sail-shaped play — straw hat crew flag feeling */}
        <path d="M6 3 L21 12 L6 21 Z" />
        {/* Crossbones accent */}
        <line x1="6" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" opacity="0.3" />
    </svg>
)

const OnePiecePause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Anchor-style pause bars with rounded tops */}
        <rect x="5" y="3" width="4.5" height="18" rx="2" />
        <rect x="14.5" y="3" width="4.5" height="18" rx="2" />
    </svg>
)

const OnePieceVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Den Den Mushi wave ripples — circular */}
        <circle cx="19" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <circle cx="19" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
)

const OnePieceVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <circle cx="18" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    </svg>
)

const OnePieceVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const OnePieceVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

const OnePieceFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Log Pose expanding */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        <circle cx="12" cy="12" r="2" strokeWidth="1.5" opacity="0.3" />
    </svg>
)

const OnePieceFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
        <circle cx="12" cy="12" r="2" strokeWidth="1.5" opacity="0.3" />
    </svg>
)

const OnePieceSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M4 4 L14 12 L4 20 Z" />
        <path d="M14 4 L24 12 L14 20 Z" opacity="0.6" />
    </svg>
)

const OnePieceSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M20 4 L10 12 L20 20 Z" />
        <path d="M10 4 L0 12 L10 20 Z" opacity="0.6" />
    </svg>
)

export const onePiecePlayerIcons: PlayerIconOverrides = {
    play: OnePiecePlay,
    pause: OnePiecePause,
    volumeHigh: OnePieceVolumeHigh,
    volumeMid: OnePieceVolumeMid,
    volumeLow: OnePieceVolumeLow,
    volumeMuted: OnePieceVolumeMuted,
    fullscreenEnter: OnePieceFullscreenEnter,
    fullscreenExit: OnePieceFullscreenExit,
    skipForward: OnePieceSkipForward,
    skipBack: OnePieceSkipBack,
}

// ─────────────────────────────────────────────────────────────────
// Dragon Ball Z Icons — Ki blast / energy / power-up inspired
// ─────────────────────────────────────────────────────────────────

const DBZPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Ki blast play triangle */}
        <path d="M6 2 L22 12 L6 22 Z" />
        {/* Energy core glow */}
        <circle cx="10" cy="12" r="2" fill="currentColor" opacity="0.4" />
    </svg>
)

const DBZPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Power stance pause bars */}
        <rect x="4" y="2" width="5" height="20" rx="1" />
        <rect x="15" y="2" width="5" height="20" rx="1" />
        {/* Energy aura accents */}
        <line x1="6.5" y1="2" x2="6.5" y2="0" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="17.5" y1="2" x2="17.5" y2="0" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
)

const DBZVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Ki energy waves */}
        <path d="M16 6 C19 8 19 16 16 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M19 4 C23 7 23 17 19 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

const DBZVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 6 C19 8 19 16 16 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

const DBZVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const DBZVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* X-shaped ki cancel */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
)

const DBZFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Power-up expanding aura */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Dragon Ball star */}
        <circle cx="12" cy="12" r="2.5" strokeWidth="1.2" opacity="0.4" />
        <circle cx="12" cy="12" r="1" fill="currentColor" opacity="0.3" />
    </svg>
)

const DBZFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const DBZSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Instant Transmission forward */}
        <path d="M4 4 L14 12 L4 20 Z" />
        <path d="M13 4 L23 12 L13 20 Z" opacity="0.65" />
    </svg>
)

const DBZSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M20 4 L10 12 L20 20 Z" />
        <path d="M11 4 L1 12 L11 20 Z" opacity="0.65" />
    </svg>
)

export const dragonBallZPlayerIcons: PlayerIconOverrides = {
    play: DBZPlay,
    pause: DBZPause,
    volumeHigh: DBZVolumeHigh,
    volumeMid: DBZVolumeMid,
    volumeLow: DBZVolumeLow,
    volumeMuted: DBZVolumeMuted,
    fullscreenEnter: DBZFullscreenEnter,
    fullscreenExit: DBZFullscreenExit,
    skipForward: DBZSkipForward,
    skipBack: DBZSkipBack,
}
