// ─────────────────────────────────────────────────────────────────────────────
// Shared base type
// ─────────────────────────────────────────────────────────────────────────────

export interface BaseReward {
    id: string
    name: string
    description: string
    requiredLevel: number
    icon?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// TITLES
// ─────────────────────────────────────────────────────────────────────────────

export interface TitleReward extends BaseReward {
    type: "title"
    /** Text shown in the profile header */
    text: string
    /** Tailwind/CSS color class or inline style color */
    color?: string
}

export const TITLE_REWARDS: TitleReward[] = [
    { id: "title-newbie",         type: "title", name: "Newbie",                text: "Newbie",                requiredLevel: 1,   color: "#94a3b8", description: "Just getting started." },
    { id: "title-anime-fan",      type: "title", name: "Anime Fan",             text: "Anime Fan",             requiredLevel: 2,   color: "#a3e635", description: "You enjoy anime." },
    { id: "title-watcher",        type: "title", name: "Watcher",               text: "Watcher",               requiredLevel: 3,   color: "#67e8f9", description: "Your eyes are always open." },
    { id: "title-binge-watcher",  type: "title", name: "Binge Watcher",         text: "Binge Watcher",         requiredLevel: 5,   color: "#fb7185", description: "One more episode." },
    { id: "title-otaku",          type: "title", name: "Otaku",                 text: "Otaku",                 requiredLevel: 7,   color: "#c084fc", description: "Deeply invested in anime culture." },
    { id: "title-weeb",           type: "title", name: "Weeb",                  text: "Weeb",                  requiredLevel: 8,   color: "#f472b6", description: "Self-aware and proud." },
    { id: "title-nakama",         type: "title", name: "Nakama",                text: "Nakama",                requiredLevel: 10,  color: "#facc15", description: "The bonds that cannot be broken." },
    { id: "title-dattebayo",      type: "title", name: "Believe It!",           text: "Believe It!",           requiredLevel: 12,  color: "#f97316", description: "Naruto's spirit lives in you." },
    { id: "title-senpai",         type: "title", name: "Senpai",                text: "Senpai",                requiredLevel: 14,  color: "#fda4af", description: "Worthy of being noticed." },
    { id: "title-nakama-plus",    type: "title", name: "True Nakama",           text: "True Nakama",           requiredLevel: 16,  color: "#fbbf24", description: "A deeper bond." },
    { id: "title-hunter",         type: "title", name: "Hunter",                text: "Hunter",                requiredLevel: 18,  color: "#4ade80", description: "Gon would be proud." },
    { id: "title-genin",          type: "title", name: "Genin",                 text: "Genin",                 requiredLevel: 20,  color: "#86efac", description: "A ninja just starting out." },
    { id: "title-alchemist",      type: "title", name: "Alchemist",             text: "Alchemist",             requiredLevel: 22,  color: "#fcd34d", description: "Equivalent exchange." },
    { id: "title-shinigami",      type: "title", name: "Shinigami",             text: "Shinigami",             requiredLevel: 24,  color: "#a78bfa", description: "Soul Reaper of the digital world." },
    { id: "title-chunin",         type: "title", name: "Chunin",                text: "Chunin",                requiredLevel: 26,  color: "#34d399", description: "Passed the exam." },
    { id: "title-demon-slayer",   type: "title", name: "Demon Slayer",          text: "Demon Slayer",          requiredLevel: 28,  color: "#f87171", description: "Blade of Demon Destruction." },
    { id: "title-mage",           type: "title", name: "Mage",                  text: "Mage",                  requiredLevel: 30,  color: "#38bdf8", description: "Magic fills the air." },
    { id: "title-jonin",          type: "title", name: "Jonin",                 text: "Jonin",                 requiredLevel: 32,  color: "#22d3ee", description: "Elite among ninja." },
    { id: "title-pro-hero",       type: "title", name: "Pro Hero",              text: "Pro Hero",              requiredLevel: 34,  color: "#60a5fa", description: "A licensed hero." },
    { id: "title-scout",          type: "title", name: "Scout",                 text: "Scout",                 requiredLevel: 36,  color: "#a3a3a3", description: "Beyond the walls." },
    { id: "title-pirate",         type: "title", name: "Pirate",                text: "Pirate",                requiredLevel: 38,  color: "#e78c45", description: "Set sail." },
    { id: "title-s-class-mage",   type: "title", name: "S-Class Mage",          text: "S-Class Mage",          requiredLevel: 40,  color: "#fda4af", description: "Top rank of Fairy Tail." },
    { id: "title-state-alchemist",type: "title", name: "State Alchemist",       text: "State Alchemist",       requiredLevel: 42,  color: "#d97706", description: "A dog of the military." },
    { id: "title-aura-master",    type: "title", name: "Nen Master",            text: "Nen Master",            requiredLevel: 44,  color: "#6ee7b7", description: "Mastered the life energy." },
    { id: "title-hashira",        type: "title", name: "Hashira",               text: "Hashira",               requiredLevel: 46,  color: "#e879f9", description: "Pillar of the Demon Slayer Corps." },
    { id: "title-captain",        type: "title", name: "Captain",               text: "Captain",               requiredLevel: 48,  color: "#fff",     description: "Leading the squad." },
    { id: "title-kage",           type: "title", name: "Kage",                  text: "Kage",                  requiredLevel: 50,  color: "#fbbf24", description: "Shadow and leader." },
    { id: "title-yonko",          type: "title", name: "Yonko",                 text: "Yonko",                 requiredLevel: 52,  color: "#f97316", description: "Emperor of the Sea." },
    { id: "title-grade1",         type: "title", name: "Grade 1 Sorcerer",      text: "Grade 1 Sorcerer",      requiredLevel: 54,  color: "#818cf8", description: "Jujutsu elite." },
    { id: "title-titan",          type: "title", name: "Titan Shifter",         text: "Titan Shifter",         requiredLevel: 56,  color: "#4ade80", description: "The power of the Titans." },
    { id: "title-no1-hero",       type: "title", name: "No. 1 Hero",            text: "No. 1 Hero",            requiredLevel: 58,  color: "#3b82f6", description: "The top hero." },
    { id: "title-supernova",      type: "title", name: "Supernova",             text: "Supernova",             requiredLevel: 60,  color: "#f59e0b", description: "A rising star in the pirate world." },
    { id: "title-royal-knight",   type: "title", name: "Royal Knight",          text: "Royal Knight",          requiredLevel: 65,  color: "#c4b5fd", description: "Chosen by the king." },
    { id: "title-special-grade",  type: "title", name: "Special Grade",         text: "Special Grade",         requiredLevel: 70,  color: "#7c3aed", description: "The highest rank of cursed spirit or sorcerer." },
    { id: "title-wizard-saint",   type: "title", name: "Wizard Saint",          text: "Wizard Saint",          requiredLevel: 75,  color: "#fde68a", description: "Among the ten strongest mages." },
    { id: "title-sage",           type: "title", name: "Sage",                  text: "Sage",                  requiredLevel: 80,  color: "#a3e635", description: "Sage Mode mastered." },
    { id: "title-soul-king",      type: "title", name: "Soul King",             text: "Soul King",             requiredLevel: 82,  color: "#fff1f2", description: "The heart of the Soul Society." },
    { id: "title-fleet-admiral",  type: "title", name: "Fleet Admiral",         text: "Fleet Admiral",         requiredLevel: 85,  color: "#dc2626", description: "Commander of the Navy." },
    { id: "title-magic-emperor",  type: "title", name: "Magic Emperor",         text: "Magic Emperor",         requiredLevel: 88,  color: "#fbbf24", description: "The Wizard King." },
    { id: "title-futility",       type: "title", name: "It Was All Futile",     text: "It Was All Futile",     requiredLevel: 90,  color: "#94a3b8", description: "Guts would understand." },
    { id: "title-plus-ultra",     type: "title", name: "PLUS ULTRA",            text: "PLUS ULTRA",            requiredLevel: 92,  color: "#3b82f6", description: "Beyond your limits." },
    { id: "title-king-pirates",   type: "title", name: "King of the Pirates",   text: "King of the Pirates",   requiredLevel: 95,  color: "#f59e0b", description: "Roger's successor." },
    { id: "title-hokage",         type: "title", name: "Hokage",                text: "Hokage",                requiredLevel: 97,  color: "#f97316", description: "Protector of the Leaf." },
    { id: "title-god-new-world",  type: "title", name: "God of the New World",  text: "God of the New World",  requiredLevel: 99,  color: "#e2e8f0", description: "Kira judges." },
    { id: "title-legend",         type: "title", name: "Legend",                text: "Legend",                requiredLevel: 100, color: "#facc15", description: "A true legend of anime." },
    { id: "title-anime-god",      type: "title", name: "Anime God",             text: "Anime God",             requiredLevel: 200, color: "#fcd34d", description: "Transcended all shows." },
    { id: "title-omniscient",     type: "title", name: "Omniscient",            text: "Omniscient",            requiredLevel: 300, color: "#a78bfa", description: "Seen it all." },
    { id: "title-primordial",     type: "title", name: "Primordial",            text: "Primordial",            requiredLevel: 500, color: "#c084fc", description: "Existed before anime was anime." },
    { id: "title-beyond",         type: "title", name: "Beyond All",            text: "Beyond All",            requiredLevel: 750, color: "#e879f9", description: "There are no words." },
    { id: "title-1000",           type: "title", name: "The Immortal",          text: "The Immortal",          requiredLevel: 1000,color: "#f9a8d4", description: "Level 1000. You are a god." },
]

// ─────────────────────────────────────────────────────────────────────────────
// NAME COLORS
// ─────────────────────────────────────────────────────────────────────────────

export interface NameColorReward extends BaseReward {
    type: "nameColor"
    /** CSS color string applied to the profile username */
    color: string
    gradientCss?: string
}

export const NAME_COLOR_REWARDS: NameColorReward[] = [
    { id: "nc-default",    type: "nameColor", name: "Default",        description: "Standard white.",               requiredLevel: 1,   color: "#ffffff", icon: "⬜" },
    { id: "nc-gold",       type: "nameColor", name: "Gold",           description: "Shining gold.",                 requiredLevel: 5,   color: "#facc15", icon: "🟡" },
    { id: "nc-crimson",    type: "nameColor", name: "Crimson",        description: "Blood red.",                    requiredLevel: 10,  color: "#dc2626", icon: "🔴" },
    { id: "nc-sapphire",   type: "nameColor", name: "Sapphire",       description: "Deep blue.",                    requiredLevel: 15,  color: "#2563eb", icon: "🔵" },
    { id: "nc-emerald",    type: "nameColor", name: "Emerald",        description: "Forest green.",                 requiredLevel: 20,  color: "#16a34a", icon: "🟢" },
    { id: "nc-violet",     type: "nameColor", name: "Violet",         description: "Royal purple.",                 requiredLevel: 25,  color: "#7c3aed", icon: "🟣" },
    { id: "nc-orange",     type: "nameColor", name: "Orange",         description: "Naruto orange.",                requiredLevel: 30,  color: "#ea580c", icon: "🟠" },
    { id: "nc-teal",       type: "nameColor", name: "Teal",           description: "Cool teal.",                    requiredLevel: 35,  color: "#0d9488", icon: "🩵" },
    { id: "nc-pink",       type: "nameColor", name: "Hot Pink",       description: "Striking pink.",                requiredLevel: 40,  color: "#ec4899", icon: "🩷" },
    { id: "nc-silver",     type: "nameColor", name: "Silver",         description: "Metallic silver.",              requiredLevel: 45,  color: "#94a3b8", icon: "⚪" },
    { id: "nc-amber",      type: "nameColor", name: "Amber",          description: "Warm amber.",                   requiredLevel: 50,  color: "#d97706", icon: "🟡" },
    { id: "nc-indigo",     type: "nameColor", name: "Indigo",         description: "Deep indigo.",                  requiredLevel: 55,  color: "#4338ca", icon: "🔷" },
    { id: "nc-sky",        type: "nameColor", name: "Sky Blue",       description: "Clear sky.",                    requiredLevel: 60,  color: "#0ea5e9", icon: "🩵" },
    { id: "nc-rose",       type: "nameColor", name: "Rose",           description: "Rose red.",                     requiredLevel: 65,  color: "#f43f5e", icon: "🌹" },
    { id: "nc-lime",       type: "nameColor", name: "Lime",           description: "Vibrant lime.",                 requiredLevel: 70,  color: "#84cc16", icon: "🟩" },
    { id: "nc-fuchsia",    type: "nameColor", name: "Fuchsia",        description: "Electric fuchsia.",             requiredLevel: 75,  color: "#d946ef", icon: "🩷" },
    { id: "nc-cyan",       type: "nameColor", name: "Cyan",           description: "Bright cyan.",                  requiredLevel: 80,  color: "#06b6d4", icon: "💠" },
    { id: "nc-gradient-fire",  type: "nameColor", name: "Fire Gradient",   description: "A fiery gradient.",       requiredLevel: 90,  color: "#f97316", gradientCss: "linear-gradient(90deg, #ef4444, #f97316, #facc15)", icon: "🔥" },
    { id: "nc-gradient-ocean", type: "nameColor", name: "Ocean Gradient",  description: "Deep ocean waves.",       requiredLevel: 95,  color: "#0ea5e9", gradientCss: "linear-gradient(90deg, #0ea5e9, #06b6d4, #6366f1)", icon: "🌊" },
    { id: "nc-gradient-rainbow", type: "nameColor", name: "Rainbow",       description: "All the colors.",         requiredLevel: 100, color: "#f43f5e", gradientCss: "linear-gradient(90deg, #f43f5e, #f97316, #facc15, #4ade80, #60a5fa, #a78bfa)", icon: "🌈" },
    { id: "nc-gradient-cosmic", type: "nameColor", name: "Cosmic",         description: "Like the cosmos.",        requiredLevel: 150, color: "#818cf8", gradientCss: "linear-gradient(90deg, #818cf8, #c084fc, #e879f9)", icon: "✨" },
    { id: "nc-gradient-divine", type: "nameColor", name: "Divine Light",    description: "Radiant and divine.",    requiredLevel: 200, color: "#fbbf24", gradientCss: "linear-gradient(90deg, #fcd34d, #fff, #fcd34d)", icon: "☀️" },
]

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE BORDERS
// ─────────────────────────────────────────────────────────────────────────────

export interface BorderReward extends BaseReward {
    type: "border"
    /** Full CSS border string, e.g. "2px solid #facc15" */
    borderCss: string
    /** Optional: full CSS box-shadow for glow */
    glowCss?: string
}

export const BORDER_REWARDS: BorderReward[] = [
    { id: "border-none",       type: "border", name: "None",         description: "No border.",                          requiredLevel: 1,   borderCss: "none", icon: "⬜" },
    { id: "border-white",      type: "border", name: "White",        description: "Clean white border.",                 requiredLevel: 3,   borderCss: "2px solid #e2e8f0", icon: "⬜" },
    { id: "border-gold",       type: "border", name: "Gold",         description: "Classic gold border.",                requiredLevel: 10,  borderCss: "2px solid #facc15", icon: "🟡" },
    { id: "border-crimson",    type: "border", name: "Crimson",      description: "A red warrior's border.",             requiredLevel: 15,  borderCss: "2px solid #dc2626", icon: "🔴" },
    { id: "border-sapphire",   type: "border", name: "Sapphire",     description: "Cool blue frame.",                    requiredLevel: 20,  borderCss: "2px solid #3b82f6", icon: "🔵" },
    { id: "border-emerald",    type: "border", name: "Emerald",      description: "Natural green border.",               requiredLevel: 25,  borderCss: "2px solid #22c55e", icon: "🟢" },
    { id: "border-violet",     type: "border", name: "Violet",       description: "Royal violet frame.",                 requiredLevel: 30,  borderCss: "2px solid #8b5cf6", icon: "🟣" },
    { id: "border-double",     type: "border", name: "Double",       description: "A double gold border.",               requiredLevel: 35,  borderCss: "3px double #facc15", icon: "🌟" },
    { id: "border-glow-gold",  type: "border", name: "Gold Glow",    description: "Gold with a soft glow.",              requiredLevel: 40,  borderCss: "2px solid #facc15", glowCss: "0 0 10px #facc15aa, 0 0 20px #facc1566", icon: "✨" },
    { id: "border-glow-blue",  type: "border", name: "Blue Glow",    description: "Electric blue glow.",                 requiredLevel: 45,  borderCss: "2px solid #60a5fa", glowCss: "0 0 10px #60a5faaa, 0 0 20px #60a5fa66", icon: "💠" },
    { id: "border-glow-pink",  type: "border", name: "Pink Glow",    description: "Neon pink glow.",                     requiredLevel: 50,  borderCss: "2px solid #f472b6", glowCss: "0 0 10px #f472b6aa, 0 0 20px #f472b666", icon: "🩷" },
    { id: "border-glow-green", type: "border", name: "Green Glow",   description: "Nature's pulse.",                     requiredLevel: 55,  borderCss: "2px solid #4ade80", glowCss: "0 0 10px #4ade80aa, 0 0 20px #4ade8066", icon: "🟢" },
    { id: "border-glow-purple",type: "border", name: "Purple Glow",  description: "Cursed energy radiates.",             requiredLevel: 60,  borderCss: "2px solid #a855f7", glowCss: "0 0 12px #a855f7bb, 0 0 24px #a855f766", icon: "🔮" },
    { id: "border-rainbow",    type: "border", name: "Rainbow",      description: "All colors at once.",                 requiredLevel: 75,  borderCss: "3px solid transparent", glowCss: "0 0 0 3px transparent", icon: "🌈" },
    { id: "border-cosmic",     type: "border", name: "Cosmic Void",  description: "The cosmos in your frame.",           requiredLevel: 100, borderCss: "2px solid #818cf8", glowCss: "0 0 15px #818cf8cc, 0 0 30px #c084fc66, 0 0 45px #e879f933", icon: "🌌" },
]

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE BACKGROUNDS
// ─────────────────────────────────────────────────────────────────────────────

export interface BackgroundReward extends BaseReward {
    type: "background"
    /** CSS value for background (color, gradient, pattern) */
    backgroundCss: string
}

export const BACKGROUND_REWARDS: BackgroundReward[] = [
    { id: "bg-default",        type: "background", name: "Default",          description: "The default dark background.",       requiredLevel: 1,   backgroundCss: "transparent", icon: "⬛" },
    { id: "bg-midnight",       type: "background", name: "Midnight",         description: "Deep midnight blue.",                 requiredLevel: 5,   backgroundCss: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", icon: "🌙" },
    { id: "bg-cherry",         type: "background", name: "Cherry Blossom",   description: "Soft pink petals.",                   requiredLevel: 10,  backgroundCss: "linear-gradient(135deg, #2d0a16 0%, #4a1528 50%, #1a0a1e 100%)", icon: "🌸" },
    { id: "bg-ocean",          type: "background", name: "Ocean Depths",     description: "The deep sea.",                       requiredLevel: 15,  backgroundCss: "linear-gradient(135deg, #0c2340 0%, #0c3a6e 50%, #0a1628 100%)", icon: "🌊" },
    { id: "bg-forest",         type: "background", name: "Forest",           description: "A peaceful forest.",                  requiredLevel: 20,  backgroundCss: "linear-gradient(135deg, #0a1a0a 0%, #0d2d0d 50%, #0a1a12 100%)", icon: "🌲" },
    { id: "bg-ember",          type: "background", name: "Ember",            description: "Glowing embers.",                     requiredLevel: 25,  backgroundCss: "linear-gradient(135deg, #1a0500 0%, #3a0e00 50%, #1a0800 100%)", icon: "🔥" },
    { id: "bg-twilight",       type: "background", name: "Twilight",         description: "The moment between day and night.",   requiredLevel: 30,  backgroundCss: "linear-gradient(135deg, #1a0a30 0%, #0a0a2a 50%, #0a0a14 100%)", icon: "🌅" },
    { id: "bg-nebula",         type: "background", name: "Nebula",           description: "Interstellar gas clouds.",            requiredLevel: 35,  backgroundCss: "radial-gradient(ellipse at 30% 50%, #1a033a 0%, #030637 50%, #0f0c29 100%)", icon: "🌌" },
    { id: "bg-aurora",         type: "background", name: "Aurora Borealis",  description: "Northern lights dance.",              requiredLevel: 40,  backgroundCss: "linear-gradient(135deg, #001408 0%, #003318 30%, #001a30 60%, #100030 100%)", icon: "🌈" },
    { id: "bg-sakura",         type: "background", name: "Sakura Night",     description: "Moonlit cherry blossoms.",            requiredLevel: 50,  backgroundCss: "linear-gradient(to bottom, #0d0010 0%, #1a0020 40%, #08000e 100%)", icon: "🌸" },
    { id: "bg-onyx",           type: "background", name: "Onyx",             description: "Pure, polished black.",               requiredLevel: 60,  backgroundCss: "radial-gradient(ellipse at center, #1c1c1e 0%, #0a0a0a 100%)", icon: "⚫" },
    { id: "bg-void",           type: "background", name: "Void",             description: "Nothing. Everything.",               requiredLevel: 75,  backgroundCss: "radial-gradient(ellipse at 50% 30%, #1e0040 0%, #0d0020 60%, #000000 100%)", icon: "🔮" },
    { id: "bg-heaven",         type: "background", name: "Heaven",           description: "Pure celestial light.",               requiredLevel: 100, backgroundCss: "radial-gradient(ellipse at top, #fffbeb 0%, #fef3c7 30%, #fffde7 100%)", icon: "☀️" },
    { id: "bg-cosmic",         type: "background", name: "Cosmic Ocean",     description: "The entire universe as a canvas.",    requiredLevel: 150, backgroundCss: "radial-gradient(ellipse at 20% 70%, #3b0764 0%, #0f0c29 40%, #030637 80%, #000000 100%)", icon: "✨" },
    { id: "bg-prismatic",      type: "background", name: "Prismatic",        description: "Every color, perfectly balanced.",    requiredLevel: 200, backgroundCss: "conic-gradient(from 0deg, #ff000044, #ff800044, #ffff0044, #00ff0044, #00ffff44, #0000ff44, #ff00ff44, #ff000044)", icon: "🌈" },
]

// ─────────────────────────────────────────────────────────────────────────────
// XP BAR SKINS
// ─────────────────────────────────────────────────────────────────────────────

export interface XPBarSkinReward extends BaseReward {
    type: "xpBarSkin"
    /** CSS for the filled portion of the XP bar */
    fillCss: string
    /** CSS for the track background */
    trackCss?: string
    /**
     * CSS animation class(es) to add to the bar element.
     * "sea-xpbar-shimmer" | "sea-xpbar-shimmer-fast" | "sea-xpbar-pulse"
     */
    animClass?: string
}

export const XP_BAR_SKIN_REWARDS: XPBarSkinReward[] = [
    // ── Tier 1: Mundane (lv 1–10) ─────────────────────────────────────────
    { id: "xpbar-default",      type: "xpBarSkin", name: "Default",            description: "Plain indigo.",                    requiredLevel: 1,  fillCss: "#6366f1",                                                                         icon: "⬜" },
    { id: "xpbar-ash",          type: "xpBarSkin", name: "Ash",                description: "Cold ash gray.",                   requiredLevel: 1,  fillCss: "#6b7280",                                                                         icon: "⬜" },
    { id: "xpbar-stone",        type: "xpBarSkin", name: "Stone",              description: "Rough stone.",                     requiredLevel: 2,  fillCss: "linear-gradient(90deg, #374151, #6b7280)",                                        icon: "🪨" },
    { id: "xpbar-mud",          type: "xpBarSkin", name: "Mud",                description: "Muddy brown.",                     requiredLevel: 2,  fillCss: "#6b4226",                                                                         icon: "🟤" },
    { id: "xpbar-coal",         type: "xpBarSkin", name: "Coal",               description: "Dark charcoal.",                   requiredLevel: 3,  fillCss: "linear-gradient(90deg, #1f2937, #374151)",                                        icon: "⬛" },
    { id: "xpbar-concrete",     type: "xpBarSkin", name: "Concrete",           description: "Cold concrete.",                   requiredLevel: 3,  fillCss: "linear-gradient(90deg, #4b5563, #9ca3af)",                                        icon: "🔲" },
    { id: "xpbar-dust",         type: "xpBarSkin", name: "Dust",               description: "Faded dust.",                      requiredLevel: 4,  fillCss: "linear-gradient(90deg, #92400e, #b45309, #d6d3d1)",                               icon: "🌫️" },
    { id: "xpbar-rust",         type: "xpBarSkin", name: "Rust",               description: "Oxidized iron.",                   requiredLevel: 5,  fillCss: "linear-gradient(90deg, #7f1d1d, #b91c1c, #92400e)",                               icon: "🔴" },
    { id: "xpbar-fog",          type: "xpBarSkin", name: "Fog",                description: "Misty gray-white.",                requiredLevel: 6,  fillCss: "linear-gradient(90deg, #9ca3af, #d1d5db, #9ca3af)",                               icon: "🌁" },
    { id: "xpbar-swamp",        type: "xpBarSkin", name: "Swamp",              description: "Murky green-brown.",               requiredLevel: 7,  fillCss: "linear-gradient(90deg, #1a2e0e, #365314, #3f6212)",                               icon: "🌿" },

    // ── Tier 2: Basic Solids (lv 8–18) ────────────────────────────────────
    { id: "xpbar-crimson",      type: "xpBarSkin", name: "Crimson",            description: "Bold red.",                        requiredLevel: 8,  fillCss: "linear-gradient(90deg, #991b1b, #dc2626)",                                        icon: "🔴" },
    { id: "xpbar-navy",         type: "xpBarSkin", name: "Navy",               description: "Deep navy.",                       requiredLevel: 9,  fillCss: "linear-gradient(90deg, #1e3a5f, #1e40af)",                                        icon: "🔵" },
    { id: "xpbar-forest",       type: "xpBarSkin", name: "Forest",             description: "Deep forest.",                     requiredLevel: 10, fillCss: "linear-gradient(90deg, #14532d, #15803d)",                                        icon: "🌲" },
    { id: "xpbar-violet",       type: "xpBarSkin", name: "Violet",             description: "Royal purple.",                    requiredLevel: 11, fillCss: "linear-gradient(90deg, #4c1d95, #7c3aed)",                                        icon: "🟣" },
    { id: "xpbar-teal",         type: "xpBarSkin", name: "Teal",               description: "Cool teal.",                       requiredLevel: 12, fillCss: "linear-gradient(90deg, #0f766e, #0d9488)",                                        icon: "🩵" },
    { id: "xpbar-maroon",       type: "xpBarSkin", name: "Maroon",             description: "Dark maroon.",                     requiredLevel: 13, fillCss: "linear-gradient(90deg, #4c0519, #881337)",                                        icon: "🍷" },
    { id: "xpbar-olive",        type: "xpBarSkin", name: "Olive",              description: "Olive drab.",                      requiredLevel: 14, fillCss: "linear-gradient(90deg, #365314, #4d7c0f)",                                        icon: "🫒" },
    { id: "xpbar-slate",        type: "xpBarSkin", name: "Slate",              description: "Cool dark slate.",                 requiredLevel: 15, fillCss: "linear-gradient(90deg, #0f172a, #1e293b, #334155)",                               icon: "🌑" },
    { id: "xpbar-orange-solid", type: "xpBarSkin", name: "Orange",             description: "Bright orange.",                   requiredLevel: 16, fillCss: "linear-gradient(90deg, #c2410c, #ea580c)",                                        icon: "🟠" },
    { id: "xpbar-pink-solid",   type: "xpBarSkin", name: "Pink",               description: "Hot pink.",                        requiredLevel: 17, fillCss: "linear-gradient(90deg, #9d174d, #db2777)",                                        icon: "🩷" },
    { id: "xpbar-sky-solid",    type: "xpBarSkin", name: "Sky",                description: "Open sky blue.",                   requiredLevel: 18, fillCss: "linear-gradient(90deg, #0369a1, #0ea5e9)",                                        icon: "🔵" },

    // ── Tier 3: Simple Gradients (lv 19–35) ───────────────────────────────
    { id: "xpbar-dawn",         type: "xpBarSkin", name: "Dawn",               description: "Gray to rose.",                    requiredLevel: 19, fillCss: "linear-gradient(90deg, #374151, #9f1239, #f472b6)",                               icon: "🌅" },
    { id: "xpbar-dusk",         type: "xpBarSkin", name: "Dusk",               description: "Purple to orange.",                requiredLevel: 20, fillCss: "linear-gradient(90deg, #4c1d95, #7c3aed, #f97316)",                               icon: "🌇" },
    { id: "xpbar-ocean",        type: "xpBarSkin", name: "Ocean",              description: "Deep sea.",                        requiredLevel: 21, fillCss: "linear-gradient(90deg, #0c4a6e, #0ea5e9, #22d3ee)",                               icon: "🌊" },
    { id: "xpbar-lava",         type: "xpBarSkin", name: "Lava",               description: "Molten lava.",                     requiredLevel: 22, fillCss: "linear-gradient(90deg, #450a0a, #dc2626, #f97316)",                               icon: "🌋" },
    { id: "xpbar-ice",          type: "xpBarSkin", name: "Ice",                description: "Frozen crystal.",                  requiredLevel: 23, fillCss: "linear-gradient(90deg, #bfdbfe, #e0f2fe, #f0f9ff)",                               icon: "❄️" },
    { id: "xpbar-poison",       type: "xpBarSkin", name: "Poison",             description: "Toxic green.",                     requiredLevel: 24, fillCss: "linear-gradient(90deg, #14532d, #16a34a, #bef264)",                               icon: "☠️" },
    { id: "xpbar-storm",        type: "xpBarSkin", name: "Storm",              description: "Dark storm clouds.",               requiredLevel: 25, fillCss: "linear-gradient(90deg, #1e293b, #475569, #7dd3fc)",                               icon: "⛈️" },
    { id: "xpbar-candy",        type: "xpBarSkin", name: "Candy",              description: "Sweet pink-purple.",               requiredLevel: 26, fillCss: "linear-gradient(90deg, #f472b6, #c084fc, #a78bfa)",                               icon: "🍭" },
    { id: "xpbar-autumn",       type: "xpBarSkin", name: "Autumn",             description: "Falling leaves.",                  requiredLevel: 27, fillCss: "linear-gradient(90deg, #b91c1c, #ea580c, #facc15)",                               icon: "🍂" },
    { id: "xpbar-spring",       type: "xpBarSkin", name: "Spring",             description: "Fresh spring bloom.",              requiredLevel: 28, fillCss: "linear-gradient(90deg, #4ade80, #86efac, #fde68a)",                               icon: "🌸" },
    { id: "xpbar-night",        type: "xpBarSkin", name: "Night Sky",          description: "Midnight indigo.",                 requiredLevel: 29, fillCss: "linear-gradient(90deg, #0f0c29, #302b63, #24243e)",                               icon: "🌙" },
    { id: "xpbar-sundown",      type: "xpBarSkin", name: "Sundown",            description: "Orange to pink horizon.",          requiredLevel: 30, fillCss: "linear-gradient(90deg, #ea580c, #f43f5e, #c026d3)",                               icon: "🌄" },
    { id: "xpbar-electric",     type: "xpBarSkin", name: "Electric",           description: "High voltage.",                    requiredLevel: 31, fillCss: "linear-gradient(90deg, #1e40af, #60a5fa, #e0f2fe)",                               icon: "⚡" },
    { id: "xpbar-sakura",       type: "xpBarSkin", name: "Sakura",             description: "Cherry blossom.",                  requiredLevel: 32, fillCss: "linear-gradient(90deg, #9f1239, #f472b6, #fce7f3)",                               icon: "🌸" },
    { id: "xpbar-venom",        type: "xpBarSkin", name: "Venom",              description: "Symbiote energy.",                 requiredLevel: 33, fillCss: "linear-gradient(90deg, #1e003a, #6d28d9, #3b0764)",                               icon: "🕷️" },
    { id: "xpbar-shadow",       type: "xpBarSkin", name: "Shadow",             description: "Pure darkness.",                   requiredLevel: 34, fillCss: "linear-gradient(90deg, #000000, #374151, #000000)",                               icon: "🌑" },
    { id: "xpbar-inferno",      type: "xpBarSkin", name: "Inferno",            description: "All-consuming fire.",              requiredLevel: 35, fillCss: "linear-gradient(90deg, #450a0a, #b91c1c, #ea580c, #f59e0b)",                      icon: "🔥" },

    // ── Tier 4: Vivid Multi-Color (lv 36–55) ──────────────────────────────
    { id: "xpbar-fire",         type: "xpBarSkin", name: "Fire",               description: "Burning bright.",                  requiredLevel: 36, fillCss: "linear-gradient(90deg, #dc2626, #ea580c, #f59e0b)",                               icon: "🔥" },
    { id: "xpbar-ice-storm",    type: "xpBarSkin", name: "Ice Storm",          description: "Frozen blizzard.",                 requiredLevel: 37, fillCss: "linear-gradient(90deg, #1e40af, #0ea5e9, #e0f2fe, #7dd3fc)",                      icon: "🌨️" },
    { id: "xpbar-toxic",        type: "xpBarSkin", name: "Toxic",              description: "Radioactive glow.",                requiredLevel: 38, fillCss: "linear-gradient(90deg, #166534, #16a34a, #86efac, #bef264)",                      icon: "☢️" },
    { id: "xpbar-plasma",       type: "xpBarSkin", name: "Plasma",             description: "High-energy plasma.",              requiredLevel: 39, fillCss: "linear-gradient(90deg, #c026d3, #a855f7, #818cf8, #60a5fa)",                      icon: "🔮" },
    { id: "xpbar-solar",        type: "xpBarSkin", name: "Solar",              description: "Star energy.",                     requiredLevel: 40, fillCss: "linear-gradient(90deg, #fbbf24, #f97316, #dc2626)",                               icon: "☀️" },
    { id: "xpbar-glacier",      type: "xpBarSkin", name: "Glacier",            description: "Ancient ice.",                     requiredLevel: 41, fillCss: "linear-gradient(90deg, #0c4a6e, #0369a1, #7dd3fc, #e0f2fe)",                      icon: "🧊" },
    { id: "xpbar-jungle",       type: "xpBarSkin", name: "Jungle",             description: "Dense canopy.",                    requiredLevel: 42, fillCss: "linear-gradient(90deg, #14532d, #15803d, #4ade80, #86efac)",                      icon: "🌴" },
    { id: "xpbar-blood-moon",   type: "xpBarSkin", name: "Blood Moon",         description: "Crimson moon rises.",              requiredLevel: 43, fillCss: "linear-gradient(90deg, #450a0a, #7f1d1d, #dc2626, #ea580c)",                      icon: "🌕" },
    { id: "xpbar-thunder",      type: "xpBarSkin", name: "Thunder",            description: "Thunderbolt power.",               requiredLevel: 44, fillCss: "linear-gradient(90deg, #374151, #fde047, #f9fafb)",                               icon: "⚡" },
    { id: "xpbar-abyssal",      type: "xpBarSkin", name: "Abyssal",            description: "The deep abyss.",                  requiredLevel: 45, fillCss: "linear-gradient(90deg, #000000, #1e1b4b, #4c1d95)",                               icon: "🌊" },
    { id: "xpbar-neon",         type: "xpBarSkin", name: "Neon",               description: "Cyberpunk neon.",                  requiredLevel: 46, fillCss: "linear-gradient(90deg, #f0abfc, #fde047, #a5f3fc)",                               icon: "💡" },
    { id: "xpbar-magma",        type: "xpBarSkin", name: "Magma",              description: "Volcanic magma.",                  requiredLevel: 47, fillCss: "linear-gradient(90deg, #000000, #7f1d1d, #f97316, #fbbf24)",                      icon: "🌋" },
    { id: "xpbar-naruto",       type: "xpBarSkin", name: "Naruto",             description: "Nine tails chakra.",               requiredLevel: 48, fillCss: "linear-gradient(90deg, #7c2d12, #ea580c, #f97316)", trackCss: "#1c0a00",            icon: "🍜" },
    { id: "xpbar-bleach",       type: "xpBarSkin", name: "Bleach",             description: "Soul reaper spirit energy.",       requiredLevel: 49, fillCss: "linear-gradient(90deg, #1e293b, #94a3b8, #e2e8f0)", trackCss: "#0f0f0f",            icon: "⚔️" },
    { id: "xpbar-cosmos",       type: "xpBarSkin", name: "Cosmos",             description: "Galactic energy.",                 requiredLevel: 50, fillCss: "linear-gradient(90deg, #0f0c29, #302b63, #818cf8, #c084fc, #e879f9)",             icon: "🌌" },
    { id: "xpbar-dbz",          type: "xpBarSkin", name: "Dragon Ball",        description: "Over 9000.",                       requiredLevel: 51, fillCss: "linear-gradient(90deg, #1e40af, #f59e0b, #dc2626)",                               icon: "🐉" },
    { id: "xpbar-jjk",          type: "xpBarSkin", name: "Jujutsu",            description: "Cursed energy flows.",             requiredLevel: 52, fillCss: "linear-gradient(90deg, #1e1b4b, #7c3aed, #a855f7)", trackCss: "#0a0010",            icon: "🔮" },
    { id: "xpbar-spectral",     type: "xpBarSkin", name: "Spectral",           description: "Ghostly spirit.",                  requiredLevel: 53, fillCss: "linear-gradient(90deg, #1e1b4b, #4338ca, #818cf8, #c7d2fe)",                      icon: "👻" },
    { id: "xpbar-amber",        type: "xpBarSkin", name: "Amber",              description: "Warm amber glow.",                 requiredLevel: 54, fillCss: "linear-gradient(90deg, #78350f, #d97706, #fbbf24, #fde68a)",                      icon: "🍯" },
    { id: "xpbar-rainbow",      type: "xpBarSkin", name: "Rainbow",            description: "Full spectrum.",                   requiredLevel: 55, fillCss: "linear-gradient(90deg, #f43f5e, #f97316, #facc15, #4ade80, #60a5fa, #a78bfa)",    icon: "🌈" },

    // ── Tier 5: Metallic (lv 56–70) ───────────────────────────────────────
    { id: "xpbar-copper",       type: "xpBarSkin", name: "Copper",             description: "Oxidized copper.",                 requiredLevel: 56, fillCss: "linear-gradient(90deg, #7c2d12, #b45309, #d97706, #b45309)",                      icon: "🥉" },
    { id: "xpbar-bronze",       type: "xpBarSkin", name: "Bronze",             description: "Ancient bronze.",                  requiredLevel: 57, fillCss: "linear-gradient(90deg, #431407, #78350f, #a16207, #92400e)",                      icon: "🥉" },
    { id: "xpbar-steel",        type: "xpBarSkin", name: "Steel",              description: "Cold forged steel.",               requiredLevel: 58, fillCss: "linear-gradient(90deg, #1e293b, #64748b, #cbd5e1, #64748b)",                      icon: "⚙️" },
    { id: "xpbar-chrome",       type: "xpBarSkin", name: "Chrome",             description: "Mirror-polished chrome.",          requiredLevel: 59, fillCss: "linear-gradient(90deg, #475569, #94a3b8, #f1f5f9, #94a3b8, #475569)",            icon: "💿" },
    { id: "xpbar-titanium",     type: "xpBarSkin", name: "Titanium",           description: "Titanium alloy.",                  requiredLevel: 60, fillCss: "linear-gradient(90deg, #1e293b, #475569, #94a3b8, #cbd5e1)",                      icon: "⚙️" },
    { id: "xpbar-platinum",     type: "xpBarSkin", name: "Platinum",           description: "Rare platinum.",                   requiredLevel: 61, fillCss: "linear-gradient(90deg, #94a3b8, #e2e8f0, #f8fafc, #e2e8f0)",                      icon: "⚪" },
    { id: "xpbar-moonstone",    type: "xpBarSkin", name: "Moonstone",          description: "Ethereal moonstone.",              requiredLevel: 62, fillCss: "linear-gradient(90deg, #94a3b8, #bfdbfe, #f0f9ff, #bfdbfe, #94a3b8)",            icon: "🌙" },
    { id: "xpbar-obsidian",     type: "xpBarSkin", name: "Obsidian",           description: "Volcanic glass.",                  requiredLevel: 63, fillCss: "linear-gradient(90deg, #000000, #1c1917, #44403c, #1c1917)",                      icon: "⬛" },
    { id: "xpbar-sapphire",     type: "xpBarSkin", name: "Sapphire",           description: "Deep sapphire gem.",               requiredLevel: 64, fillCss: "linear-gradient(90deg, #1e3a5f, #1d4ed8, #60a5fa, #1d4ed8)",                      icon: "💠" },
    { id: "xpbar-ruby",         type: "xpBarSkin", name: "Ruby",               description: "Precious ruby.",                   requiredLevel: 65, fillCss: "linear-gradient(90deg, #7f1d1d, #dc2626, #f87171, #dc2626)",                      icon: "🔴" },
    { id: "xpbar-emerald",      type: "xpBarSkin", name: "Emerald",            description: "Deep emerald gem.",                requiredLevel: 66, fillCss: "linear-gradient(90deg, #14532d, #16a34a, #4ade80, #16a34a)",                      icon: "💚" },
    { id: "xpbar-amethyst",     type: "xpBarSkin", name: "Amethyst",           description: "Royal amethyst.",                  requiredLevel: 67, fillCss: "linear-gradient(90deg, #3b0764, #7e22ce, #c084fc, #7e22ce)",                      icon: "💜" },
    { id: "xpbar-jade",         type: "xpBarSkin", name: "Jade",               description: "Imperial jade.",                   requiredLevel: 68, fillCss: "linear-gradient(90deg, #064e3b, #059669, #34d399, #059669)",                      icon: "🟢" },
    { id: "xpbar-topaz",        type: "xpBarSkin", name: "Topaz",              description: "Golden topaz.",                    requiredLevel: 69, fillCss: "linear-gradient(90deg, #78350f, #b45309, #fbbf24, #f59e0b)",                      icon: "🟡" },
    { id: "xpbar-opal",         type: "xpBarSkin", name: "Opal",               description: "Shifting opal.",                   requiredLevel: 70, fillCss: "linear-gradient(90deg, #e0e7ff, #fce7f3, #d1fae5, #fef3c7, #e0e7ff)",            icon: "✨" },

    // ── Tier 6: Gold Progression (lv 71–87) ───────────────────────────────
    { id: "xpbar-brass",        type: "xpBarSkin", name: "Brass",              description: "Warm brass.",                      requiredLevel: 71, fillCss: "linear-gradient(90deg, #92400e, #b45309, #d97706)",                               icon: "🟡" },
    { id: "xpbar-gold-i",       type: "xpBarSkin", name: "Gold I",             description: "Basic gold.",                      requiredLevel: 72, fillCss: "linear-gradient(90deg, #78350f, #b45309, #d97706, #fbbf24)",                      icon: "🥇" },
    { id: "xpbar-gold-ii",      type: "xpBarSkin", name: "Gold II",            description: "Richer gold.",                     requiredLevel: 73, fillCss: "linear-gradient(90deg, #92400e, #d97706, #fbbf24, #fde68a)",                      icon: "🥇" },
    { id: "xpbar-antique",      type: "xpBarSkin", name: "Antique Gold",       description: "Aged and precious.",               requiredLevel: 74, fillCss: "linear-gradient(90deg, #4d3008, #a16207, #ca8a04, #eab308, #ca8a04)",            icon: "🏺" },
    { id: "xpbar-rose-gold",    type: "xpBarSkin", name: "Rose Gold",          description: "Pink-tinted gold.",                requiredLevel: 75, fillCss: "linear-gradient(90deg, #be185d, #d97706, #fbbf24, #f9a8d4)",                      icon: "🌹" },
    { id: "xpbar-deep-gold",    type: "xpBarSkin", name: "Deep Gold",          description: "Dark to bright gold.",             requiredLevel: 76, fillCss: "linear-gradient(90deg, #1c0900, #78350f, #fbbf24, #fde68a)",                      icon: "🥇" },
    { id: "xpbar-pure-gold",    type: "xpBarSkin", name: "Pure Gold",          description: "Brilliant gold.",                  requiredLevel: 77, fillCss: "linear-gradient(90deg, #d97706, #fbbf24, #fef3c7, #fbbf24, #d97706)",            icon: "✨" },
    { id: "xpbar-crown",        type: "xpBarSkin", name: "Crown Gold",         description: "Royal crown.",                     requiredLevel: 78, fillCss: "linear-gradient(90deg, #78350f, #b45309, #fbbf24, #fef3c7, #fbbf24, #b45309)",   icon: "👑" },
    { id: "xpbar-white-gold",   type: "xpBarSkin", name: "White Gold",         description: "Silver and gold blend.",           requiredLevel: 79, fillCss: "linear-gradient(90deg, #94a3b8, #fbbf24, #f8fafc, #fbbf24, #94a3b8)",            icon: "⚪" },
    { id: "xpbar-imperial",     type: "xpBarSkin", name: "Imperial Gold",      description: "The emperor's gold.",              requiredLevel: 80, fillCss: "linear-gradient(90deg, #1c0a00, #78350f, #d97706, #fef3c7, #d97706, #78350f)",   icon: "👑" },
    { id: "xpbar-aureate",      type: "xpBarSkin", name: "Aureate",            description: "Gloriously golden.",              requiredLevel: 82, fillCss: "linear-gradient(90deg, #d97706, #f59e0b, #fbbf24, #fde68a, #fef9c3)",            icon: "🌟" },
    { id: "xpbar-solar-gold",   type: "xpBarSkin", name: "Solar Gold",         description: "Gold kissed by the sun.",          requiredLevel: 84, fillCss: "linear-gradient(90deg, #dc2626, #ea580c, #fbbf24, #fef3c7, #fbbf24)",            icon: "☀️" },
    { id: "xpbar-sacred",       type: "xpBarSkin", name: "Sacred Gold",        description: "Holy radiance.",                   requiredLevel: 86, fillCss: "linear-gradient(90deg, #78350f, #fbbf24, #fef9c3, #fbbf24, #78350f)", trackCss: "#0a0500", icon: "✝️" },

    // ── Tier 7: Shimmering Gold (lv 88–100+) ──────────────────────────────
    { id: "xpbar-gold-shimmer",    type: "xpBarSkin", name: "Shimmering Gold",    description: "Gold that shimmers.",          requiredLevel: 88,  fillCss: "linear-gradient(90deg, #78350f, #d97706, #fef9c3, #fbbf24, #b45309, #fef3c7, #d97706)", animClass: "sea-xpbar-shimmer",      icon: "✨" },
    { id: "xpbar-gold-shimmer-ii", type: "xpBarSkin", name: "Gold Shimmer II",    description: "Brighter shimmer.",            requiredLevel: 90,  fillCss: "linear-gradient(90deg, #92400e, #fbbf24, #fef3c7, #d97706, #fef9c3, #fbbf24, #92400e)", animClass: "sea-xpbar-shimmer",      icon: "✨" },
    { id: "xpbar-aurora-gold",     type: "xpBarSkin", name: "Aurora Gold",        description: "Northern lights gold.",        requiredLevel: 92,  fillCss: "linear-gradient(90deg, #065f46, #fbbf24, #fef3c7, #a855f7, #fbbf24, #0d9488)",          animClass: "sea-xpbar-shimmer",      icon: "🌌" },
    { id: "xpbar-blaze-gold",      type: "xpBarSkin", name: "Blaze Gold",         description: "Burning gold flame.",          requiredLevel: 94,  fillCss: "linear-gradient(90deg, #7c2d12, #ea580c, #fbbf24, #fef3c7, #fbbf24, #ea580c)",          animClass: "sea-xpbar-shimmer-fast", icon: "🔥" },
    { id: "xpbar-prismatic-gold",  type: "xpBarSkin", name: "Prismatic Gold",     description: "Gold meets the rainbow.",      requiredLevel: 96,  fillCss: "linear-gradient(90deg, #fbbf24, #f43f5e, #60a5fa, #4ade80, #fbbf24, #a78bfa, #fef3c7)", animClass: "sea-xpbar-shimmer",      icon: "🌈" },
    { id: "xpbar-divine",          type: "xpBarSkin", name: "Divine Radiance",    description: "Pure celestial light.",        requiredLevel: 100, fillCss: "linear-gradient(90deg, #fcd34d, #fef3c7, #fffbeb, #fef3c7, #fcd34d, #f59e0b, #fef9c3)", animClass: "sea-xpbar-shimmer",      icon: "☀️" },
    { id: "xpbar-void",            type: "xpBarSkin", name: "Void",               description: "The bar is a lie.",            requiredLevel: 100, fillCss: "linear-gradient(90deg, #000000, #1e0040, #000000)", trackCss: "#000000",                                                      icon: "🌑" },
    { id: "xpbar-cosmic",          type: "xpBarSkin", name: "Cosmic",             description: "Stars in motion.",             requiredLevel: 120, fillCss: "linear-gradient(90deg, #0f0c29, #818cf8, #c084fc, #e879f9, #0f0c29)", trackCss: "#030010", animClass: "sea-xpbar-shimmer",    icon: "🌌" },
    { id: "xpbar-legendary",       type: "xpBarSkin", name: "Legendary Gold",     description: "Gold of legend.",              requiredLevel: 150, fillCss: "linear-gradient(90deg, #1c0900, #78350f, #d97706, #fef9c3, #f59e0b, #fef3c7, #78350f, #fbbf24)", animClass: "sea-xpbar-shimmer-fast", icon: "👑" },
    { id: "xpbar-immortal-gold",   type: "xpBarSkin", name: "Immortal Gold",      description: "Beyond legendary.",           requiredLevel: 200, fillCss: "linear-gradient(90deg, #fbbf24, #f9a8d4, #fef3c7, #c4b5fd, #fbbf24, #fde68a, #a78bfa)", animClass: "sea-xpbar-shimmer-fast", icon: "🌟" },
]

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE SETS
// ─────────────────────────────────────────────────────────────────────────────

export interface ParticleSetReward extends BaseReward {
    type: "particleSet"
    /** Identifier used by the particle engine to select the set */
    particleKey: string
    /** Preview emoji representing the particle */
    previewEmoji: string
    /** CSS color of the particles */
    color: string
    /** CSS secondary color */
    secondaryColor?: string
}

export const PARTICLE_SET_REWARDS: ParticleSetReward[] = [
    { id: "particles-none",        type: "particleSet", name: "None",           description: "No particles.",                   requiredLevel: 1,   particleKey: "none",       previewEmoji: "⬜", color: "transparent", icon: "⬜" },
    { id: "particles-sakura",      type: "particleSet", name: "Sakura",         description: "Falling cherry blossoms.",         requiredLevel: 10,  particleKey: "sakura",     previewEmoji: "🌸", color: "#f9a8d4", secondaryColor: "#fda4af", icon: "🌸" },
    { id: "particles-snow",        type: "particleSet", name: "Snow",           description: "Gentle snowflakes.",               requiredLevel: 15,  particleKey: "snow",       previewEmoji: "❄️", color: "#e2e8f0", secondaryColor: "#bfdbfe", icon: "❄️" },
    { id: "particles-sparks",      type: "particleSet", name: "Sparks",         description: "Electric sparks fly.",             requiredLevel: 20,  particleKey: "sparks",     previewEmoji: "⚡", color: "#facc15", secondaryColor: "#fbbf24", icon: "⚡" },
    { id: "particles-embers",      type: "particleSet", name: "Embers",         description: "Floating fire embers.",            requiredLevel: 25,  particleKey: "embers",     previewEmoji: "🔥", color: "#f97316", secondaryColor: "#dc2626", icon: "🔥" },
    { id: "particles-bubbles",     type: "particleSet", name: "Bubbles",        description: "Floating water bubbles.",          requiredLevel: 30,  particleKey: "bubbles",    previewEmoji: "🫧", color: "#67e8f9", secondaryColor: "#7dd3fc", icon: "🫧" },
    { id: "particles-leaves",      type: "particleSet", name: "Leaves",         description: "Autumn leaves falling.",           requiredLevel: 35,  particleKey: "leaves",     previewEmoji: "🍂", color: "#ea580c", secondaryColor: "#d97706", icon: "🍂" },
    { id: "particles-stars",       type: "particleSet", name: "Stars",          description: "Glittering stars.",                requiredLevel: 50,  particleKey: "stars",      previewEmoji: "⭐", color: "#fbbf24", secondaryColor: "#fde68a", icon: "⭐" },
    { id: "particles-rose",        type: "particleSet", name: "Rose Petals",    description: "Red rose petals drift.",           requiredLevel: 60,  particleKey: "rose",       previewEmoji: "🌹", color: "#f43f5e", secondaryColor: "#e11d48", icon: "🌹" },
    { id: "particles-cosmos",      type: "particleSet", name: "Cosmos",         description: "Cosmic dust particles.",           requiredLevel: 100, particleKey: "cosmos",     previewEmoji: "✨", color: "#c084fc", secondaryColor: "#818cf8", icon: "✨" },
    { id: "particles-fireflies",   type: "particleSet", name: "Fireflies",      description: "Glowing fireflies at dusk.",       requiredLevel: 22,  particleKey: "fireflies",  previewEmoji: "🪲", color: "#86efac", secondaryColor: "#d9f99d", icon: "🪲" },
    { id: "particles-rain",        type: "particleSet", name: "Rain",           description: "Falling raindrops.",              requiredLevel: 18,  particleKey: "rain",       previewEmoji: "🌧️", color: "#60a5fa", secondaryColor: "#93c5fd", icon: "🌧️" },
    { id: "particles-feathers",    type: "particleSet", name: "Feathers",       description: "White feathers drifting down.",    requiredLevel: 28,  particleKey: "feathers",   previewEmoji: "🪶", color: "#f8fafc", secondaryColor: "#e2e8f0", icon: "🪶" },
    { id: "particles-hearts",      type: "particleSet", name: "Hearts",         description: "Love hearts floating up.",         requiredLevel: 32,  particleKey: "hearts",     previewEmoji: "💖", color: "#f472b6", secondaryColor: "#fb7185", icon: "💖" },
    { id: "particles-music",       type: "particleSet", name: "Music Notes",    description: "Musical notes dancing around.",    requiredLevel: 38,  particleKey: "music",      previewEmoji: "🎵", color: "#818cf8", secondaryColor: "#a78bfa", icon: "🎵" },
    { id: "particles-confetti",    type: "particleSet", name: "Confetti",       description: "Celebration confetti.",            requiredLevel: 42,  particleKey: "confetti",   previewEmoji: "🎊", color: "#f43f5e", secondaryColor: "#fbbf24", icon: "🎊" },
    { id: "particles-crystals",    type: "particleSet", name: "Crystals",       description: "Shimmering crystal shards.",       requiredLevel: 55,  particleKey: "crystals",   previewEmoji: "💎", color: "#38bdf8", secondaryColor: "#7dd3fc", icon: "💎" },
    { id: "particles-lightning",   type: "particleSet", name: "Lightning",      description: "Electric lightning tendrils.",     requiredLevel: 65,  particleKey: "lightning",  previewEmoji: "⚡", color: "#fde047", secondaryColor: "#facc15", icon: "⚡" },
    { id: "particles-void",        type: "particleSet", name: "Void Shards",    description: "Fragments of the void itself.",    requiredLevel: 80,  particleKey: "void",       previewEmoji: "🌑", color: "#7c3aed", secondaryColor: "#4c1d95", icon: "🌑" },
    { id: "particles-galaxy",      type: "particleSet", name: "Galaxy Dust",    description: "A spiral of galactic stardust.",   requiredLevel: 120, particleKey: "galaxy",     previewEmoji: "🌌", color: "#818cf8", secondaryColor: "#e879f9", icon: "🌌" },
    { id: "particles-prismatic",   type: "particleSet", name: "Prismatic",      description: "Rainbow prismatic light shards.",  requiredLevel: 150, particleKey: "prismatic",  previewEmoji: "🌈", color: "#f43f5e", secondaryColor: "#60a5fa", icon: "🌈" },
]

// ─────────────────────────────────────────────────────────────────────────────
// EASTER EGG EXCLUSIVE REWARDS
// These have requiredLevel: 9999 so they're never unlocked by leveling alone.
// They are granted by the EasterEggEngine when specific eggs are discovered.
// ─────────────────────────────────────────────────────────────────────────────

export const EGG_NAME_COLOR_REWARDS: NameColorReward[] = [
    {
        id: "egg-nc-senpai",
        type: "nameColor",
        name: "Senpai Notice Me",
        description: "🥚 Easter Egg Exclusive — discovered by whispering the right words.",
        requiredLevel: 9999,
        color: "#f472b6",
        gradientCss: "linear-gradient(90deg, #f472b6, #fb7185, #fda4af, #f472b6)",
        icon: "🌸",
    },
    {
        id: "egg-nc-jester",
        type: "nameColor",
        name: "Court Jester",
        description: "🥚 Easter Egg Exclusive — only fools find this on April 1st.",
        requiredLevel: 9999,
        color: "#a855f7",
        gradientCss: "linear-gradient(90deg, #a855f7, #ec4899, #f97316, #facc15, #4ade80, #60a5fa, #a855f7)",
        icon: "🃏",
    },
]

export const EGG_BORDER_REWARDS: BorderReward[] = [
    {
        id: "egg-border-gold-aura",
        type: "border",
        name: "Gold Aura",
        description: "🥚 Easter Egg Exclusive — the glow of reaching level 100.",
        requiredLevel: 9999,
        borderCss: "3px solid #fbbf24",
        glowCss: "0 0 20px #fbbf24cc, 0 0 40px #f59e0b88, 0 0 60px #f59e0b44",
        icon: "✨",
    },
]

export const EGG_PARTICLE_REWARDS: ParticleSetReward[] = [
    {
        id: "egg-particle-bananas",
        type: "particleSet",
        name: "Banana Rain",
        description: "🥚 Easter Egg Exclusive — it's raining bananas.",
        requiredLevel: 9999,
        particleKey: "stars",   // reuse stars physics, yellow color
        previewEmoji: "🍌",
        color: "#fbbf24",
        secondaryColor: "#f59e0b",
        icon: "🍌",
    },
    {
        id: "egg-particle-fireworks",
        type: "particleSet",
        name: "Fireworks",
        description: "🥚 Easter Egg Exclusive — happy new year!",
        requiredLevel: 9999,
        particleKey: "sparks",
        previewEmoji: "🎆",
        color: "#f43f5e",
        secondaryColor: "#fbbf24",
        icon: "🎆",
    },
    {
        id: "egg-particle-sparkle-gold",
        type: "particleSet",
        name: "Gold Sparkles",
        description: "🥚 Easter Egg Exclusive — 50 series completed.",
        requiredLevel: 9999,
        particleKey: "stars",
        previewEmoji: "🌟",
        color: "#fbbf24",
        secondaryColor: "#fde68a",
        icon: "🌟",
    },
]

/** All easter-egg-exclusive rewards (these are checked separately in the reward provider) */
export const ALL_EGG_REWARDS = [
    ...EGG_NAME_COLOR_REWARDS,
    ...EGG_BORDER_REWARDS,
    ...EGG_PARTICLE_REWARDS,
]

// ─────────────────────────────────────────────────────────────────────────────
// Union type for all reward types
// ─────────────────────────────────────────────────────────────────────────────

export type AnyReward = TitleReward | NameColorReward | BorderReward | BackgroundReward | XPBarSkinReward | ParticleSetReward

export const ALL_REWARDS: AnyReward[] = [
    ...TITLE_REWARDS,
    ...NAME_COLOR_REWARDS,
    ...BORDER_REWARDS,
    ...BACKGROUND_REWARDS,
    ...XP_BAR_SKIN_REWARDS,
    ...PARTICLE_SET_REWARDS,
]
