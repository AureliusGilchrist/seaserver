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

// ─────────────────────────────────────────────────────────────────
// Attack on Titan Icons — ODM gear / blade / wall inspired
// ─────────────────────────────────────────────────────────────────

const AoTPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Blade-shaped play triangle — ultrahard steel edge */}
        <path d="M6 2 L22 12 L6 22 L9 12 Z" />
        <line x1="6" y1="2" x2="9" y2="12" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
    </svg>
)

const AoTPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Dual ultrahard steel blades */}
        <path d="M5 2 L9 2 L8.5 22 L5.5 22 Z" />
        <path d="M15 2 L19 2 L18.5 22 L15.5 22 Z" />
        <line x1="7" y1="2" x2="7" y2="5" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="17" y1="2" x2="17" y2="5" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
)

const AoTVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Steam-like jagged sound waves (titan steam) */}
        <path d="M16 7 L17.5 9.5 L16 12 L17.5 14.5 L16 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 5 L21 8 L19 12 L21 16 L19 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const AoTVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 7 L17.5 9.5 L16 12 L17.5 14.5 L16 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const AoTVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const AoTVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Crossed blades for mute */}
        <line x1="16" y1="8" x2="23" y2="16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="23" y1="8" x2="16" y2="16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
)

const AoTFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" className={cn("size-[1em]", className)}>
        {/* Wall gate expanding — heavy fortification feel */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        <line x1="3" y1="3" x2="5" y2="5" strokeWidth="1" opacity="0.3" />
        <line x1="21" y1="3" x2="19" y2="5" strokeWidth="1" opacity="0.3" />
    </svg>
)

const AoTFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const AoTSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Dual blade advance */}
        <path d="M3 3 L15 12 L3 21 Z" />
        <path d="M14 6 L22 12 L14 18 Z" opacity="0.65" />
    </svg>
)

const AoTSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Dual blade retreat */}
        <path d="M21 3 L9 12 L21 21 Z" />
        <path d="M10 6 L2 12 L10 18 Z" opacity="0.65" />
    </svg>
)

export const attackOnTitanPlayerIcons: PlayerIconOverrides = {
    play: AoTPlay,
    pause: AoTPause,
    volumeHigh: AoTVolumeHigh,
    volumeMid: AoTVolumeMid,
    volumeLow: AoTVolumeLow,
    volumeMuted: AoTVolumeMuted,
    fullscreenEnter: AoTFullscreenEnter,
    fullscreenExit: AoTFullscreenExit,
    skipForward: AoTSkipForward,
    skipBack: AoTSkipBack,
}

// ─────────────────────────────────────────────────────────────────
// My Hero Academia Icons — hero cape / shield / quirk inspired
// ─────────────────────────────────────────────────────────────────

const MHAPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Hero cape-shaped play — flowing triangular silhouette */}
        <path d="M6 2 L21 12 L6 22 L8 14 L7 12 L8 10 Z" />
        <circle cx="8" cy="12" r="1.2" fill="currentColor" opacity="0.4" />
    </svg>
)

const MHAPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Shield-shaped pause bars */}
        <path d="M5 3 L9 3 L9 19 L7 21 L5 19 Z" />
        <path d="M15 3 L19 3 L19 19 L17 21 L15 19 Z" />
    </svg>
)

const MHAVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Quirk energy waves — jagged hero-style */}
        <path d="M16 7 L17.5 9.5 L16 12 L17.5 14.5 L16 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 5 L21 8 L19 12 L21 16 L19 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const MHAVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 7 L17.5 9.5 L16 12 L17.5 14.5 L16 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const MHAVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const MHAVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* X-mark — villain crossed out */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
)

const MHAFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Shield-corner fullscreen — hero emblem expansion */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Small diamond accent at center */}
        <path d="M12 10 L14 12 L12 14 L10 12 Z" fill="currentColor" opacity="0.3" />
    </svg>
)

const MHAFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const MHASkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double fist-forward — Plus Ultra advance */}
        <path d="M3 3 L14 12 L3 21 Z" />
        <path d="M13 6 L22 12 L13 18 Z" opacity="0.65" />
    </svg>
)

const MHASkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double retreat */}
        <path d="M21 3 L10 12 L21 21 Z" />
        <path d="M11 6 L2 12 L11 18 Z" opacity="0.65" />
    </svg>
)

const MHAPip: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Shield-shaped PiP */}
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <path d="M14 17 L20 17 L20 21 L17 23 L14 21 Z" fill="currentColor" opacity="0.5" />
    </svg>
)

const MHAPipOff: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <line x1="2" y1="3" x2="22" y2="17" strokeWidth="1.5" opacity="0.6" />
    </svg>
)

export const myHeroAcademiaPlayerIcons: PlayerIconOverrides = {
    play: MHAPlay,
    pause: MHAPause,
    volumeHigh: MHAVolumeHigh,
    volumeMid: MHAVolumeMid,
    volumeLow: MHAVolumeLow,
    volumeMuted: MHAVolumeMuted,
    fullscreenEnter: MHAFullscreenEnter,
    fullscreenExit: MHAFullscreenExit,
    skipForward: MHASkipForward,
    skipBack: MHASkipBack,
    pip: MHAPip,
    pipOff: MHAPipOff,
}

// ─────────────────────────────────────────────────────────────────
// Demon Slayer Icons — katana / flame-breath / nichirin inspired
// ─────────────────────────────────────────────────────────────────

const DSPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Katana-tip play triangle */}
        <path d="M6 2 L22 12 L6 22 Z" />
        <line x1="6" y1="2" x2="6" y2="22" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
        <line x1="6" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </svg>
)

const DSPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Twin nichirin blade pause bars */}
        <rect x="5" y="2" width="3.5" height="20" rx="0.3" />
        <rect x="15.5" y="2" width="3.5" height="20" rx="0.3" />
        {/* Flame accent notch */}
        <path d="M7 2 Q8 0.5 8.5 2" fill="currentColor" opacity="0.35" />
        <path d="M17.5 2 Q18.5 0.5 19 2" fill="currentColor" opacity="0.35" />
    </svg>
)

const DSVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Flame-breath sound waves */}
        <path d="M16 8 C17.5 9.5 17.5 14.5 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M19 5.5 C21.5 8.5 21.5 15.5 19 18.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        {/* Small flame tip on outer wave */}
        <path d="M19.5 5 Q20.5 3.5 20 5.5" fill="currentColor" opacity="0.4" />
    </svg>
)

const DSVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 8 C17.5 9.5 17.5 14.5 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
)

const DSVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const DSVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Crossed katana mute */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

const DSFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Expanding demon gate */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Small flame wisps at corners */}
        <path d="M3 3 Q5 1 4.5 4" strokeWidth="1" opacity="0.35" />
        <path d="M21 3 Q19 1 19.5 4" strokeWidth="1" opacity="0.35" />
    </svg>
)

const DSFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const DSSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double katana-slash forward */}
        <path d="M3 3 L14 12 L3 21 Z" />
        <path d="M13 6 L22 12 L13 18 Z" opacity="0.6" />
    </svg>
)

const DSSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double katana-slash back */}
        <path d="M21 3 L10 12 L21 21 Z" />
        <path d="M11 6 L2 12 L11 18 Z" opacity="0.6" />
    </svg>
)

const DSPip: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Katana-guard shaped PiP */}
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <rect x="14" y="12" width="7" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
        {/* Flame wisp on inner window */}
        <path d="M17.5 11.5 Q18 10.5 18.5 11.5" fill="currentColor" opacity="0.3" />
    </svg>
)

const DSPipOff: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <line x1="2" y1="3" x2="22" y2="17" strokeWidth="1.5" opacity="0.6" />
    </svg>
)

export const demonSlayerPlayerIcons: PlayerIconOverrides = {
    play: DSPlay,
    pause: DSPause,
    volumeHigh: DSVolumeHigh,
    volumeMid: DSVolumeMid,
    volumeLow: DSVolumeLow,
    volumeMuted: DSVolumeMuted,
    fullscreenEnter: DSFullscreenEnter,
    fullscreenExit: DSFullscreenExit,
    skipForward: DSSkipForward,
    skipBack: DSSkipBack,
    pip: DSPip,
    pipOff: DSPipOff,
}

