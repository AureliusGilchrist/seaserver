// ─────────────────────────────────────────────────────────────────────────────
// Profile Style rewards: avatar frames, banner overlays and header layouts.
// Published to the server by id (profile.avatarFrameId / bannerOverlayId / profileLayoutId) so
// everyone viewing the profile sees them. The look of each lives in globals.css (.sea-frame-*,
// .sea-layout-*); overlays are inline CSS backgrounds.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileStyleReward {
    id: string
    name: string
    description: string
    requiredLevel: number
}

export interface AvatarFrameReward extends ProfileStyleReward {
    /** Class from globals.css applied to the avatar wrapper; "" = none. */
    className: string
}

export interface BannerOverlayReward extends ProfileStyleReward {
    /** CSS background layered over the profile banner; "" = none. */
    overlayCss: string
    /** Optional mix-blend-mode for the overlay. */
    blend?: string
}

export interface ProfileLayoutReward extends ProfileStyleReward {
    /** Class from globals.css applied to the profile header row. */
    className: string
}

export const AVATAR_FRAMES: AvatarFrameReward[] = [
    { id: "frame-none",     name: "None",         description: "No frame.",                               requiredLevel: 1,   className: "" },
    { id: "frame-pulse",    name: "Pulse",        description: "A soft accent ring that breathes.",       requiredLevel: 3,   className: "sea-frame sea-frame-pulse" },
    { id: "frame-spin",     name: "Orbit",        description: "A dashed ring slowly orbits the avatar.", requiredLevel: 6,   className: "sea-frame sea-frame-spin" },
    { id: "frame-rainbow",  name: "Prismatic",    description: "A rotating rainbow ring.",                requiredLevel: 12,  className: "sea-frame sea-frame-rainbow" },
    { id: "frame-gold",     name: "Gilded",       description: "A polished gold ring with a glint.",      requiredLevel: 20,  className: "sea-frame sea-frame-gold" },
    { id: "frame-sakura",   name: "Sakura",       description: "A pink ring with petal glow.",            requiredLevel: 15,  className: "sea-frame sea-frame-sakura" },
    { id: "frame-neon",     name: "Neon",         description: "Flickering cyan neon tubing.",            requiredLevel: 25,  className: "sea-frame sea-frame-neon" },
    { id: "frame-flame",    name: "Inferno",      description: "Heat-shimmer flame ring.",                requiredLevel: 35,  className: "sea-frame sea-frame-flame" },
    { id: "frame-void",     name: "Event Horizon", description: "A dark ring that swallows light.",       requiredLevel: 50,  className: "sea-frame sea-frame-void" },
    { id: "frame-aurora",   name: "Aurora",       description: "Green-violet aurora shimmer.",            requiredLevel: 40,  className: "sea-frame sea-frame-aurora" },
]

export const BANNER_OVERLAYS: BannerOverlayReward[] = [
    { id: "overlay-none",      name: "None",        description: "The banner as it is.",               requiredLevel: 1,  overlayCss: "" },
    { id: "overlay-dusk",      name: "Dusk",        description: "A warm sunset wash.",                requiredLevel: 2,  overlayCss: "linear-gradient(180deg, rgba(251,146,60,0.25), rgba(124,58,237,0.25))", blend: "soft-light" },
    { id: "overlay-midnight",  name: "Midnight",    description: "Deep blue night tint.",              requiredLevel: 4,  overlayCss: "linear-gradient(180deg, rgba(30,58,138,0.45), rgba(2,6,23,0.4))", blend: "multiply" },
    { id: "overlay-sakura",    name: "Sakura",      description: "Pink spring haze.",                  requiredLevel: 8,  overlayCss: "radial-gradient(circle at 70% 30%, rgba(244,114,182,0.35), transparent 60%)", blend: "screen" },
    { id: "overlay-scanlines", name: "Scanlines",   description: "CRT scanlines across the banner.",   requiredLevel: 10, overlayCss: "repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 2px, transparent 2px 4px)" },
    { id: "overlay-noir",      name: "Noir",        description: "Desaturated film-noir tone.",        requiredLevel: 12, overlayCss: "linear-gradient(rgba(20,20,20,0.35), rgba(20,20,20,0.35))", blend: "saturation" },
    { id: "overlay-aurora",    name: "Aurora",      description: "Shifting aurora light.",             requiredLevel: 18, overlayCss: "linear-gradient(120deg, rgba(52,211,153,0.25), rgba(139,92,246,0.25), rgba(56,189,248,0.25))", blend: "screen" },
    { id: "overlay-vignette",  name: "Vignette",    description: "Darkened edges, bright center.",     requiredLevel: 6,  overlayCss: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)" },
    { id: "overlay-gold",      name: "Golden Hour", description: "A gilded glow from the top.",        requiredLevel: 25, overlayCss: "linear-gradient(180deg, rgba(251,191,36,0.3), transparent 70%)", blend: "overlay" },
]

export const PROFILE_LAYOUTS: ProfileLayoutReward[] = [
    { id: "layout-standard",  name: "Standard",  description: "Avatar left, details right.",                 requiredLevel: 1,  className: "" },
    { id: "layout-centered",  name: "Centered",  description: "Everything centered under the avatar.",       requiredLevel: 5,  className: "sea-layout-centered" },
    { id: "layout-reversed",  name: "Reversed",  description: "Avatar on the right.",                        requiredLevel: 8,  className: "sea-layout-reversed" },
    { id: "layout-showcase",  name: "Showcase",  description: "A large avatar on a raised card.",            requiredLevel: 15, className: "sea-layout-showcase" },
    { id: "layout-compact",   name: "Compact",   description: "A slim one-line header.",                     requiredLevel: 3,  className: "sea-layout-compact" },
]

export const lookupAvatarFrame = (id?: string | null) => AVATAR_FRAMES.find(f => f.id === id) ?? null
export const lookupBannerOverlay = (id?: string | null) => BANNER_OVERLAYS.find(f => f.id === id) ?? null
export const lookupProfileLayout = (id?: string | null) => PROFILE_LAYOUTS.find(f => f.id === id) ?? null
