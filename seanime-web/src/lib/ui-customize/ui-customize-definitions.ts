// ─────────────────────────────────────────────────────────────────────────────
// UI Customize Definitions
// Each tab has up to 40 preset options. Selected presets are stored per-profile
// in localStorage and applied as CSS custom properties on the root element.
// ─────────────────────────────────────────────────────────────────────────────

export interface UIPreset {
    id: string
    name: string
    description: string
    icon?: string
    /** CSS variables to set on :root when this preset is active */
    cssVars?: Record<string, string>
    /** Extra class(es) to add to <body> */
    bodyClass?: string
    /** Small inline CSS for the preview swatch in the grid */
    previewCss?: string
    requiredLevel?: number
}

// ─── 1. Animation Speed ──────────────────────────────────────────────────────

export const ANIMATION_PRESETS: UIPreset[] = [
    { id: "anim-instant",    name: "Instant",        description: "No transitions at all.",                 icon: "⚡", cssVars: { "--sea-dur": "0ms",   "--sea-ease": "linear" },               previewCss: "background:#374151",   requiredLevel: 1  },
    { id: "anim-snap",       name: "Snap",           description: "Sharp, immediate snaps.",               icon: "⚡", cssVars: { "--sea-dur": "50ms",  "--sea-ease": "steps(1)" },             previewCss: "background:#4b5563",   requiredLevel: 1  },
    { id: "anim-fast",       name: "Fast",           description: "Snappy 100ms transitions.",             icon: "⚡", cssVars: { "--sea-dur": "100ms", "--sea-ease": "ease-out" },             previewCss: "background:#6366f1",   requiredLevel: 1  },
    { id: "anim-brisk",      name: "Brisk",          description: "Crisp 150ms transitions.",              icon: "🏃", cssVars: { "--sea-dur": "150ms", "--sea-ease": "ease-out" },             previewCss: "background:#7c3aed",   requiredLevel: 1  },
    { id: "anim-standard",   name: "Standard",       description: "Default 200ms transitions.",            icon: "▶️", cssVars: { "--sea-dur": "200ms", "--sea-ease": "ease" },                 previewCss: "background:#818cf8",   requiredLevel: 1  },
    { id: "anim-smooth",     name: "Smooth",         description: "Gentle 300ms easing.",                  icon: "🌊", cssVars: { "--sea-dur": "300ms", "--sea-ease": "ease-in-out" },          previewCss: "background:#a78bfa",   requiredLevel: 3  },
    { id: "anim-fluid",      name: "Fluid",          description: "Fluid 400ms motion.",                   icon: "💧", cssVars: { "--sea-dur": "400ms", "--sea-ease": "cubic-bezier(.4,0,.2,1)" }, previewCss: "background:#c084fc", requiredLevel: 5  },
    { id: "anim-slow",       name: "Slow",           description: "Relaxed 500ms transitions.",            icon: "🐢", cssVars: { "--sea-dur": "500ms", "--sea-ease": "ease-in-out" },          previewCss: "background:#e879f9",   requiredLevel: 8  },
    { id: "anim-cinematic",  name: "Cinematic",      description: "Dramatic 700ms fades.",                 icon: "🎬", cssVars: { "--sea-dur": "700ms", "--sea-ease": "cubic-bezier(.2,0,0,1)" }, previewCss: "background:#f0abfc",  requiredLevel: 12 },
    { id: "anim-drift",      name: "Drift",          description: "Languid 900ms drift.",                  icon: "🍃", cssVars: { "--sea-dur": "900ms", "--sea-ease": "ease-in-out" },          previewCss: "background:#fce7f3",   requiredLevel: 15 },
    { id: "anim-bounce",     name: "Bounce",         description: "Spring bounce easing.",                 icon: "🏀", cssVars: { "--sea-dur": "400ms", "--sea-ease": "cubic-bezier(.34,1.56,.64,1)" }, previewCss: "background:#fb923c", requiredLevel: 20 },
    { id: "anim-elastic",    name: "Elastic",        description: "Elastic overshoot.",                    icon: "🎈", cssVars: { "--sea-dur": "600ms", "--sea-ease": "cubic-bezier(.68,-.6,.32,1.6)" }, previewCss: "background:#f97316", requiredLevel: 25 },
    { id: "anim-back",       name: "Back-Ease",      description: "Slight pull-back before snapping.",     icon: "↩️", cssVars: { "--sea-dur": "350ms", "--sea-ease": "cubic-bezier(.36,0,.66,-.56)" }, previewCss: "background:#ef4444", requiredLevel: 10 },
    { id: "anim-expo",       name: "Exponential",    description: "Exponential acceleration.",             icon: "📈", cssVars: { "--sea-dur": "400ms", "--sea-ease": "cubic-bezier(.9,0,.1,1)" }, previewCss: "background:#dc2626",  requiredLevel: 15 },
    { id: "anim-quint",      name: "Quint",          description: "Strong quint ease-out.",                icon: "5️⃣", cssVars: { "--sea-dur": "350ms", "--sea-ease": "cubic-bezier(.23,1,.32,1)" }, previewCss: "background:#991b1b",  requiredLevel: 8  },
]

// ─── 2. Card Style ────────────────────────────────────────────────────────────

