export type EasterEggTrigger =
    | "konami"
    | "type-sequence"
    | "click-count"
    | "time-of-day"
    | "date"
    | "scroll-to-bottom"
    | "idle"
    | "manual"

export interface EasterEggDefinition {
    id: string
    name: string
    description: string
    xp: number
    trigger: EasterEggTrigger
    // trigger-specific config
    sequence?: string[]      // for konami / type-sequence
    target?: string          // CSS selector for click-count
    clickCount?: number      // for click-count
    idleSeconds?: number     // for idle
    hour?: number            // for time-of-day (0–23)
    month?: number           // for date (1-based)
    day?: number             // for date
    hint: string
    icon: string
}

export const EASTER_EGG_DEFINITIONS: EasterEggDefinition[] = [
    // ─── Konami ───────────────────────────────────────────────────────────────
    {
        id: "konami-code",
        name: "Konami Code",
        description: "You remembered the classic code.",
        xp: 100,
        trigger: "konami",
        sequence: ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"],
        hint: "↑↑↓↓←→←→BA",
        icon: "🕹️",
    },
    // ─── Type sequences ───────────────────────────────────────────────────────
    {
        id: "type-seanime",
        name: "Say My Name",
        description: "Typed the app's name.",
        xp: 60,
        trigger: "type-sequence",
        sequence: ["s","e","a","n","i","m","e"],
        hint: "Just type what you see.",
        icon: "🌊",
    },
    {
        id: "type-yare-yare",
        name: "Yare Yare Daze",
        description: "What a pain…",
        xp: 80,
        trigger: "type-sequence",
        sequence: ["y","a","r","e","y","a","r","e"],
        hint: "The world-weary phrase from JoJo.",
        icon: "😤",
    },
    {
        id: "type-plus-ultra",
        name: "Plus Ultra!",
        description: "Go beyond your limits!",
        xp: 80,
        trigger: "type-sequence",
        sequence: ["p","l","u","s","u","l","t","r","a"],
        hint: "The battle cry of U.A. heroes.",
        icon: "💥",
    },
    {
        id: "type-dattebayo",
        name: "Believe It!",
        description: "Dattebayo!",
        xp: 80,
        trigger: "type-sequence",
        sequence: ["d","a","t","t","e","b","a","y","o"],
        hint: "Naruto's signature phrase.",
        icon: "🍜",
    },
    {
        id: "type-gomu-gomu",
        name: "Gomu Gomu no Mi",
        description: "I'm gonna be King of the Pirates!",
        xp: 80,
        trigger: "type-sequence",
        sequence: ["g","o","m","u","g","o","m","u"],
        hint: "The Devil Fruit of the Straw Hat captain.",
        icon: "🏴‍☠️",
    },
    {
        id: "type-nani",
        name: "NANI?!",
        description: "Wh-what?!",
        xp: 40,
        trigger: "type-sequence",
        sequence: ["n","a","n","i"],
        hint: "A very expressive Japanese word.",
        icon: "😱",
    },
    {
        id: "type-omae-wa",
        name: "Omae Wa Mou…",
        description: "You are already dead.",
        xp: 90,
        trigger: "type-sequence",
        sequence: ["o","m","a","e","w","a"],
        hint: "Kenshiro's iconic line from HnK.",
        icon: "💀",
    },
    {
        id: "type-isekai",
        name: "Truck-kun",
        description: "Isekai protagonist found!",
        xp: 55,
        trigger: "type-sequence",
        sequence: ["i","s","e","k","a","i"],
        hint: "Another world awaits.",
        icon: "🚛",
    },
    // ─── Click sequences ──────────────────────────────────────────────────────
    {
        id: "click-logo-10",
        name: "Curious Clicker",
        description: "Clicked the logo 10 times.",
        xp: 50,
        trigger: "click-count",
        target: "[data-easter-egg='logo']",
        clickCount: 10,
        hint: "What happens if you click the logo a lot?",
        icon: "🖱️",
    },
    {
        id: "click-logo-30",
        name: "Obsessive Clicker",
        description: "Clicked the logo 30 times. Are you okay?",
        xp: 75,
        trigger: "click-count",
        target: "[data-easter-egg='logo']",
        clickCount: 30,
        hint: "30 times. Really.",
        icon: "🔁",
    },
    {
        id: "avatar-click-10",
        name: "Mirror, Mirror",
        description: "Clicked your own avatar 10 times.",
        xp: 60,
        trigger: "click-count",
        target: "[data-easter-egg='user-avatar']",
        clickCount: 10,
        hint: "You're your own biggest fan.",
        icon: "🪞",
    },
    // ─── Time of day ──────────────────────────────────────────────────────────
    {
        id: "midnight-visit",
        name: "Night Owl",
        description: "Visited at midnight.",
        xp: 50,
        trigger: "time-of-day",
        hour: 0,
        hint: "Be here when the clock strikes midnight.",
        icon: "🦉",
    },
    {
        id: "friday-night",
        name: "No Life Friday",
        description: "Watching anime on a Friday night.",
        xp: 30,
        trigger: "time-of-day",
        hour: 22, // 10 PM on a Friday
        hint: "Friday night, peak anime hours.",
        icon: "🎉",
    },
    {
        id: "monday-morning",
        name: "Already Monday",
        description: "Starting the week with anime. Respect.",
        xp: 20,
        trigger: "time-of-day",
        hour: 7, // Monday 7 AM
        hint: "Early mornings hit different.",
        icon: "☕",
    },
    // ─── Date-based ───────────────────────────────────────────────────────────
    {
        id: "new-year-visit",
        name: "Happy New Year!",
        description: "Ringing in the new year with anime.",
        xp: 200,
        trigger: "date",
        month: 1,
        day: 1,
        hint: "Visit on New Year's Day.",
        icon: "🎆",
    },
    {
        id: "christmas-visit",
        name: "Merry Kurisumasu!",
        description: "Santa delivered the anime early.",
        xp: 150,
        trigger: "date",
        month: 12,
        day: 25,
        hint: "Visit on Christmas.",
        icon: "🎄",
    },
    {
        id: "halloween-visit",
        name: "Spooky Season",
        description: "Trick or treat, anime edition.",
        xp: 120,
        trigger: "date",
        month: 10,
        day: 31,
        hint: "Visit on Halloween.",
        icon: "🎃",
    },
    // ─── Scroll ───────────────────────────────────────────────────────────────
    {
        id: "scroll-to-bottom",
        name: "Rock Bottom",
        description: "Scrolled all the way to the bottom.",
        xp: 30,
        trigger: "scroll-to-bottom",
        hint: "The floor is lava. Or XP.",
        icon: "⬇️",
    },
    // ─── Idle ─────────────────────────────────────────────────────────────────
    {
        id: "idle-5min",
        name: "AFK Watcher",
        description: "Left the app idle for 5 minutes.",
        xp: 25,
        trigger: "idle",
        idleSeconds: 300,
        hint: "Just walk away for a bit.",
        icon: "⏳",
    },
    {
        id: "long-session",
        name: "Committed",
        description: "Kept the app open for 2 hours.",
        xp: 50,
        trigger: "idle",
        idleSeconds: 7200,
        hint: "Time flies when you're watching anime.",
        icon: "⌚",
    },
    // ─── Manual / programmatic ────────────────────────────────────────────────
    {
        id: "theme-changed-5",
        name: "Costume Collector",
        description: "Changed the theme 5 times.",
        xp: 50,
        trigger: "manual",
        hint: "Try on every outfit.",
        icon: "👗",
    },
    {
        id: "search-empty",
        name: "Nothing to See Here",
        description: "Searched for something with no results.",
        xp: 25,
        trigger: "manual",
        hint: "The void stares back.",
        icon: "🔍",
    },
    {
        id: "dark-mode-toggle",
        name: "Light/Dark Duality",
        description: "Toggled dark mode.",
        xp: 20,
        trigger: "manual",
        hint: "Embrace both sides.",
        icon: "🌓",
    },
    {
        id: "watched-all-episodes",
        name: "Episode Marathon",
        description: "Marked all episodes of a series as watched.",
        xp: 75,
        trigger: "manual",
        hint: "Finish what you started.",
        icon: "✅",
    },
    {
        id: "manga-binge",
        name: "Page Turner",
        description: "Read 50+ chapters in one session.",
        xp: 75,
        trigger: "manual",
        hint: "One more chapter...",
        icon: "📖",
    },
    {
        id: "anime-100",
        name: "Centurion (Anime)",
        description: "Reached 100 anime in your library.",
        xp: 100,
        trigger: "manual",
        hint: "100 series, 0 regrets.",
        icon: "💯",
    },
    {
        id: "manga-100",
        name: "Centurion (Manga)",
        description: "Reached 100 manga in your library.",
        xp: 100,
        trigger: "manual",
        hint: "100 manga, 0 regrets.",
        icon: "📚",
    },
    {
        id: "achievement-unlock-10",
        name: "Achievement Hunter",
        description: "Unlocked 10 achievements.",
        xp: 80,
        trigger: "manual",
        hint: "Keep collecting those badges.",
        icon: "🏆",
    },
    {
        id: "profile-complete",
        name: "Identity Established",
        description: "Set your avatar, username, and bio.",
        xp: 60,
        trigger: "manual",
        hint: "Let the world know who you are.",
        icon: "🪪",
    },
    {
        id: "secret-path",
        name: "Secret Garden",
        description: "Found the hidden path.",
        xp: 150,
        trigger: "manual",
        hint: "Some things are hidden in plain sight.",
        icon: "🌸",
    },
]

export const EASTER_EGG_MAP = new Map(EASTER_EGG_DEFINITIONS.map(e => [e.id, e]))