// ─────────────────────────────────────────────────────────────────
// Jujutsu Kaisen Icons — dark cursed energy / domain / sukuna inspired
// ─────────────────────────────────────────────────────────────────

const JJKPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Cursed energy burst play — jagged edge */}
        <path d="M6 2 L22 12 L6 22 L9 12 Z" />
        {/* Sukuna mark accent */}
        <line x1="8" y1="8" x2="8" y2="16" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </svg>
)

const JJKPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Dual cursed energy pillars — angular tops */}
        <path d="M5 2 L9 2 L9 22 L5 22 Z" />
        <path d="M15 2 L19 2 L19 22 L15 22 Z" />
        {/* Sukuna eye marks */}
        <line x1="7" y1="1" x2="7" y2="3" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <line x1="17" y1="1" x2="17" y2="3" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
)

const JJKVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Cursed energy wave pulses — jagged */}
        <path d="M16 7 L17.5 9.5 L16 12 L17.5 14.5 L16 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 5 L21 8 L19 11 L21 14 L19 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const JJKVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 7 L17.5 9.5 L16 12 L17.5 14.5 L16 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const JJKVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const JJKVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Cursed X seal */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
)

const JJKFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" className={cn("size-[1em]", className)}>
        {/* Domain Expansion barrier — sharp corners */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Inner cursed mark */}
        <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
)

const JJKFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const JJKSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double cursed slash forward */}
        <path d="M3 3 L14 12 L3 21 Z" />
        <path d="M13 3 L23 12 L13 21 Z" opacity="0.7" />
    </svg>
)

const JJKSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double cursed slash back */}
        <path d="M21 3 L10 12 L21 21 Z" />
        <path d="M11 3 L1 12 L11 21 Z" opacity="0.7" />
    </svg>
)

const JJKPip: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Domain barrier PiP frame */}
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <rect x="14" y="12" width="7" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
        {/* Cursed energy wisp inside */}
        <circle cx="17.5" cy="14" r="0.8" fill="currentColor" opacity="0.3" />
    </svg>
)

const JJKPipOff: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <line x1="2" y1="3" x2="22" y2="17" strokeWidth="1.5" opacity="0.6" />
    </svg>
)

export const jujutsuKaisenPlayerIcons: PlayerIconOverrides = {
    play: JJKPlay,
    pause: JJKPause,
    volumeHigh: JJKVolumeHigh,
    volumeMid: JJKVolumeMid,
    volumeLow: JJKVolumeLow,
    volumeMuted: JJKVolumeMuted,
    fullscreenEnter: JJKFullscreenEnter,
    fullscreenExit: JJKFullscreenExit,
    skipForward: JJKSkipForward,
    skipBack: JJKSkipBack,
    pip: JJKPip,
    pipOff: JJKPipOff,
}

// ─────────────────────────────────────────────────────────────────
// Fullmetal Alchemist Icons — alchemy circle / transmutation inspired
// ─────────────────────────────────────────────────────────────────

const FMAPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Transmutation-circle play — triangle inscribed in circle hint */}
        <path d="M7 3 L21 12 L7 21 Z" />
        <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
    </svg>
)

const FMAPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Twin pillars — Gate of Truth columns */}
        <rect x="5" y="3" width="4" height="18" rx="0.5" />
        <rect x="15" y="3" width="4" height="18" rx="0.5" />
        {/* Subtle circle binding */}
        <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.2" />
    </svg>
)

const FMAVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Alchemic energy arcs */}
        <path d="M16.5 7.5 C18 9 18 15 16.5 16.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M19 5 C21.5 8 21.5 16 19 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="20" cy="12" r="0.8" fill="currentColor" opacity="0.3" />
    </svg>
)

const FMAVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16.5 7.5 C18 9 18 15 16.5 16.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
)

const FMAVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const FMAVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Crossed-out transmutation */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

const FMAFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Gate of Truth opening */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Inner transmutation circle */}
        <circle cx="12" cy="12" r="3" strokeWidth="0.8" opacity="0.3" />
    </svg>
)

const FMAFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Gate of Truth closing */}
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const FMASkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double alchemic arrow forward */}
        <path d="M3 3 L14 12 L3 21 Z" />
        <path d="M13 3 L23 12 L13 21 Z" opacity="0.7" />
    </svg>
)

const FMASkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double alchemic arrow back */}
        <path d="M21 3 L10 12 L21 21 Z" />
        <path d="M11 3 L1 12 L11 21 Z" opacity="0.7" />
    </svg>
)

const FMAPip: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Transmutation array PiP */}
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <rect x="14" y="12" width="7" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
        {/* Tiny alchemy circle */}
        <circle cx="17.5" cy="14.5" r="1" strokeWidth="0.6" opacity="0.3" />
    </svg>
)

const FMAPipOff: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <line x1="2" y1="3" x2="22" y2="17" strokeWidth="1.5" opacity="0.6" />
    </svg>
)

export const fullmetalAlchemistPlayerIcons: PlayerIconOverrides = {
    play: FMAPlay,
    pause: FMAPause,
    volumeHigh: FMAVolumeHigh,
    volumeMid: FMAVolumeMid,
    volumeLow: FMAVolumeLow,
    volumeMuted: FMAVolumeMuted,
    fullscreenEnter: FMAFullscreenEnter,
    fullscreenExit: FMAFullscreenExit,
    skipForward: FMASkipForward,
    skipBack: FMASkipBack,
    pip: FMAPip,
    pipOff: FMAPipOff,
}

// ─────────────────────────────────────────────────────────────────
// Hunter × Hunter Icons — Nen aura / Hunter License inspired
// ─────────────────────────────────────────────────────────────────

const HxHPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Nen-aura play — triangle with aura wisps */}
        <path d="M7 3 L21 12 L7 21 Z" />
        <path d="M6 5 Q4 12 6 19" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
        <circle cx="7" cy="12" r="1.2" fill="currentColor" opacity="0.4" />
    </svg>
)

const HxHPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Twin Nen pillars pause */}
        <rect x="5" y="3" width="4" height="18" rx="1" />
        <rect x="15" y="3" width="4" height="18" rx="1" />
        {/* Nen glow dots */}
        <circle cx="7" cy="12" r="0.8" fill="currentColor" opacity="0.3" />
        <circle cx="17" cy="12" r="0.8" fill="currentColor" opacity="0.3" />
    </svg>
)

const HxHVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Nen aura ripple sound waves */}
        <path d="M16.5 7.5 C18 9.5 18 14.5 16.5 16.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M19 5 C21.5 8.5 21.5 15.5 19 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="20" cy="12" r="0.6" fill="currentColor" opacity="0.25" />
    </svg>
)

const HxHVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16.5 7.5 C18 9.5 18 14.5 16.5 16.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
)

const HxHVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M15 10 C15.8 11 15.8 13 15 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
)

const HxHVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Nen suppression X */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

const HxHFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Hunter License card corners expanding */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Nen glow accent lines */}
        <line x1="3" y1="3" x2="7" y2="7" strokeWidth="1" opacity="0.3" />
        <line x1="21" y1="21" x2="17" y2="17" strokeWidth="1" opacity="0.3" />
    </svg>
)

const HxHFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const HxHSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Godspeed forward arrows */}
        <path d="M4 4 L14 12 L4 20 Z" />
        <path d="M13 4 L23 12 L13 20 Z" opacity="0.7" />
        <circle cx="22" cy="12" r="0.8" fill="currentColor" opacity="0.3" />
    </svg>
)

const HxHSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M20 4 L10 12 L20 20 Z" />
        <path d="M11 4 L1 12 L11 20 Z" opacity="0.7" />
        <circle cx="2" cy="12" r="0.8" fill="currentColor" opacity="0.3" />
    </svg>
)

const HxHPip: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Hunter License card PiP */}
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <rect x="14" y="12" width="7" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
        {/* Nen glow inside */}
        <circle cx="17.5" cy="14" r="0.7" fill="currentColor" opacity="0.25" />
    </svg>
)

const HxHPipOff: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <line x1="2" y1="3" x2="22" y2="17" strokeWidth="1.5" opacity="0.6" />
    </svg>
)