export const CARD_STYLE_PRESETS: UIPreset[] = [
    { id: "card-default",    name: "Default",        description: "Subtle frosted-glass cards.",           icon: "🃏", cssVars: { "--sea-card-bg": "rgba(0,0,0,0.25)",       "--sea-card-border": "rgba(255,255,255,0.1)",  "--sea-card-blur": "12px" },  previewCss: "background:rgba(0,0,0,0.25);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1)", requiredLevel: 1 },
    { id: "card-glass",      name: "Glass",          description: "Frosted glass cards.",                  icon: "🔷", cssVars: { "--sea-card-bg": "rgba(255,255,255,0.07)", "--sea-card-border": "rgba(255,255,255,0.15)", "--sea-card-blur": "28px" },  previewCss: "background:rgba(255,255,255,0.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.2)", requiredLevel: 5 },
    { id: "card-glass-dark", name: "Dark Glass",     description: "Darker frosted glass.",                 icon: "🔲", cssVars: { "--sea-card-bg": "rgba(0,0,0,0.4)",       "--sea-card-border": "rgba(255,255,255,0.08)", "--sea-card-blur": "32px" },  previewCss: "background:rgba(0,0,0,0.4);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.08)", requiredLevel: 8 },
    { id: "card-solid",      name: "Solid",          description: "Opaque solid background.",              icon: "⬛", cssVars: { "--sea-card-bg": "#1e2030",               "--sea-card-border": "rgba(255,255,255,0.06)", "--sea-card-blur": "0px" },   previewCss: "background:#1e2030;border:1px solid rgba(255,255,255,0.06)", requiredLevel: 3 },
    { id: "card-minimal",    name: "Minimal",        description: "Borderless minimal cards.",             icon: "▫️", cssVars: { "--sea-card-bg": "transparent",           "--sea-card-border": "transparent",           "--sea-card-blur": "0px" },   previewCss: "background:transparent;border:1px solid transparent", requiredLevel: 3 },
    { id: "card-outline",    name: "Outline",        description: "Border only, transparent fill.",        icon: "⬜", cssVars: { "--sea-card-bg": "transparent",           "--sea-card-border": "rgba(255,255,255,0.2)",  "--sea-card-blur": "0px" },   previewCss: "background:transparent;border:1px solid rgba(255,255,255,0.25)", requiredLevel: 4 },
    { id: "card-elevated",   name: "Elevated",       description: "Elevated with shadow.",                 icon: "🔺", cssVars: { "--sea-card-bg": "#252836",               "--sea-card-border": "rgba(255,255,255,0.04)", "--sea-card-blur": "0px", "--sea-card-shadow": "0 8px 32px rgba(0,0,0,0.5)" }, previewCss: "background:#252836;box-shadow:0 4px 16px rgba(0,0,0,0.5)", requiredLevel: 6 },
    { id: "card-neon-blue",  name: "Neon Blue",      description: "Electric blue neon glow.",              icon: "💙", cssVars: { "--sea-card-bg": "rgba(30,64,175,0.12)",   "--sea-card-border": "rgba(96,165,250,0.4)",   "--sea-card-blur": "4px", "--sea-card-shadow": "0 0 16px rgba(96,165,250,0.15)" }, previewCss: "background:rgba(30,64,175,0.2);border:1px solid rgba(96,165,250,0.4);box-shadow:0 0 8px rgba(96,165,250,0.3)", requiredLevel: 20 },
    { id: "card-neon-purple",name: "Neon Purple",    description: "Cosmic purple glow.",                   icon: "💜", cssVars: { "--sea-card-bg": "rgba(109,40,217,0.12)",  "--sea-card-border": "rgba(167,139,250,0.4)",  "--sea-card-blur": "4px", "--sea-card-shadow": "0 0 16px rgba(167,139,250,0.15)" }, previewCss: "background:rgba(109,40,217,0.2);border:1px solid rgba(167,139,250,0.4);box-shadow:0 0 8px rgba(167,139,250,0.3)", requiredLevel: 25 },
    { id: "card-neon-green", name: "Neon Green",     description: "Toxic green pulse.",                    icon: "💚", cssVars: { "--sea-card-bg": "rgba(22,163,74,0.1)",    "--sea-card-border": "rgba(74,222,128,0.4)",   "--sea-card-blur": "4px", "--sea-card-shadow": "0 0 16px rgba(74,222,128,0.15)" }, previewCss: "background:rgba(22,163,74,0.15);border:1px solid rgba(74,222,128,0.4);box-shadow:0 0 8px rgba(74,222,128,0.3)", requiredLevel: 20 },
    { id: "card-neon-pink",  name: "Neon Pink",      description: "Hot pink neon.",                        icon: "🩷", cssVars: { "--sea-card-bg": "rgba(219,39,119,0.1)",   "--sea-card-border": "rgba(244,114,182,0.4)",  "--sea-card-blur": "4px", "--sea-card-shadow": "0 0 16px rgba(244,114,182,0.15)" }, previewCss: "background:rgba(219,39,119,0.15);border:1px solid rgba(244,114,182,0.4);box-shadow:0 0 8px rgba(244,114,182,0.3)", requiredLevel: 22 },
    { id: "card-warm",       name: "Warm",           description: "Warm amber-tinted cards.",              icon: "🌅", cssVars: { "--sea-card-bg": "rgba(120,53,15,0.12)",   "--sea-card-border": "rgba(251,191,36,0.2)",   "--sea-card-blur": "2px" }, previewCss: "background:rgba(120,53,15,0.2);border:1px solid rgba(251,191,36,0.2)", requiredLevel: 10 },
    { id: "card-cool",       name: "Cool",           description: "Cool blue-tinted cards.",               icon: "❄️", cssVars: { "--sea-card-bg": "rgba(7,89,133,0.12)",    "--sea-card-border": "rgba(125,211,252,0.2)",  "--sea-card-blur": "2px" }, previewCss: "background:rgba(7,89,133,0.2);border:1px solid rgba(125,211,252,0.2)", requiredLevel: 10 },
    { id: "card-paper",      name: "Paper",          description: "Light paper-like tone.",                icon: "📄", cssVars: { "--sea-card-bg": "rgba(248,250,252,0.04)", "--sea-card-border": "rgba(226,232,240,0.1)",  "--sea-card-blur": "0px" }, previewCss: "background:rgba(248,250,252,0.04);border:1px solid rgba(226,232,240,0.12)", requiredLevel: 5 },
    { id: "card-carbon",     name: "Carbon",         description: "Carbon fiber dark look.",               icon: "⚫", cssVars: { "--sea-card-bg": "#0d1117",               "--sea-card-border": "rgba(255,255,255,0.05)", "--sea-card-blur": "0px" }, previewCss: "background:#0d1117;border:1px solid rgba(255,255,255,0.05)", requiredLevel: 15 },
    { id: "card-crystal",    name: "Crystal",        description: "Ultra-transparent crystal.",            icon: "💎", cssVars: { "--sea-card-bg": "rgba(255,255,255,0.02)", "--sea-card-border": "rgba(255,255,255,0.25)", "--sea-card-blur": "36px" }, previewCss: "background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.3);backdrop-filter:blur(12px)", requiredLevel: 30 },
    { id: "card-gold",       name: "Gold Trim",      description: "Subtle gold border accent.",            icon: "🥇", cssVars: { "--sea-card-bg": "rgba(120,53,15,0.08)",   "--sea-card-border": "rgba(251,191,36,0.35)",  "--sea-card-blur": "0px", "--sea-card-shadow": "0 0 8px rgba(251,191,36,0.08)" }, previewCss: "background:rgba(120,53,15,0.12);border:1px solid rgba(251,191,36,0.4)", requiredLevel: 40 },
]

// ─── 3. Border Radius ─────────────────────────────────────────────────────────

export const RADIUS_PRESETS: UIPreset[] = [
    { id: "radius-none",     name: "Sharp",          description: "No border radius anywhere.",            icon: "📐", cssVars: { "--radius": "0px",    "--radius-sm": "0px",    "--radius-md": "0px",    "--radius-lg": "0px",    "--radius-full": "0px"    }, previewCss: "border-radius:0", requiredLevel: 1 },
    { id: "radius-xs",       name: "Micro",          description: "Barely-there 2px radius.",              icon: "▪️", cssVars: { "--radius": "2px",    "--radius-sm": "1px",    "--radius-md": "3px",    "--radius-lg": "4px",    "--radius-full": "8px"    }, previewCss: "border-radius:2px", requiredLevel: 1 },
    { id: "radius-sm",       name: "Subtle",         description: "Subtle 4px rounding.",                  icon: "🔸", cssVars: { "--radius": "4px",    "--radius-sm": "2px",    "--radius-md": "6px",    "--radius-lg": "8px",    "--radius-full": "20px"   }, previewCss: "border-radius:4px", requiredLevel: 1 },
    { id: "radius-default",  name: "Default",        description: "Standard 8px rounding.",                icon: "▪️", cssVars: { "--radius": "8px",    "--radius-sm": "4px",    "--radius-md": "12px",   "--radius-lg": "16px",   "--radius-full": "9999px" }, previewCss: "border-radius:8px", requiredLevel: 1 },
    { id: "radius-md",       name: "Rounded",        description: "Friendly 12px rounding.",               icon: "🔷", cssVars: { "--radius": "12px",   "--radius-sm": "6px",    "--radius-md": "16px",   "--radius-lg": "20px",   "--radius-full": "9999px" }, previewCss: "border-radius:12px", requiredLevel: 2 },
    { id: "radius-lg",       name: "Full Round",     description: "Large 16px rounding.",                  icon: "🔵", cssVars: { "--radius": "16px",   "--radius-sm": "8px",    "--radius-md": "20px",   "--radius-lg": "24px",   "--radius-full": "9999px" }, previewCss: "border-radius:16px", requiredLevel: 3 },
    { id: "radius-xl",       name: "Bubble",         description: "Big bubbly 24px rounding.",             icon: "🫧", cssVars: { "--radius": "24px",   "--radius-sm": "12px",   "--radius-md": "28px",   "--radius-lg": "32px",   "--radius-full": "9999px" }, previewCss: "border-radius:24px", requiredLevel: 5 },
    { id: "radius-2xl",      name: "Capsule",        description: "Capsule-like 32px rounding.",           icon: "💊", cssVars: { "--radius": "32px",   "--radius-sm": "16px",   "--radius-md": "36px",   "--radius-lg": "40px",   "--radius-full": "9999px" }, previewCss: "border-radius:32px", requiredLevel: 8 },
    { id: "radius-pill",     name: "Pill",           description: "Full pill shape for everything.",       icon: "💉", cssVars: { "--radius": "9999px", "--radius-sm": "9999px", "--radius-md": "9999px", "--radius-lg": "9999px", "--radius-full": "9999px" }, previewCss: "border-radius:9999px", requiredLevel: 12 },
    { id: "radius-mixed",    name: "Mixed",          description: "Small elements sharper, large rounder.", icon: "🎲", cssVars: { "--radius": "6px",    "--radius-sm": "3px",    "--radius-md": "16px",   "--radius-lg": "24px",   "--radius-full": "9999px" }, previewCss: "border-radius:6px", requiredLevel: 10 },
    { id: "radius-squircle", name: "Squircle",       description: "iOS-like squircle feel.",               icon: "📱", cssVars: { "--radius": "20px",   "--radius-sm": "10px",   "--radius-md": "24px",   "--radius-lg": "28px",   "--radius-full": "9999px" }, previewCss: "border-radius:20px", requiredLevel: 15 },
    { id: "radius-sharp-lg", name: "Sharp-Large",    description: "Sharp small, rounded large.",           icon: "🗂️", cssVars: { "--radius": "2px",    "--radius-sm": "1px",    "--radius-md": "12px",   "--radius-lg": "20px",   "--radius-full": "9999px" }, previewCss: "border-radius:2px", requiredLevel: 6 },
]

