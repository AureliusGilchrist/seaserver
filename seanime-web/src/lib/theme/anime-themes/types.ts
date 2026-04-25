import type React from "react"

export type AnimeThemeId =
    | "seanime"
    | "naruto"
    | "bleach"
    | "one-piece"
    // ── Shonen / Action ──
    | "dragon-ball-z"
    | "attack-on-titan"
    | "my-hero-academia"
    | "demon-slayer"
    | "jujutsu-kaisen"
    | "fullmetal-alchemist"
    | "hunter-x-hunter"
    | "black-clover"
    | "fairy-tail"
    | "sword-art-online"
    | "death-note"
    | "code-geass"
    | "tokyo-ghoul"
    | "mob-psycho-100"
    | "one-punch-man"
    // ── Isekai / Fantasy ──
    | "re-zero"
    | "konosuba"
    | "mushoku-tensei"
    | "slime-isekai"
    | "overlord"
    // ── Romance / Slice of Life ──
    | "your-name"
    | "violet-evergarden"
    | "toradora"
    | "spy-x-family"
    | "bocchi-the-rock"
    // ── Mecha / Sci-Fi ──
    | "evangelion"
    | "steins-gate"
    | "cowboy-bebop"
    | "psycho-pass"
    | "ghost-in-the-shell"
    // ── Dark / Seinen ──
    | "berserk"
    | "vinland-saga"
    | "chainsaw-man"
    | "made-in-abyss"
    | "parasyte"
    // ── Sports / Other ──
    | "haikyuu"
    | "frieren"
    | "dandadan"
    | "dr-stone"
    | "fire-force"
    // ── Manga ──
    | "solo-leveling"
    | "tower-of-god"
    | "vagabond"
    | "20th-century-boys"
    | "monster"
    | "goodnight-punpun"
    | "slam-dunk"
    | "akira"
    | "gantz"
    | "dorohedoro"
    // ── Retro / Classic ──
    | "serial-experiments-lain"
    | "trigun"
    | "rurouni-kenshin"
    | "sailor-moon"
    | "cardcaptor-sakura"
    | "inuyasha"
    | "yuyu-hakusho"
    | "initial-d"
    | "ranma-12"
    | "revolutionary-girl-utena"
    | "outlaw-star"
    | "great-teacher-onizuka"
    | "perfect-blue"
    | "princess-mononoke"
    | "spirited-away"
    | "lupin-iii"
    | "grave-of-the-fireflies"
    | "samurai-champloo"
    | "flcl"
    | "gurren-lagann"
    | "haruhi-suzumiya"
    | "elfen-lied"
    | "clannad"
    | "angel-beats"
    | "nana"
    | "escaflowne"
    | "claymore"
    | "mirai-nikki"
    | "higurashi"
    | "record-of-lodoss-war"
    // ── Additional ──
    | "no-game-no-life"
    | "fate-grand-order"
    // ── Manga (extra to reach 100) ──
    | "tokyo-ghoul-re"
    | "blue-lock"
    | "kingdom"
    | "blame"
    | "junji-ito"
    | "uzumaki"
    | "pluto"
    | "battle-angel-alita"
    | "blade-of-the-immortal"
    | "hellsing"
    | "homunculus"
    | "holyland"
    | "berserk-of-gluttony"
    // ── Wave 2: 1970s Classics ──
    | "mazinger-z"
    | "space-battleship-yamato"
    | "galaxy-express-999"
    | "future-boy-conan"
    | "gundam"
    // ── Wave 2: 1980s Classics ──
    | "dr-slump"
    | "urusei-yatsura"
    | "macross"
    | "nausicaa"
    | "fist-of-the-north-star"
    | "dirty-pair"
    | "dragon-ball"
    | "castle-in-the-sky"
    | "maison-ikkoku"
    | "saint-seiya"
    | "city-hunter"
    | "my-neighbor-totoro"
    | "patlabor"
    | "legend-of-galactic-heroes"
    | "kiki-delivery-service"
    // ── Wave 2: 1990s–2000s ──
    | "porco-rosso"
    | "magic-knight-rayearth"
    | "whisper-of-the-heart"
    | "kare-kano"
    | "dragon-ball-gt"
    | "s-cry-ed"
    | "shaman-king"
    | "fruits-basket"
    | "twelve-kingdoms"
    | "wolf-rain"
    | "school-rumble"
    | "eureka-seven"
    | "black-lagoon"
    | "d-gray-man"
    | "katekyo-hitman-reborn"
    | "ouran-host-club"
    | "moribito"
    | "darker-than-black"
    | "baccano"
    | "fate-stay-night"
    | "lovely-complex"
    | "natsume-yujincho"
    | "skip-beat"
    | "black-butler"
    | "soul-eater"
    | "pandora-hearts"
    | "durarara"
    | "fate-zero"
    | "madoka-magica"
    | "ao-no-exorcist"
    // ── Wave 2: 2010s ──
    | "anohana"
    | "magi"
    | "kids-on-the-slope"
    | "log-horizon"
    | "gintama"
    | "kill-la-kill"
    | "nichijou"
    | "seven-deadly-sins"
    | "akame-ga-kill"
    | "noragami"
    | "your-lie-in-april"
    | "golden-time"
    | "arslan-senki"
    | "owari-no-seraph"
    | "danmachi"
    | "hibike-euphonium"
    | "re-creators"
    | "net-juu-no-susume"
    | "wotakoi"
    | "kaguya-sama"
    | "quintessential-quintuplets"
    | "horimiya"
    | "lycoris-recoil"
    | "my-dress-up-darling"
    | "the-eminence-in-shadow"
    // ── Wave 2: 2020s ──
    | "to-your-eternity"
    | "rent-a-girlfriend"
    | "oshi-no-ko"
    | "dungeon-meshi"
    | "shangri-la-frontier"
    | "kaiju-8"
    | "wind-breaker"
    | "sakamoto-days"
    | "zom-100"
    | "omniscient-reader"
    | "high-school-dxd"
    | "blue-box"
    | "skip-and-loafer"
    // ── Wave 2: Additional Classics & Recent ──
    | "beelzebub"
    | "toriko"
    | "zatch-bell"
    | "arifureta"
    | "death-march"
    | "the-rising-of-the-shield-hero"
    | "greatest-demon-lord"
    | "candy-candy"
    | "now-and-then-here-and-there"
    | "trigun-stampede"
    | "blue-period"
    | "metallic-rouge"
    // ── Wave 3: Sports, Romance, Slice-of-Life & More ──
    | "jojo-bizarre-adventure"
    | "pokemon"
    | "detective-conan"
    | "hajime-no-ippo"
    | "kuroko-no-basuke"
    | "goblin-slayer"
    | "tokyo-revengers"
    | "oregairu"
    | "classroom-of-the-elite"
    | "k-on"
    | "yuri-on-ice"
    | "free"
    | "monogatari"
    | "lucky-star"
    | "cells-at-work"
    | "miss-kobayashis-dragon-maid"
    | "yuru-camp"
    | "a-silent-voice"
    | "hyouka"
    | "eyeshield-21"
    | "prince-of-tennis"
    | "captain-tsubasa"
    | "ashita-no-joe"
    | "kenichi"
    | "kimi-ni-todoke"
    | "maid-sama"
    | "ao-haru-ride"
    | "nisekoi"
    | "plastic-memories"
    | "nagatoro"
    | "takagi-san"
    | "shikimori"
    | "honey-and-clover"
    | "chobits"
    | "ore-monogatari"
    | "mahouka"
    | "little-witch-academia"
    | "ancient-magus-bride"
    | "devil-is-a-part-timer"
    | "date-a-live"
    | "kamisama-kiss"
    | "grimgar"
    | "my-next-life-villainess"
    | "chihayafuru"
    | "yowamushi-pedal"
    | "grand-blue"
    | "azumanga-daioh"
    | "non-non-biyori"
    | "hinamatsuri"
    | "banana-fish"
    | "91-days"
    | "world-god-only-knows"
    | "run-with-the-wind"
    | "nagi-no-asukara"
    | "hanasaku-iroha"
    | "way-of-househusband"
    | "weathering-with-you"
    | "charlotte"
    | "march-comes-in-like-a-lion"
    | "ping-pong-animation"
    | "tatami-galaxy"
    | "welcome-to-nhk"
    | "mushishi"
    | "space-brothers"
    | "barakamon"
    | "cross-game"
    | "major"
    | "rainbow-manga"
    | "touch-baseball"
    | "suzume"
    | "i-want-to-eat-your-pancreas"
    | "baki"
    | "kengan-ashura"
    | "wolf-children"
    | "summer-wars"
    | "aria"
    | "haibane-renmei"
    | "texhnolyze"
    | "hidamari-sketch"
    | "another"
    | "ef-tale-of-memories"
    | "tamako-market"
    | "kyoukai-no-kanata"
    | "amagi-brilliant-park"
    | "accel-world"
    | "infinite-stratos"