export const hunterXHunterPlayerIcons: PlayerIconOverrides = {
    play: HxHPlay,
    pause: HxHPause,
    volumeHigh: HxHVolumeHigh,
    volumeMid: HxHVolumeMid,
    volumeLow: HxHVolumeLow,
    volumeMuted: HxHVolumeMuted,
    fullscreenEnter: HxHFullscreenEnter,
    fullscreenExit: HxHFullscreenExit,
    skipForward: HxHSkipForward,
    skipBack: HxHSkipBack,
    pip: HxHPip,
    pipOff: HxHPipOff,
}

// ─────────────────────────────────────────────────────────────────
// Black Clover Icons — grimoire / anti-magic SVG icons
// ─────────────────────────────────────────────────────────────────

const BCPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Grimoire-page play triangle with five-leaf clover notch */}
        <path d="M6 2 L22 12 L6 22 Z" />
        <circle cx="10" cy="12" r="1.8" fill="currentColor" opacity="0.3" />
        <circle cx="10" cy="12" r="0.6" fill="currentColor" opacity="0.6" />
    </svg>
)

const BCPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Twin grimoire spine pause bars */}
        <rect x="5" y="2" width="4.5" height="20" rx="1" />
        <rect x="14.5" y="2" width="4.5" height="20" rx="1" />
        {/* Anti-magic slash marks */}
        <line x1="6" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
        <line x1="15.5" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
    </svg>
)

const BCVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Anti-magic energy waves — jagged */}
        <path d="M16 7.5 L17.5 9 L16 10.5 L17.5 12 L16 13.5 L17.5 15 L16 16.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M19 5 L21 7.5 L19 10 L21 12.5 L19 15 L21 17.5 L19 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
)

const BCVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 7.5 L17.5 9 L16 10.5 L17.5 12 L16 13.5 L17.5 15 L16 16.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
)

const BCVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const BCVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Anti-magic cancel X */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
)

const BCFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Grimoire opening — expanding corners */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Five-leaf clover center hint */}
        <circle cx="12" cy="12" r="1.5" strokeWidth="1" opacity="0.3" />
    </svg>
)

const BCFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Grimoire closing */}
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const BCSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Dual anti-magic sword slashes forward */}
        <path d="M4 4 L14 12 L4 20 Z" />
        <path d="M13 4 L23 12 L13 20 Z" opacity="0.7" />
    </svg>
)

const BCSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Dual anti-magic sword slashes backward */}
        <path d="M20 4 L10 12 L20 20 Z" />
        <path d="M11 4 L1 12 L11 20 Z" opacity="0.7" />
    </svg>
)

const BCPip: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <rect x="14" y="12" width="7" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
        {/* Grimoire glow inside */}
        <circle cx="17.5" cy="14" r="0.7" fill="currentColor" opacity="0.25" />
    </svg>
)

const BCPipOff: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <line x1="2" y1="3" x2="22" y2="17" strokeWidth="1.5" opacity="0.6" />
    </svg>
)

export const blackCloverPlayerIcons: PlayerIconOverrides = {
    play: BCPlay,
    pause: BCPause,
    volumeHigh: BCVolumeHigh,
    volumeMid: BCVolumeMid,
    volumeLow: BCVolumeLow,
    volumeMuted: BCVolumeMuted,
    fullscreenEnter: BCFullscreenEnter,
    fullscreenExit: BCFullscreenExit,
    skipForward: BCSkipForward,
    skipBack: BCSkipBack,
    pip: BCPip,
    pipOff: BCPipOff,
}

// ─────────────────────────────────────────────────────────────────
// Fairy Tail Icons — guild mark / fire dragon SVG icons
// ─────────────────────────────────────────────────────────────────

const FTPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Flame-shaped play: fire dragon roar */}
        <path d="M7 3 C7 3 8 7 7.5 9 C9 6 10 4 12 3 C11 6 10.5 8 11 10 C13 7 15 5 17 3 C15 8 14 10 14 12 L21 12 L7 21 Z" />
    </svg>
)

const FTPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Twin flame pillars */}
        <path d="M5 22 L5 6 C5 4 6 2 7 2 C8 2 9 4 9 6 L9 22 Z" />
        <path d="M15 22 L15 6 C15 4 16 2 17 2 C18 2 19 4 19 6 L19 22 Z" />
        {/* Flame tips */}
        <ellipse cx="7" cy="2.5" rx="1.5" ry="1" opacity="0.4" />
        <ellipse cx="17" cy="2.5" rx="1.5" ry="1" opacity="0.4" />
    </svg>
)

const FTVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Fire dragon sound waves */}
        <path d="M16 7 C17.5 8 18 10 17 12 C18 11 19 13 17.5 15 C18.5 14 19 16.5 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M19 5 C21.5 7 22 10 20.5 12 C22 11 22.5 14 20.5 16 C22 15.5 22 18 19 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
)

const FTVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 7 C17.5 8 18 10 17 12 C18 11 19 13 17.5 15 C18.5 14 19 16.5 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
)

const FTVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const FTVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Crossed-out guild mark style X */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

const FTFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Expanding guild hall gates */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Fairy Tail guild mark hint — small wing strokes */}
        <path d="M10 10 L12 8 L14 10" strokeWidth="1.2" opacity="0.5" />
        <path d="M10 14 L12 16 L14 14" strokeWidth="1.2" opacity="0.5" />
    </svg>
)

const FTFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const FTSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double flame arrow forward */}
        <path d="M4 4 L14 12 L4 20 Z" />
        <path d="M13 4 L23 12 L13 20 Z" opacity="0.7" />
    </svg>
)

const FTSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M20 4 L10 12 L20 20 Z" />
        <path d="M11 4 L1 12 L11 20 Z" opacity="0.7" />
    </svg>
)

const FTPip: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <rect x="12" y="10" width="8" height="6" rx="1" fill="currentColor" opacity="0.6" />
    </svg>
)

const FTPipOff: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2" />
    </svg>
)

export const fairyTailPlayerIcons: PlayerIconOverrides = {
    play: FTPlay,
    pause: FTPause,
    volumeHigh: FTVolumeHigh,
    volumeMid: FTVolumeMid,
    volumeLow: FTVolumeLow,
    volumeMuted: FTVolumeMuted,
    fullscreenEnter: FTFullscreenEnter,
    fullscreenExit: FTFullscreenExit,
    skipForward: FTSkipForward,
    skipBack: FTSkipBack,
    pip: FTPip,
    pipOff: FTPipOff,
}

// ─────────────────────────────────────────────────────────────────
// Sword Art Online Icons — digital VR game interface / HUD inspired
// ─────────────────────────────────────────────────────────────────

const SAOPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Digital diamond-tipped play arrow — sword skill activation */}
        <path d="M6 2 L21 12 L6 22 L8 12 Z" />
        {/* HUD scan line accent */}
        <line x1="6" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
    </svg>
)

const SAOPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Twin crystal pause bars — menu crystal UI */}
        <rect x="4" y="2" width="5" height="20" rx="0.5" />
        <rect x="15" y="2" width="5" height="20" rx="0.5" />
        {/* Center HUD dot */}
        <circle cx="12" cy="12" r="1" opacity="0.3" />
    </svg>
)

const SAOVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Digital hexagonal sound waves */}
        <path d="M16 8 L17.5 10 L17.5 14 L16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M19 5.5 L21.5 8.5 L21.5 15.5 L19 18.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
)

const SAOVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 8 L17.5 10 L17.5 14 L16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
)

const SAOVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <circle cx="17" cy="12" r="1.5" fill="currentColor" opacity="0.4" />
    </svg>
)

const SAOVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* X with digital pixel ends */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
)

const SAOFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* VR viewport expand — clean digital corners */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Center HUD crosshair */}
        <circle cx="12" cy="12" r="2" strokeWidth="1" opacity="0.3" />
    </svg>
)

const SAOFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const SAOSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Double arrow — teleport crystal forward */}
        <path d="M3 4 L13 12 L3 20 Z" />
        <path d="M12 4 L22 12 L12 20 Z" opacity="0.65" />
    </svg>
)

const SAOSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M21 4 L11 12 L21 20 Z" />
        <path d="M12 4 L2 12 L12 20 Z" opacity="0.65" />
    </svg>
)

const SAOPip: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("size-[1em]", className)}>
        {/* Main HUD display */}
        <rect x="2" y="3" width="20" height="14" rx="1" />
        {/* Sub-window — party member status */}
        <rect x="12" y="10" width="8" height="6" rx="0.5" fill="currentColor" opacity="0.55" />
    </svg>
)

const SAOPipOff: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2" />
    </svg>
)