// ─── 4. Mouse Trail ───────────────────────────────────────────────────────────

export const MOUSE_TRAIL_PRESETS: UIPreset[] = [
    { id: "trail-none",        name: "None",           description: "No cursor trail.",                      icon: "❌", cssVars: { "--sea-trail": "none"      }, previewCss: "background:#111827",                                           requiredLevel: 1  },
    { id: "trail-sparkle",     name: "Sparkles",       description: "Tiny sparkles follow your cursor.",     icon: "✨", cssVars: { "--sea-trail": "sparkle"   }, previewCss: "background:radial-gradient(circle,#fbbf2466,transparent)",     requiredLevel: 3  },
    { id: "trail-dots",        name: "Dots",           description: "Soft fading dots trail.",               icon: "⚪", cssVars: { "--sea-trail": "dots"      }, previewCss: "background:radial-gradient(circle,#ffffff33,transparent)",     requiredLevel: 3  },
    { id: "trail-fire",        name: "Fire",           description: "Flame particles chase the cursor.",     icon: "🔥", cssVars: { "--sea-trail": "fire"      }, previewCss: "background:linear-gradient(135deg,#dc262666,#f9730066)",       requiredLevel: 10 },
    { id: "trail-ice",         name: "Ice",            description: "Icy crystal fragments.",                icon: "❄️", cssVars: { "--sea-trail": "ice"       }, previewCss: "background:linear-gradient(135deg,#bfdbfe66,#7dd3fc66)",       requiredLevel: 10 },
    { id: "trail-stars",       name: "Stars",          description: "Glittering stars left behind.",         icon: "⭐", cssVars: { "--sea-trail": "stars"     }, previewCss: "background:radial-gradient(circle,#fbbf2488,#818cf844)",       requiredLevel: 12 },
    { id: "trail-sakura",      name: "Sakura",         description: "Cherry blossom petals drift down.",     icon: "🌸", cssVars: { "--sea-trail": "sakura"    }, previewCss: "background:linear-gradient(135deg,#f9a8d466,#fce7f366)",       requiredLevel: 8  },
    { id: "trail-lightning",   name: "Lightning",      description: "Electric arcs crackle behind you.",     icon: "⚡", cssVars: { "--sea-trail": "lightning" }, previewCss: "background:linear-gradient(135deg,#fde04766,#60a5fa66)",       requiredLevel: 20 },
    { id: "trail-rainbow",     name: "Rainbow",        description: "A rainbow streak follows the cursor.",  icon: "🌈", cssVars: { "--sea-trail": "rainbow"   }, previewCss: "background:linear-gradient(90deg,#f43f5e,#f97316,#fbbf24,#4ade80,#60a5fa,#a78bfa)", requiredLevel: 25 },
    { id: "trail-bubbles",     name: "Bubbles",        description: "Floating bubbles float up behind.",     icon: "🫧", cssVars: { "--sea-trail": "bubbles"   }, previewCss: "background:radial-gradient(circle,#67e8f966,transparent)",     requiredLevel: 8  },
    { id: "trail-leaves",      name: "Leaves",         description: "Autumn leaves tumble in your wake.",   icon: "🍂", cssVars: { "--sea-trail": "leaves"    }, previewCss: "background:linear-gradient(135deg,#ea580c66,#d9770666)",       requiredLevel: 6  },
    { id: "trail-hearts",      name: "Hearts",         description: "Tiny hearts float upward.",             icon: "💖", cssVars: { "--sea-trail": "hearts"    }, previewCss: "background:radial-gradient(circle,#f47286bb,transparent)",     requiredLevel: 15 },
    { id: "trail-snow",        name: "Snow",           description: "Snowflakes drift as you move.",         icon: "🌨️", cssVars: { "--sea-trail": "snow"      }, previewCss: "background:radial-gradient(circle,#e2e8f088,transparent)",     requiredLevel: 8  },
    { id: "trail-galaxy",      name: "Galaxy",         description: "Cosmic stardust spirals behind.",       icon: "🌌", cssVars: { "--sea-trail": "galaxy"    }, previewCss: "background:radial-gradient(circle,#818cf877,#c084fc55)",       requiredLevel: 30 },
    { id: "trail-magic",       name: "Magic",          description: "Glowing magical orbs follow you.",      icon: "🔮", cssVars: { "--sea-trail": "magic"     }, previewCss: "background:radial-gradient(circle,#a855f777,#e879f944)",       requiredLevel: 20 },
    { id: "trail-neon-line",   name: "Neon Line",      description: "A glowing neon streak traces your path.",icon: "💡", cssVars: { "--sea-trail": "neon"     }, previewCss: "background:linear-gradient(90deg,#a855f7,#06b6d4)",            requiredLevel: 18 },
    { id: "trail-confetti",    name: "Confetti",       description: "Celebration confetti rains down.",      icon: "🎊", cssVars: { "--sea-trail": "confetti" }, previewCss: "background:linear-gradient(135deg,#f43f5e44,#fbbf2444,#4ade8044)", requiredLevel: 12 },
    { id: "trail-smoke",       name: "Smoke",          description: "Wispy smoke trails behind the cursor.", icon: "🌫️", cssVars: { "--sea-trail": "smoke"     }, previewCss: "background:radial-gradient(circle,#94a3b855,transparent)",     requiredLevel: 15 },
    { id: "trail-void",        name: "Void",           description: "Dark void particles swirl around you.", icon: "🌑", cssVars: { "--sea-trail": "void"      }, previewCss: "background:radial-gradient(circle,#7c3aed55,#000)",            requiredLevel: 35 },
    { id: "trail-gold-dust",   name: "Gold Dust",      description: "Shimmering gold dust sparkles.",        icon: "✨", cssVars: { "--sea-trail": "gold"      }, previewCss: "background:radial-gradient(circle,#fbbf24aa,#f59e0b44)",       requiredLevel: 40 },
]

// ─── 5. Hover Effects ─────────────────────────────────────────────────────────