export type SidebarItemOverride = {
    icon: React.ComponentType<{ className?: string }>
    label: string
}

export type PlayerIconOverrides = {
    play?: React.ComponentType<{ className?: string }>
    pause?: React.ComponentType<{ className?: string }>
    volumeHigh?: React.ComponentType<{ className?: string }>
    volumeMid?: React.ComponentType<{ className?: string }>
    volumeLow?: React.ComponentType<{ className?: string }>
    volumeMuted?: React.ComponentType<{ className?: string }>
    fullscreenEnter?: React.ComponentType<{ className?: string }>
    fullscreenExit?: React.ComponentType<{ className?: string }>
    skipForward?: React.ComponentType<{ className?: string }>
    skipBack?: React.ComponentType<{ className?: string }>
    pip?: React.ComponentType<{ className?: string }>
    pipOff?: React.ComponentType<{ className?: string }>
}

export type ParticleTypeConfig = {
    /** Display name in settings UI */
    label: string
    /** Max particle count at 100% */
    maxCount: number
    /** Default enabled state */
    defaultEnabled: boolean
    /** Default sub-intensity 0-100 (controls count, speed, opacity for this type) */
    defaultIntensity: number
}

export type AnimeThemeConfig = {
    id: AnimeThemeId
    displayName: string
    description: string
    /** CSS custom property overrides injected onto :root */
    cssVars: Record<string, string>
    /** Google Font family name to load (injected as <link>) */
    fontFamily?: string
    /** Google Fonts href */
    fontHref?: string
    /** Sidebar item overrides: nav item id → { icon, label } */
    sidebarOverrides: Record<string, SidebarItemOverride>
    /** Achievement key → themed display name */
    achievementNames: Record<string, string>
    /** URL to hosted or local background music (CC-licensed or user-supplied) */
    musicUrl: string
    /** Preview color for theme selector card */
    previewColors: {
        primary: string
        secondary: string
        accent: string
        bg: string
    }
    /** Whether this theme has animated background elements */
    hasAnimatedElements?: boolean
    /** Full-resolution background image URL (loaded from CDN, cached by browser) */
    backgroundImageUrl?: string
    /** Background dim (0-1), default 0 means use default opacity */
    backgroundDim?: number
    /** Background blur in px, default 0 */
    backgroundBlur?: number
    /** Per-particle-type configuration (keyed by particle type id) */
    particleTypes?: Record<string, ParticleTypeConfig>
    /** Hex color for canvas particle effect (e.g. "#ff6600"). Falls back to white. */
    particleColor?: string
    /** Player icon overrides for video player controls */
    playerIconOverrides?: PlayerIconOverrides
    /**
     * Level → rank name. Keys are level thresholds; the highest key ≤ current level wins.
     * Example: { 1: "Genin", 15: "Chunin", 30: "Jonin" }
     */
    milestoneNames?: Record<number, string>
}

export type HiddenThemeCondition = {
    themeId: AnimeThemeId
    requireActiveTheme: AnimeThemeId
    requireMangaCompletedIds: number[]
    hint?: string
}