export const swordArtOnlinePlayerIcons: PlayerIconOverrides = {
    play: SAOPlay,
    pause: SAOPause,
    volumeHigh: SAOVolumeHigh,
    volumeMid: SAOVolumeMid,
    volumeLow: SAOVolumeLow,
    volumeMuted: SAOVolumeMuted,
    fullscreenEnter: SAOFullscreenEnter,
    fullscreenExit: SAOFullscreenExit,
    skipForward: SAOSkipForward,
    skipBack: SAOSkipBack,
    pip: SAOPip,
    pipOff: SAOPipOff,
}

// ─────────────────────────────────────────────────────────────────
// Death Note Icons — gothic notebook / shinigami inspired
// ─────────────────────────────────────────────────────────────────

const DNPlay: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Quill-pen play triangle — the act of writing a name */}
        <path d="M6 2 L21 12 L6 22 Z" />
        <line x1="6" y1="2" x2="6" y2="22" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
        <path d="M6 12 L3 14 L4 10 Z" fill="currentColor" opacity="0.5" />
    </svg>
)

const DNPause: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Twin notebook bookmark ribbons */}
        <path d="M5 2 L9 2 L9 20 L7 18 L5 20 Z" />
        <path d="M15 2 L19 2 L19 20 L17 18 L15 20 Z" />
    </svg>
)

const DNVolumeHigh: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Shinigami whisper waves — jagged, supernatural */}
        <path d="M16 7 L17.5 9.5 L16 12 L17.5 14.5 L16 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 5 L21 8 L19 12 L21 16 L19 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const DNVolumeMid: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        <path d="M16 7 L17.5 9.5 L16 12 L17.5 14.5 L16 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

const DNVolumeLow: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
    </svg>
)

const DNVolumeMuted: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
        {/* Crossed-out — death mark X */}
        <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
)

const DNFullscreenEnter: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        {/* Notebook opening wide — gothic frame */}
        <polyline points="3,8 3,3 8,3" />
        <polyline points="21,8 21,3 16,3" />
        <polyline points="3,16 3,21 8,21" />
        <polyline points="21,16 21,21 16,21" />
        {/* Small cross / death mark in center */}
        <line x1="11" y1="10" x2="13" y2="14" strokeWidth="1.2" opacity="0.5" />
        <line x1="13" y1="10" x2="11" y2="14" strokeWidth="1.2" opacity="0.5" />
    </svg>
)

const DNFullscreenExit: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-[1em]", className)}>
        <polyline points="8,3 8,8 3,8" />
        <polyline points="16,3 16,8 21,8" />
        <polyline points="8,21 8,16 3,16" />
        <polyline points="16,21 16,16 21,16" />
    </svg>
)

const DNSkipForward: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        {/* Page-turning forward arrows */}
        <path d="M4 4 L14 12 L4 20 Z" />
        <path d="M13 4 L23 12 L13 20 Z" opacity="0.65" />
    </svg>
)

const DNSkipBack: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-[1em]", className)}>
        <path d="M20 4 L10 12 L20 20 Z" />
        <path d="M11 4 L1 12 L11 20 Z" opacity="0.65" />
    </svg>
)

const DNPip: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("size-[1em]", className)}>
        {/* Notebook / PiP frame with gothic corner accents */}
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <rect x="12" y="10" width="9" height="6" rx="0.5" fill="currentColor" opacity="0.35" />
        <circle cx="4" cy="5" r="0.7" fill="currentColor" opacity="0.4" />
    </svg>
)

const DNPipOff: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("size-[1em]", className)}>
        <rect x="2" y="3" width="20" height="14" rx="1" />
        <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2" />
    </svg>
)

export const deathNotePlayerIcons: PlayerIconOverrides = {
    play: DNPlay,
    pause: DNPause,
    volumeHigh: DNVolumeHigh,
    volumeMid: DNVolumeMid,
    volumeLow: DNVolumeLow,
    volumeMuted: DNVolumeMuted,
    fullscreenEnter: DNFullscreenEnter,
    fullscreenExit: DNFullscreenExit,
    skipForward: DNSkipForward,
    skipBack: DNSkipBack,
    pip: DNPip,
    pipOff: DNPipOff,
}