export const HOVER_EFFECT_PRESETS: UIPreset[] = [
    { id: "hover-none",        name: "None",           description: "No hover effects.",                     icon: "⬜", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "0px",  "--sea-hover-glow": "none",                                         "--sea-hover-dur": "150ms" }, previewCss: "background:#1e1e2e",                                                                               requiredLevel: 1  },
    { id: "hover-lift",        name: "Lift",           description: "Cards float up slightly on hover.",     icon: "⬆️", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "-4px", "--sea-hover-glow": "none",                                         "--sea-hover-dur": "200ms" }, previewCss: "background:#1e1e2e;transform:translateY(-3px)",                                                    requiredLevel: 1  },
    { id: "hover-lift-big",    name: "Big Lift",       description: "Cards float up noticeably.",            icon: "🚀", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "-8px", "--sea-hover-glow": "none",                                         "--sea-hover-dur": "200ms" }, previewCss: "background:#252836;transform:translateY(-6px)",                                                    requiredLevel: 3  },
    { id: "hover-scale",       name: "Scale",          description: "Cards grow slightly on hover.",         icon: "🔍", cssVars: { "--sea-hover-scale": "1.03",   "--sea-hover-lift": "0px",  "--sea-hover-glow": "none",                                         "--sea-hover-dur": "150ms" }, previewCss: "background:#1e1e2e;transform:scale(1.04)",                                                         requiredLevel: 2  },
    { id: "hover-scale-big",   name: "Big Scale",      description: "Cards grow a lot on hover.",            icon: "🔎", cssVars: { "--sea-hover-scale": "1.06",   "--sea-hover-lift": "0px",  "--sea-hover-glow": "none",                                         "--sea-hover-dur": "200ms" }, previewCss: "background:#252836;transform:scale(1.07)",                                                         requiredLevel: 3  },
    { id: "hover-glow-brand",  name: "Brand Glow",     description: "Brand-colored glow on hover.",          icon: "✨", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "0px",  "--sea-hover-glow": "0 0 16px rgba(139,92,246,0.4)",               "--sea-hover-dur": "200ms" }, previewCss: "background:#1e1e2e;box-shadow:0 0 12px rgba(139,92,246,0.5)",                                      requiredLevel: 5  },
    { id: "hover-glow-white",  name: "White Glow",     description: "Soft white aura on hover.",             icon: "⬜", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "0px",  "--sea-hover-glow": "0 0 20px rgba(255,255,255,0.12)",             "--sea-hover-dur": "200ms" }, previewCss: "background:#1e1e2e;box-shadow:0 0 16px rgba(255,255,255,0.2)",                                     requiredLevel: 5  },
    { id: "hover-glow-gold",   name: "Gold Glow",      description: "Shimmering gold glow on hover.",        icon: "✨", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "-2px", "--sea-hover-glow": "0 0 20px rgba(251,191,36,0.35)",             "--sea-hover-dur": "200ms" }, previewCss: "background:#1c1208;box-shadow:0 0 16px rgba(251,191,36,0.45)",                                     requiredLevel: 15 },
    { id: "hover-glow-neon",   name: "Neon Glow",      description: "Electric neon edge on hover.",          icon: "💡", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "0px",  "--sea-hover-glow": "0 0 8px #a855f7,0 0 24px rgba(168,85,247,0.3)","--sea-hover-dur": "150ms" }, previewCss: "background:#0d001a;box-shadow:0 0 8px #a855f7,0 0 20px rgba(168,85,247,0.4)",                    requiredLevel: 20 },
    { id: "hover-lift-glow",   name: "Lift + Glow",    description: "Lifts and glows simultaneously.",       icon: "🌟", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "-4px", "--sea-hover-glow": "0 0 20px rgba(139,92,246,0.3)",               "--sea-hover-dur": "200ms" }, previewCss: "background:#1e1e2e;transform:translateY(-3px);box-shadow:0 0 14px rgba(139,92,246,0.4)",           requiredLevel: 8  },
    { id: "hover-scale-glow",  name: "Scale + Glow",   description: "Grows and glows on hover.",             icon: "💫", cssVars: { "--sea-hover-scale": "1.03",   "--sea-hover-lift": "0px",  "--sea-hover-glow": "0 0 16px rgba(139,92,246,0.35)",             "--sea-hover-dur": "200ms" }, previewCss: "background:#1e1e2e;transform:scale(1.04);box-shadow:0 0 12px rgba(139,92,246,0.4)",               requiredLevel: 10 },
    { id: "hover-press",       name: "Press",          description: "Cards press down like buttons.",        icon: "👇", cssVars: { "--sea-hover-scale": "0.98",   "--sea-hover-lift": "2px",  "--sea-hover-glow": "none",                                         "--sea-hover-dur": "100ms" }, previewCss: "background:#1e1e2e;transform:scale(0.97) translateY(2px)",                                        requiredLevel: 3  },
    { id: "hover-tilt",        name: "Tilt",           description: "Slight 3D tilt perspective.",           icon: "↗️", cssVars: { "--sea-hover-scale": "1.02",   "--sea-hover-lift": "-3px", "--sea-hover-glow": "0 8px 24px rgba(0,0,0,0.4)",                   "--sea-hover-dur": "200ms" }, previewCss: "background:#1e1e2e;transform:perspective(500px) rotateY(3deg) translateY(-2px)",                   requiredLevel: 12 },
    { id: "hover-border-glow", name: "Border Light",   description: "Border brightens on hover.",            icon: "🔲", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "0px",  "--sea-hover-glow": "none", "--sea-hover-border-opacity": "0.5","--sea-hover-dur": "150ms" }, previewCss: "background:#1e1e2e;border:1px solid rgba(255,255,255,0.4)",                                        requiredLevel: 5  },
    { id: "hover-float",       name: "Float",          description: "Cards continuously float while hovered.",icon:"🎈", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "-6px", "--sea-hover-glow": "0 12px 28px rgba(0,0,0,0.5)",                  "--sea-hover-dur": "300ms" }, previewCss: "background:#252836;transform:translateY(-5px);box-shadow:0 12px 24px rgba(0,0,0,0.5)",            requiredLevel: 18 },
    { id: "hover-snap",        name: "Snap",           description: "Instant sharp snap response.",          icon: "⚡", cssVars: { "--sea-hover-scale": "1.02",   "--sea-hover-lift": "-2px", "--sea-hover-glow": "none",                                         "--sea-hover-dur": "50ms"  }, previewCss: "background:#1e1e2e;transform:scale(1.03) translateY(-2px)",                                        requiredLevel: 2  },
    { id: "hover-illuminate",  name: "Illuminate",     description: "Top-light appears on hover.",           icon: "🔆", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "0px",  "--sea-hover-glow": "0 -4px 16px rgba(255,255,255,0.08)",           "--sea-hover-dur": "200ms" }, previewCss: "background:linear-gradient(180deg,rgba(255,255,255,0.08) 0%,#1e1e2e 40%)",                        requiredLevel: 8  },
    { id: "hover-shadow-deep", name: "Deep Shadow",    description: "Deep drop shadow appears on hover.",    icon: "🌑", cssVars: { "--sea-hover-scale": "1",      "--sea-hover-lift": "-3px", "--sea-hover-glow": "0 20px 40px rgba(0,0,0,0.7)",                  "--sea-hover-dur": "200ms" }, previewCss: "background:#1e1e2e;box-shadow:0 16px 36px rgba(0,0,0,0.7)",                                       requiredLevel: 6  },
    { id: "hover-rainbow-glow",name: "Rainbow Glow",   description: "Rainbow shimmer glow on hover.",        icon: "🌈", cssVars: { "--sea-hover-scale": "1.01",   "--sea-hover-lift": "-2px", "--sea-hover-glow": "0 0 20px rgba(244,63,94,0.3),0 0 40px rgba(96,165,250,0.2)","--sea-hover-dur": "200ms" }, previewCss: "background:#1e1e2e;box-shadow:0 0 16px rgba(244,63,94,0.4),0 0 32px rgba(96,165,250,0.3)",    requiredLevel: 30 },
]


// ─── 6. Visual Effects ────────────────────────────────────────────────────────

export const EFFECTS_PRESETS: UIPreset[] = [
    { id: "fx-none",         name: "None",           description: "No extra effects.",                     icon: "⬜", cssVars: { "--sea-vignette": "0",    "--sea-grain": "0",    "--sea-glow": "0",    "--sea-shadow-boost": "0" }, previewCss: "background:#111", requiredLevel: 1 },
    { id: "fx-subtle-glow",  name: "Subtle Glow",    description: "Soft glow on interactive elements.",    icon: "✨", cssVars: { "--sea-glow": "0.3",  "--sea-vignette": "0", "--sea-grain": "0"    }, previewCss: "background:radial-gradient(circle,#6366f133,transparent)", requiredLevel: 1 },
    { id: "fx-strong-glow",  name: "Strong Glow",    description: "Intense glow on interactive elements.", icon: "💫", cssVars: { "--sea-glow": "0.7",  "--sea-vignette": "0", "--sea-grain": "0"    }, previewCss: "background:radial-gradient(circle,#6366f166,transparent)", requiredLevel: 1 },
    { id: "fx-vignette",     name: "Vignette",       description: "Dark edges frame the screen.",          icon: "🔲", cssVars: { "--sea-vignette": "1",  "--sea-grain": "0",   "--sea-glow": "0"     }, previewCss: "background:radial-gradient(circle,#333,#000)", requiredLevel: 1 },
    { id: "fx-grain",        name: "Film Grain",     description: "Subtle film grain texture.",            icon: "📽️", cssVars: { "--sea-grain": "0.4",  "--sea-vignette": "0", "--sea-glow": "0"     }, previewCss: "background:#1a1a1a", requiredLevel: 1 },
    { id: "fx-cinematic",    name: "Cinematic",      description: "Vignette + grain for film feel.",       icon: "🎬", cssVars: { "--sea-vignette": "1",  "--sea-grain": "0.5", "--sea-glow": "0"     }, previewCss: "background:radial-gradient(circle,#222,#000)", requiredLevel: 1 },
    { id: "fx-glow-vignette",name: "Glow+Vignette",  description: "Center glow with dark edges.",          icon: "🌟", cssVars: { "--sea-vignette": "0.8","--sea-grain": "0",   "--sea-glow": "0.5"   }, previewCss: "background:radial-gradient(circle,#6366f144,#000)", requiredLevel: 1 },
    // ── Creative wallpaper effect presets ─────────────────────────────────────
    { id: "fx-dreamy",       name: "Dreamy",         description: "Soft blur and light glow for a dreamy hazy look.",        icon: "☁️",  cssVars: { "--sea-glow": "0.6",  "--sea-vignette": "0.3", "--sea-grain": "0",   "--sea-blur-edge": "1",  "--sea-shadow-boost": "0" }, previewCss: "background:radial-gradient(ellipse,#a78bfa44 0%,#6366f122 50%,#000 100%);filter:blur(1px)", requiredLevel: 1  },
    { id: "fx-retro-tv",     name: "Retro TV",       description: "Scanlines and vignette for a vintage CRT television feel.", icon: "📺", cssVars: { "--sea-scanlines": "1", "--sea-vignette": "0.9", "--sea-grain": "0.3", "--sea-blur-edge": "0",  "--sea-shadow-boost": "0" }, previewCss: "background:repeating-linear-gradient(transparent,transparent 2px,rgba(0,0,0,0.28) 2px,rgba(0,0,0,0.28) 4px),radial-gradient(ellipse,#222 40%,#000 100%)", requiredLevel: 1  },
    { id: "fx-deep-sea",     name: "Deep Sea",       description: "Cool blue tint with vignette and rising bubble overlay.",  icon: "🌊", cssVars: { "--sea-vignette": "0.8", "--sea-grain": "0",   "--sea-glow": "0",    "--sea-deep-sea": "1",   "--sea-shadow-boost": "0" }, previewCss: "background:radial-gradient(ellipse,#0c4a6e88 0%,#0369a155 40%,#000 100%)", requiredLevel: 1  },
    { id: "fx-neon-haze",    name: "Neon Haze",      description: "Purple neon glow with grain for a synthwave haze.",        icon: "💜", cssVars: { "--sea-glow": "0.8",  "--sea-vignette": "0.5", "--sea-grain": "0.35","--sea-blur-edge": "0",  "--sea-shadow-boost": "1" }, previewCss: "background:radial-gradient(ellipse,#7c3aed66 0%,#4c1d9544 50%,#000 100%)", requiredLevel: 1  },
    { id: "fx-ink-wash",     name: "Ink Wash",       description: "Desaturated image with subtle film grain for a monochrome ink art feel.", icon: "🖌️", cssVars: { "--sea-vignette": "0.6", "--sea-grain": "0.5", "--sea-glow": "0",  "--sea-ink-wash": "1",   "--sea-shadow-boost": "0" }, previewCss: "background:linear-gradient(135deg,#1c1c1c,#2d2d2d 50%,#111);filter:saturate(0.1)", requiredLevel: 1  },
    { id: "fx-hologram",     name: "Hologram",       description: "Scanlines with a cyan-green glow — a holographic projection.", icon: "🔵", cssVars: { "--sea-scanlines": "1", "--sea-glow": "0.7",   "--sea-vignette": "0.4", "--sea-grain": "0",  "--sea-shadow-boost": "1" }, previewCss: "background:repeating-linear-gradient(transparent,transparent 2px,rgba(0,255,200,0.06) 2px,rgba(0,255,200,0.06) 4px),radial-gradient(ellipse,#06b6d466 0%,#000 100%)", requiredLevel: 1  },
    { id: "fx-smoke",        name: "Smoke",          description: "Grain texture plus blurred edges for a smoky atmospheric look.", icon: "🌫️", cssVars: { "--sea-grain": "0.5",  "--sea-blur-edge": "1", "--sea-vignette": "0.4", "--sea-glow": "0", "--sea-shadow-boost": "0" }, previewCss: "background:radial-gradient(circle,#374151 20%,#111 80%)", requiredLevel: 1  },
    { id: "fx-prism",        name: "Prism",          description: "Hue-rotation filter shifts the wallpaper's colors through the spectrum.", icon: "🔮", cssVars: { "--sea-hue-rotate": "90deg", "--sea-vignette": "0.2", "--sea-grain": "0", "--sea-glow": "0.2", "--sea-shadow-boost": "0" }, previewCss: "background:linear-gradient(135deg,#f43f5e55,#fb923c55,#fbbf2455,#4ade8055,#60a5fa55,#a78bfa55)", requiredLevel: 1  },
]

// ─── 7. Layout Density ────────────────────────────────────────────────────────

export const LAYOUT_PRESETS: UIPreset[] = [
    { id: "layout-default",  name: "Default",        description: "Standard spacing.",                     icon: "▪️", cssVars: { "--sea-spacing": "1",    "--sea-density": "normal"  }, previewCss: "padding:12px;gap:8px", requiredLevel: 1 },
    { id: "layout-compact",  name: "Compact",        description: "Tighter spacing, more content.",        icon: "🗜️", cssVars: { "--sea-spacing": "0.75", "--sea-density": "compact" }, previewCss: "padding:8px;gap:4px",  requiredLevel: 2 },
    { id: "layout-cozy",     name: "Cozy",           description: "Slightly less tight.",                  icon: "😊", cssVars: { "--sea-spacing": "0.85", "--sea-density": "compact" }, previewCss: "padding:10px;gap:6px", requiredLevel: 2 },
    { id: "layout-comfortable", name: "Comfortable", description: "More breathing room.",                  icon: "🛋️", cssVars: { "--sea-spacing": "1.15", "--sea-density": "normal"  }, previewCss: "padding:16px;gap:10px",requiredLevel: 3 },
    { id: "layout-spacious", name: "Spacious",       description: "Generous spacing.",                     icon: "🌅", cssVars: { "--sea-spacing": "1.3",  "--sea-density": "loose"   }, previewCss: "padding:20px;gap:12px",requiredLevel: 5 },
    { id: "layout-airy",     name: "Airy",           description: "Maximum breathing room.",               icon: "🌬️", cssVars: { "--sea-spacing": "1.5",  "--sea-density": "loose"   }, previewCss: "padding:24px;gap:16px",requiredLevel: 8 },
    { id: "layout-dense",    name: "Ultra Compact",  description: "Maximum information density.",          icon: "📦", cssVars: { "--sea-spacing": "0.6",  "--sea-density": "ultra"   }, previewCss: "padding:4px;gap:2px",  requiredLevel: 5 },
    { id: "layout-magazine", name: "Magazine",       description: "Editorial-style wide spacing.",         icon: "📰", cssVars: { "--sea-spacing": "1.2",  "--sea-density": "loose"   }, previewCss: "padding:18px;gap:14px",requiredLevel: 10 },
]

// ─── 8. Sidebar Style ─────────────────────────────────────────────────────────

export const SIDEBAR_PRESETS: UIPreset[] = [
    { id: "sidebar-default",     name: "Default",      description: "Standard sidebar.",                   icon: "📋", cssVars: { "--sea-sidebar-width": "56px", "--sea-sidebar-opacity": "0.95", "--sea-sidebar-blur": "8px" }, previewCss: "background:rgba(30,30,46,0.9)", requiredLevel: 1 },
    { id: "sidebar-glass",       name: "Glass",        description: "Frosted glass sidebar.",              icon: "🔷", cssVars: { "--sea-sidebar-width": "56px", "--sea-sidebar-opacity": "0.6",  "--sea-sidebar-blur": "20px" }, previewCss: "background:rgba(255,255,255,0.08);backdrop-filter:blur(16px)", requiredLevel: 5 },
    { id: "sidebar-solid",       name: "Solid",        description: "Opaque solid sidebar.",               icon: "⬛", cssVars: { "--sea-sidebar-width": "56px", "--sea-sidebar-opacity": "1",    "--sea-sidebar-blur": "0px" }, previewCss: "background:#0d1117", requiredLevel: 3 },
    { id: "sidebar-transparent", name: "Transparent",  description: "Nearly invisible sidebar.",           icon: "👻", cssVars: { "--sea-sidebar-width": "56px", "--sea-sidebar-opacity": "0.3",  "--sea-sidebar-blur": "0px" }, previewCss: "background:rgba(255,255,255,0.03)", requiredLevel: 10 },
    { id: "sidebar-floating",    name: "Floating",     description: "Elevated with shadow.",               icon: "🛸", cssVars: { "--sea-sidebar-width": "56px", "--sea-sidebar-opacity": "0.98", "--sea-sidebar-blur": "4px", "--sea-sidebar-shadow": "4px 0 24px rgba(0,0,0,0.6)" }, previewCss: "background:#1e1e2e;box-shadow:4px 0 16px rgba(0,0,0,0.5)", requiredLevel: 8 },
    { id: "sidebar-minimal",     name: "Minimal",      description: "Ultra-slim minimal sidebar.",         icon: "▪️", cssVars: { "--sea-sidebar-width": "48px", "--sea-sidebar-opacity": "0.8",  "--sea-sidebar-blur": "0px" }, previewCss: "background:#111;width:48px", requiredLevel: 5 },
    { id: "sidebar-neon",        name: "Neon Edge",    description: "Neon glowing right border.",          icon: "💡", cssVars: { "--sea-sidebar-width": "56px", "--sea-sidebar-opacity": "0.95", "--sea-sidebar-blur": "0px", "--sea-sidebar-border": "1px solid rgba(139,92,246,0.6)", "--sea-sidebar-glow": "2px 0 16px rgba(139,92,246,0.3)" }, previewCss: "background:#0d0d1a;border-right:2px solid rgba(139,92,246,0.6)", requiredLevel: 20 },
    { id: "sidebar-colorful",    name: "Colorful",     description: "Brand-colored sidebar.",              icon: "🎨", cssVars: { "--sea-sidebar-width": "56px", "--sea-sidebar-opacity": "0.98", "--sea-sidebar-blur": "0px", "--sea-sidebar-bg": "linear-gradient(180deg,rgba(79,70,229,0.2),rgba(139,92,246,0.15))" }, previewCss: "background:linear-gradient(180deg,rgba(79,70,229,0.3),rgba(139,92,246,0.2))", requiredLevel: 15 },
    { id: "sidebar-dark",        name: "Ultra Dark",   description: "Pitch black sidebar.",                icon: "🌑", cssVars: { "--sea-sidebar-width": "56px", "--sea-sidebar-opacity": "1",    "--sea-sidebar-blur": "0px", "--sea-sidebar-bg": "#050505" }, previewCss: "background:#050505", requiredLevel: 12 },
    { id: "sidebar-light",       name: "Light",        description: "Light-tinted sidebar.",               icon: "🌕", cssVars: { "--sea-sidebar-width": "56px", "--sea-sidebar-opacity": "0.9",  "--sea-sidebar-blur": "4px", "--sea-sidebar-bg": "rgba(255,255,255,0.05)" }, previewCss: "background:rgba(255,255,255,0.08)", requiredLevel: 5 },
]

// ─── 9. Page Transitions ─────────────────────────────────────────────────────

export const PAGE_TRANSITION_PRESETS: UIPreset[] = [
    { id: "pt-fade",         name: "Fade",           description: "Classic fade in.",                      icon: "🌅", cssVars: { "--sea-page-transition": "sea-page-fade"        }, previewCss: "background:#6366f1;opacity:0.5", requiredLevel: 1 },
    { id: "pt-slide-up",     name: "Slide Up",       description: "Content slides up.",                    icon: "⬆️", cssVars: { "--sea-page-transition": "sea-page-slide-up"    }, previewCss: "background:#8b5cf6;transform:translateY(8px)", requiredLevel: 1 },
    { id: "pt-scale",        name: "Scale",          description: "Scales in from center.",                icon: "🔍", cssVars: { "--sea-page-transition": "sea-page-scale"       }, previewCss: "background:#7c3aed;transform:scale(0.97)", requiredLevel: 2 },
    { id: "pt-slide-right",  name: "Slide Right",    description: "Slides in from left.",                  icon: "➡️", cssVars: { "--sea-page-transition": "sea-page-slide-right" }, previewCss: "background:#6d28d9;transform:translateX(-8px)", requiredLevel: 2 },
    { id: "pt-none",         name: "None",           description: "Instant page change.",                  icon: "⚡", cssVars: { "--sea-page-transition": ""                    }, previewCss: "background:#374151", requiredLevel: 1 },
]

// ─── 10. Scrollbar Style ─────────────────────────────────────────────────────

export const SCROLLBAR_PRESETS: UIPreset[] = [
    { id: "scroll-default",  name: "Default",        description: "System default scrollbar.",             icon: "▪️", cssVars: { "--sea-scrollbar-width": "auto",   "--sea-scrollbar-color": "auto" }, previewCss: "background:#4b5563", requiredLevel: 1 },
    { id: "scroll-thin",     name: "Thin",           description: "Slim 4px scrollbar.",                   icon: "📏", cssVars: { "--sea-scrollbar-width": "4px",    "--sea-scrollbar-color": "#4b5563 transparent" }, previewCss: "background:#4b5563;width:4px", requiredLevel: 1 },
    { id: "scroll-hidden",   name: "Hidden",         description: "Invisible scrollbar.",                  icon: "👁️", cssVars: { "--sea-scrollbar-width": "0px",    "--sea-scrollbar-color": "transparent transparent" }, previewCss: "background:transparent;width:0", requiredLevel: 3 },
    { id: "scroll-wide",     name: "Wide",           description: "Chunky 10px scrollbar.",                icon: "🟥", cssVars: { "--sea-scrollbar-width": "10px",   "--sea-scrollbar-color": "#374151 #1f2937" }, previewCss: "background:#374151;width:10px", requiredLevel: 2 },
    { id: "scroll-brand",    name: "Brand Color",    description: "Scrollbar in your accent color.",       icon: "🎨", cssVars: { "--sea-scrollbar-width": "6px",    "--sea-scrollbar-color": "var(--sea-accent,#8b5cf6) transparent" }, previewCss: "background:#8b5cf6;width:6px", requiredLevel: 5 },
    { id: "scroll-gold",     name: "Gold",           description: "Shining gold scrollbar.",               icon: "✨", cssVars: { "--sea-scrollbar-width": "6px",    "--sea-scrollbar-color": "#fbbf24 #78350f" }, previewCss: "background:#fbbf24;width:6px", requiredLevel: 15 },
    { id: "scroll-neon",     name: "Neon",           description: "Neon-glowing scrollbar.",               icon: "💡", cssVars: { "--sea-scrollbar-width": "5px",    "--sea-scrollbar-color": "#a855f7 transparent" }, previewCss: "background:#a855f7;width:5px;box-shadow:0 0 6px #a855f7", requiredLevel: 20 },
    { id: "scroll-gradient", name: "Gradient",       description: "Gradient-colored scrollbar.",           icon: "🌈", cssVars: { "--sea-scrollbar-width": "6px",    "--sea-scrollbar-color": "#f43f5e transparent" }, previewCss: "background:linear-gradient(#f43f5e,#8b5cf6);width:6px", requiredLevel: 10 },
    { id: "scroll-white",    name: "White",          description: "Clean white scrollbar.",                icon: "⬜", cssVars: { "--sea-scrollbar-width": "5px",    "--sea-scrollbar-color": "rgba(255,255,255,0.3) transparent" }, previewCss: "background:rgba(255,255,255,0.3);width:5px", requiredLevel: 5 },
    { id: "scroll-minimal",  name: "Minimal",        description: "Ultra-thin barely visible.",            icon: "⬜", cssVars: { "--sea-scrollbar-width": "2px",    "--sea-scrollbar-color": "rgba(255,255,255,0.15) transparent" }, previewCss: "background:rgba(255,255,255,0.15);width:2px", requiredLevel: 3 },
]

// ─── 11. Typography ──────────────────────────────────────────────────────────
// System font stacks only — nothing to download, so every choice works offline.

export const TYPOGRAPHY_PRESETS: UIPreset[] = [
    { id: "type-default",   name: "Default",      description: "The theme's own font.",                     icon: "🔤", cssVars: { "--sea-font-scale": "1" },                                                                                  previewCss: "background:#1f2937", requiredLevel: 1 },
    { id: "type-system",    name: "System UI",    description: "Your operating system's interface font.",  icon: "🖥️", cssVars: { "--sea-font-family": "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", "--sea-font-scale": "1" },    previewCss: "background:#374151", requiredLevel: 1 },
    { id: "type-humanist",  name: "Humanist",     description: "Warm, readable sans-serif.",               icon: "📖", cssVars: { "--sea-font-family": "'Segoe UI',Candara,'Trebuchet MS',sans-serif", "--sea-font-scale": "1" },            previewCss: "background:#4b5563", requiredLevel: 3 },
    { id: "type-serif",     name: "Serif",        description: "Bookish serif text.",                      icon: "📜", cssVars: { "--sea-font-family": "Georgia,'Times New Roman',serif", "--sea-font-scale": "1" },                        previewCss: "background:#78350f", requiredLevel: 5 },
    { id: "type-mono",      name: "Monospace",    description: "Terminal-style monospace.",                icon: "⌨️", cssVars: { "--sea-font-family": "'Cascadia Code',Consolas,'Courier New',monospace", "--sea-font-scale": "0.95" },      previewCss: "background:#064e3b", requiredLevel: 8 },
    { id: "type-rounded",   name: "Rounded",      description: "Soft rounded letterforms where available.", icon: "🫧", cssVars: { "--sea-font-family": "'Nunito','Varela Round','Segoe UI Rounded',ui-rounded,sans-serif", "--sea-font-scale": "1" }, previewCss: "background:#312e81", requiredLevel: 10 },
    { id: "type-small",     name: "Small Text",   description: "Everything a touch smaller.",              icon: "🔡", cssVars: { "--sea-font-scale": "0.92" },                                                                               previewCss: "background:#1e3a8a", requiredLevel: 2 },
    { id: "type-large",     name: "Large Text",   description: "Everything a touch larger.",               icon: "🔠", cssVars: { "--sea-font-scale": "1.08" },                                                                               previewCss: "background:#1e40af", requiredLevel: 2 },
    { id: "type-wide",      name: "Wide Headings", description: "Spaced-out headings.",                    icon: "↔️", cssVars: { "--sea-font-scale": "1", "--sea-heading-tracking": "0.06em" },                                            previewCss: "background:#581c87", requiredLevel: 6 },
    { id: "type-tight",     name: "Tight Headings", description: "Condensed, punchy headings.",            icon: "↕️", cssVars: { "--sea-font-scale": "1", "--sea-heading-tracking": "-0.03em" },                                           previewCss: "background:#701a75", requiredLevel: 6 },
]

// ─── 12. Accent Effects ──────────────────────────────────────────────────────
// Effects layered on the accent color you already chose in Settings → UI (not a color picker).

export const ACCENT_PRESETS: UIPreset[] = [
    { id: "accent-none",      name: "None",          description: "Plain accent buttons.",                    icon: "⬜", cssVars: {},                                   previewCss: "background:rgb(97 82 223)", requiredLevel: 1 },
    { id: "accent-glow",      name: "Glow",          description: "Accent buttons cast a soft glow.",         icon: "✨", cssVars: { "--sea-accent-glow": "14px" },      previewCss: "background:rgb(97 82 223);box-shadow:0 0 12px rgb(97 82 223)", requiredLevel: 3 },
    { id: "accent-glow-big",  name: "Radiant",       description: "A strong accent halo.",                    icon: "🌟", cssVars: { "--sea-accent-glow": "28px" },      previewCss: "background:rgb(97 82 223);box-shadow:0 0 22px rgb(97 82 223)", requiredLevel: 10 },
    { id: "accent-gradient",  name: "Flowing",       description: "Accent buttons shimmer with a moving gradient.", icon: "🌊", cssVars: {},                         previewCss: "background:linear-gradient(90deg,rgb(97 82 223),#ec4899,rgb(97 82 223))", requiredLevel: 15 },
    { id: "accent-outline",   name: "Outlined",      description: "Accent buttons get a bright rim.",         icon: "🔲", cssVars: {},                                   previewCss: "background:transparent;border:2px solid rgb(97 82 223)", requiredLevel: 5 },
    { id: "accent-pulse",     name: "Heartbeat",     description: "Accent buttons gently pulse.",             icon: "💓", cssVars: {},                                   previewCss: "background:rgb(97 82 223)", requiredLevel: 20 },
]

// ─── 13. Top Bar ─────────────────────────────────────────────────────────────

export const NAVBAR_PRESETS: UIPreset[] = [
    { id: "navbar-default",   name: "Default",       description: "The standard top bar.",                    icon: "▭",  cssVars: {}, previewCss: "background:#111827", requiredLevel: 1 },
    { id: "navbar-glass",     name: "Glass",         description: "Frosted glass top bar.",                   icon: "🔷", cssVars: {}, previewCss: "background:rgba(255,255,255,0.08);backdrop-filter:blur(10px)", requiredLevel: 3 },
    { id: "navbar-solid",     name: "Solid",         description: "Opaque top bar.",                          icon: "⬛", cssVars: {}, previewCss: "background:#0b0f19", requiredLevel: 2 },
    { id: "navbar-pill",      name: "Floating Pill", description: "A rounded floating bar.",                  icon: "💊", cssVars: {}, previewCss: "background:#1f2937;border-radius:9999px", requiredLevel: 8 },
    { id: "navbar-minimal",   name: "Minimal",       description: "No background, just the controls.",        icon: "▫️", cssVars: {}, previewCss: "background:transparent;border:1px dashed #374151", requiredLevel: 5 },
    { id: "navbar-accent",    name: "Accent Line",   description: "An accent-colored underline.",             icon: "➖", cssVars: {}, previewCss: "background:#111827;border-bottom:2px solid rgb(97 82 223)", requiredLevel: 6 },
]

// ─── 14. Progress & Sliders ──────────────────────────────────────────────────

export const SLIDER_PRESETS: UIPreset[] = [
    { id: "slider-default",   name: "Default",       description: "Standard bars and sliders.",               icon: "▬", cssVars: {}, previewCss: "background:linear-gradient(90deg,rgb(97 82 223) 60%,#374151 60%)", requiredLevel: 1 },
    { id: "slider-thick",     name: "Chunky",        description: "Thicker progress bars.",                   icon: "▰", cssVars: {}, previewCss: "background:linear-gradient(90deg,rgb(97 82 223) 60%,#374151 60%);height:12px", requiredLevel: 2 },
    { id: "slider-gradient",  name: "Gradient",      description: "Progress fills with an accent gradient.",  icon: "🌈", cssVars: {}, previewCss: "background:linear-gradient(90deg,#6366f1,#ec4899)", requiredLevel: 5 },
    { id: "slider-striped",   name: "Striped",       description: "Animated candy stripes.",                  icon: "🍬", cssVars: {}, previewCss: "background:repeating-linear-gradient(45deg,rgb(97 82 223) 0 8px,rgb(130 115 240) 8px 16px)", requiredLevel: 8 },
    { id: "slider-glow",      name: "Glowing",       description: "Progress bars glow.",                      icon: "💡", cssVars: {}, previewCss: "background:rgb(97 82 223);box-shadow:0 0 10px rgb(97 82 223)", requiredLevel: 12 },
    { id: "slider-flat",      name: "Flat",          description: "Square-cornered, minimal bars.",           icon: "▭", cssVars: {}, previewCss: "background:linear-gradient(90deg,#e5e7eb 60%,#374151 60%);border-radius:0", requiredLevel: 3 },
]

// ─── 15. Toasts ──────────────────────────────────────────────────────────────

export const TOAST_PRESETS: UIPreset[] = [
    { id: "toast-default",    name: "Default",       description: "Standard notifications.",                  icon: "🔔", cssVars: {}, previewCss: "background:#1f2937", requiredLevel: 1 },
    { id: "toast-glass",      name: "Glass",         description: "Frosted glass notifications.",             icon: "🔷", cssVars: {}, previewCss: "background:rgba(255,255,255,0.08);backdrop-filter:blur(10px)", requiredLevel: 3 },
    { id: "toast-accent",     name: "Accent Edge",   description: "An accent stripe on the left.",            icon: "▌", cssVars: {}, previewCss: "background:#1f2937;border-left:4px solid rgb(97 82 223)", requiredLevel: 5 },
    { id: "toast-pill",       name: "Pill",          description: "Rounded pill notifications.",              icon: "💊", cssVars: {}, previewCss: "background:#1f2937;border-radius:9999px", requiredLevel: 8 },
    { id: "toast-minimal",    name: "Minimal",       description: "Borderless, compact notifications.",       icon: "▫️", cssVars: {}, previewCss: "background:#111827", requiredLevel: 4 },
    { id: "toast-neon",       name: "Neon",          description: "Glowing neon notifications.",              icon: "💡", cssVars: {}, previewCss: "background:#0d001a;box-shadow:0 0 10px #a855f7", requiredLevel: 15 },
]

// ─── 16. Selection & Focus ───────────────────────────────────────────────────

export const SELECTION_PRESETS: UIPreset[] = [
    { id: "select-default",   name: "Default",       description: "Browser default highlight.",               icon: "🖍️", cssVars: {}, previewCss: "background:#2563eb", requiredLevel: 1 },
    { id: "select-accent",    name: "Accent",        description: "Highlight in your accent color.",          icon: "🎨", cssVars: { "--sea-selection-bg": "rgb(var(--color-brand-500) / 0.45)", "--sea-focus-ring": "2px solid rgb(var(--color-brand-400))" }, previewCss: "background:rgb(97 82 223)", requiredLevel: 2 },
    { id: "select-gold",      name: "Gold",          description: "Golden highlight and focus ring.",         icon: "🥇", cssVars: { "--sea-selection-bg": "rgba(251,191,36,0.45)", "--sea-focus-ring": "2px solid #fbbf24" }, previewCss: "background:#fbbf24", requiredLevel: 10 },
    { id: "select-mint",      name: "Mint",          description: "Fresh mint highlight.",                    icon: "🌿", cssVars: { "--sea-selection-bg": "rgba(52,211,153,0.45)", "--sea-focus-ring": "2px solid #34d399" }, previewCss: "background:#34d399", requiredLevel: 5 },
    { id: "select-rose",      name: "Rose",          description: "Rose highlight.",                          icon: "🌹", cssVars: { "--sea-selection-bg": "rgba(244,63,94,0.45)", "--sea-focus-ring": "2px solid #fb7185" }, previewCss: "background:#f43f5e", requiredLevel: 5 },
    { id: "select-glow",      name: "Glow Ring",     description: "Focused controls get a glowing ring.",     icon: "💫", cssVars: { "--sea-selection-bg": "rgb(var(--color-brand-500) / 0.4)", "--sea-focus-ring": "2px solid rgb(var(--color-brand-400))", "--sea-focus-glow": "0 0 0 4px rgb(var(--color-brand-500) / 0.35)" }, previewCss: "background:rgb(97 82 223);box-shadow:0 0 0 3px rgb(97 82 223 / 0.4)", requiredLevel: 12 },
]

// ─── 17. Badges ──────────────────────────────────────────────────────────────

export const BADGE_PRESETS: UIPreset[] = [
    { id: "badge-default",    name: "Default",       description: "Standard badges and chips.",               icon: "🏷️", cssVars: {}, previewCss: "background:#374151;border-radius:6px", requiredLevel: 1 },
    { id: "badge-pill",       name: "Pill",          description: "Fully rounded badges.",                    icon: "💊", cssVars: {}, previewCss: "background:#374151;border-radius:9999px", requiredLevel: 2 },
    { id: "badge-square",     name: "Square",        description: "Sharp-cornered badges.",                   icon: "⬛", cssVars: {}, previewCss: "background:#374151;border-radius:0", requiredLevel: 2 },
    { id: "badge-outline",    name: "Outlined",      description: "Transparent badges with a rim.",           icon: "⬜", cssVars: {}, previewCss: "background:transparent;border:1px solid #9ca3af", requiredLevel: 4 },
    { id: "badge-glass",      name: "Glass",         description: "Frosted badges.",                          icon: "🔷", cssVars: {}, previewCss: "background:rgba(255,255,255,0.1);backdrop-filter:blur(6px)", requiredLevel: 6 },
    { id: "badge-dark-glass", name: "Dark Glass",    description: "Frosted near-black badges, card corners included.", icon: "🖤", cssVars: {}, previewCss: "background:rgba(9,9,13,0.6);backdrop-filter:blur(6px);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.12)", requiredLevel: 6 },
    { id: "badge-caps",      name: "Small Caps",    description: "Uppercase, spaced badge text.",            icon: "🔠", cssVars: {}, previewCss: "background:#374151", requiredLevel: 8 },
]

// ─── 18. Idle Dim ────────────────────────────────────────────────────────────
// Dims the app after a while without input (never during playback, see ui-customize-provider).

export const IDLE_PRESETS: UIPreset[] = [
    { id: "idle-off",         name: "Off",           description: "Never dim.",                               icon: "☀️", cssVars: { "--sea-idle-minutes": "0" },  previewCss: "background:#374151", requiredLevel: 1 },
    { id: "idle-2",           name: "2 minutes",     description: "Dim after 2 idle minutes.",                icon: "🌙", cssVars: { "--sea-idle-minutes": "2", "--sea-idle-opacity": "0.55" },  previewCss: "background:#1f2937", requiredLevel: 2 },
    { id: "idle-5",           name: "5 minutes",     description: "Dim after 5 idle minutes.",                icon: "🌙", cssVars: { "--sea-idle-minutes": "5", "--sea-idle-opacity": "0.55" },  previewCss: "background:#111827", requiredLevel: 2 },
    { id: "idle-10",          name: "10 minutes",    description: "Dim after 10 idle minutes.",               icon: "🌙", cssVars: { "--sea-idle-minutes": "10", "--sea-idle-opacity": "0.55" }, previewCss: "background:#0b0f19", requiredLevel: 2 },
    { id: "idle-deep-5",      name: "Deep (5 min)",  description: "Nearly black after 5 idle minutes.",       icon: "🌑", cssVars: { "--sea-idle-minutes": "5", "--sea-idle-opacity": "0.85" },  previewCss: "background:#000", requiredLevel: 6 },
]

// ─── All categories ───────────────────────────────────────────────────────────

export const UI_CUSTOMIZE_CATEGORIES = [
    { id: "animations",  label: "Animations",      icon: "✨", presets: ANIMATION_PRESETS      },
    { id: "cards",       label: "Card Style",       icon: "🃏", presets: CARD_STYLE_PRESETS     },
    { id: "radius",      label: "Border Radius",    icon: "⬜", presets: RADIUS_PRESETS         },
    { id: "hover",       label: "Hover Effects",    icon: "👆", presets: HOVER_EFFECT_PRESETS   },
    { id: "effects",     label: "Visual Effects",   icon: "🌟", presets: EFFECTS_PRESETS        },
    { id: "layout",      label: "Layout Density",   icon: "📐", presets: LAYOUT_PRESETS         },
    { id: "transitions", label: "Page Transitions", icon: "🎬", presets: PAGE_TRANSITION_PRESETS },
    { id: "scrollbar",   label: "Scrollbar",        icon: "↕️", presets: SCROLLBAR_PRESETS     },
    { id: "sidebar",     label: "Sidebar",          icon: "📋", presets: SIDEBAR_PRESETS       },
    { id: "trail",       label: "Mouse Trail",      icon: "✨", presets: MOUSE_TRAIL_PRESETS   },
    { id: "typography",  label: "Typography",       icon: "🔤", presets: TYPOGRAPHY_PRESETS    },
    { id: "accent",      label: "Accent Effects",   icon: "🎨", presets: ACCENT_PRESETS        },
    { id: "navbar",      label: "Top Bar",          icon: "▭",  presets: NAVBAR_PRESETS        },
    { id: "slider",      label: "Progress Bars",    icon: "▬",  presets: SLIDER_PRESETS        },
    { id: "toast",       label: "Notifications",    icon: "🔔", presets: TOAST_PRESETS         },
    { id: "selection",   label: "Selection & Focus", icon: "🖍️", presets: SELECTION_PRESETS    },
    { id: "badge",       label: "Badges",           icon: "🏷️", presets: BADGE_PRESETS         },
    { id: "idle",        label: "Idle Dim",         icon: "🌙", presets: IDLE_PRESETS          },
] as const

export type UICustomizeCategoryId = typeof UI_CUSTOMIZE_CATEGORIES[number]["id"]

export type PageTransitionVariant =
    | "fade"
    | "scaleUp"
    | "scaleDown"
    | "swipeLeft"
    | "swipeRight"
    | "swipeUp"
    | "blur"
    | "rotate"
    | "none"

export type PageTransitionEasing =
    | "linear"
    | "easeIn"
    | "easeOut"
    | "easeInOut"
    | "circIn"
    | "circOut"
    | "anticipate"

export interface UICustomizeState {
    animations:  string
    cards:       string
    radius:      string
    trail:       string
    hover:       string
    effects:     string
    layout:      string
    sidebar:     string
    transitions: string
    scrollbar:   string
    typography:  string
    accent:      string
    navbar:      string
    slider:      string
    toast:       string
    selection:   string
    badge:       string
    idle:        string
    // Layered page-transition settings (see PageTransitionControls)
    transitionVariant:        PageTransitionVariant
    transitionMaxDurationMs:  number
    transitionMaxDelayMs:     number
    transitionEasing:         PageTransitionEasing
    transitionEasingDriven:   boolean
    transitionScaleAmount:    number
    transitionSwipeDistance:  number
}

export const UI_CUSTOMIZE_DEFAULTS: UICustomizeState = {
    animations:  "anim-standard",
    cards:       "card-default",
    radius:      "radius-default",
    trail:       "trail-none",
    hover:       "hover-lift",
    effects:     "fx-none",
    layout:      "layout-default",
    sidebar:     "sidebar-default",
    transitions: "pt-fade",
    scrollbar:   "scroll-default",
    typography:  "type-default",
    accent:      "accent-none",
    navbar:      "navbar-default",
    slider:      "slider-default",
    toast:       "toast-default",
    selection:   "select-default",
    badge:       "badge-default",
    idle:        "idle-off",
    transitionVariant:        "fade",
    transitionMaxDurationMs:  600,
    transitionMaxDelayMs:     350,
    transitionEasing:         "easeInOut",
    transitionEasingDriven:   true,
    transitionScaleAmount:    0.7,
    transitionSwipeDistance:  200,
}
