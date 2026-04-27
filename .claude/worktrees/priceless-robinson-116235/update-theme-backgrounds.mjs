#!/usr/bin/env node
// update-theme-backgrounds.mjs
// Downloads wallhaven.cc wallpapers for all 99 anime themes and updates theme .ts files.
// Run from: E:\Main\seaserver
// Usage: node update-theme-backgrounds.mjs

import fs   from "fs"
import path from "path"
import https from "https"
import http  from "http"
import { URL } from "url"

const THEMES_DIR   = path.resolve("seanime-web/src/lib/theme/anime-themes")
const OUT_DIR      = path.resolve("seanime-web/public/themes")
const CREDITS_FILE = path.resolve("artists-credit.txt")
const API_BASE     = "https://wallhaven.cc/api/v1/search"

fs.mkdirSync(OUT_DIR, { recursive: true })

// ─── Theme list ──────────────────────────────────────────────────────────────
const themes = [
    // ── Big Three / Shonen ──
    { id: "naruto",              q: "naruto konoha landscape anime",         manga: false, color: "#dc5000" },
    { id: "bleach",              q: "bleach ichigo soul society",            manga: false, color: "#3a6fc8" },
    { id: "one-piece",           q: "one piece luffy grand line sea",        manga: false, color: "#e87028" },
    { id: "dragon-ball-z",       q: "dragon ball z goku power",              manga: false, color: "#f0a000" },
    { id: "attack-on-titan",     q: "attack on titan wall landscape",        manga: false, color: "#6a5040" },
    { id: "my-hero-academia",    q: "my hero academia deku hero",            manga: false, color: "#24a840" },
    { id: "demon-slayer",        q: "demon slayer kimetsu sunset",           manga: false, color: "#c84850" },
    { id: "jujutsu-kaisen",      q: "jujutsu kaisen cursed energy",          manga: false, color: "#4060b0" },
    { id: "fullmetal-alchemist", q: "fullmetal alchemist brotherhood",       manga: false, color: "#c07830" },
    { id: "hunter-x-hunter",     q: "hunter x hunter landscape",             manga: false, color: "#28a060" },
    { id: "black-clover",        q: "black clover magic knight",             manga: false, color: "#404080" },
    { id: "fairy-tail",          q: "fairy tail guild magic",                manga: false, color: "#e05030" },
    { id: "sword-art-online",    q: "sword art online aincrad",              manga: false, color: "#3878d8" },
    { id: "death-note",          q: "death note light darkness",             manga: false, color: "#b8a030" },
    { id: "code-geass",          q: "code geass lelouch geass",              manga: false, color: "#8228dc" },
    { id: "tokyo-ghoul",         q: "tokyo ghoul kaneki mask",               manga: false, color: "#303050" },
    { id: "mob-psycho-100",      q: "mob psycho 100 psychic",                manga: false, color: "#00b9a5" },
    { id: "one-punch-man",       q: "one punch man saitama city",            manga: false, color: "#f0d020" },
    // ── Isekai / Fantasy ──
    { id: "re-zero",             q: "re zero subaru emilia snow",            manga: false, color: "#2d5fc8" },
    { id: "konosuba",            q: "konosuba kazuma party adventurers",     manga: false, color: "#e07850" },
    { id: "mushoku-tensei",      q: "mushoku tensei magic forest",           manga: false, color: "#4890d8" },
    { id: "slime-isekai",        q: "slime isekai rimuru fantasy",           manga: false, color: "#3088b0" },
    { id: "overlord",            q: "overlord ainz ooal gown dark",          manga: false, color: "#a06020" },
    // ── Romance / Slice of Life ──
    { id: "your-name",           q: "your name kimi no na wa comet sky",     manga: false, color: "#1e5fd2" },
    { id: "violet-evergarden",   q: "violet evergarden flowers letter",      manga: false, color: "#6888d0" },
    { id: "toradora",            q: "toradora taiga ryuuji autumn",          manga: false, color: "#e05850" },
    { id: "spy-x-family",        q: "spy x family anya forger city",         manga: false, color: "#c87090" },
    { id: "bocchi-the-rock",     q: "bocchi the rock guitar music",          manga: false, color: "#e8407a" },
    // ── Mecha / Sci-Fi ──
    { id: "evangelion",          q: "neon genesis evangelion eva tokyo 3",   manga: false, color: "#4c8c50" },
    { id: "steins-gate",         q: "steins gate time machine lab",          manga: false, color: "#f0a820" },
    { id: "cowboy-bebop",        q: "cowboy bebop space jazz",               manga: false, color: "#d0802a" },
    { id: "psycho-pass",         q: "psycho pass city scanner",              manga: false, color: "#60a8c0" },
    { id: "ghost-in-the-shell",  q: "ghost in the shell cyber city",         manga: false, color: "#3890b8" },
    // ── Dark / Seinen ──
    { id: "berserk",             q: "berserk guts dark fantasy",             manga: true,  color: "#a82020" },
    { id: "vinland-saga",        q: "vinland saga viking landscape",         manga: false, color: "#6c7840" },
    { id: "chainsaw-man",        q: "chainsaw man denji city",               manga: false, color: "#e84020" },
    { id: "made-in-abyss",       q: "made in abyss abyss landscape",         manga: false, color: "#3068a0" },
    { id: "parasyte",            q: "parasyte maxim shinichi body horror",   manga: false, color: "#38a848" },
    // ── Sports / Other ──
    { id: "haikyuu",             q: "haikyuu volleyball court",              manga: false, color: "#e87020" },
    { id: "frieren",             q: "frieren beyond journey end magic",      manga: false, color: "#9870d8" },
    { id: "dandadan",            q: "dandadan alien supernatural",           manga: false, color: "#5080c0" },
    { id: "dr-stone",            q: "dr stone science stone world",          manga: false, color: "#58a830" },
    { id: "fire-force",          q: "fire force flame firefighter",          manga: false, color: "#e86030" },
    // ── Manga / Manhwa ──
    { id: "solo-leveling",       q: "solo leveling sung jinwoo dungeon",     manga: false, color: "#4060d0" },
    { id: "tower-of-god",        q: "tower of god baam rachel tower",        manga: false, color: "#3890a8" },
    { id: "vagabond",            q: "vagabond miyamoto musashi samurai",     manga: true,  color: "#806040" },
    { id: "20th-century-boys",   q: "20th century boys manga kenji",         manga: true,  color: "#d09040" },
    { id: "monster",             q: "monster naoki urasawa thriller",        manga: true,  color: "#707070" },
    { id: "goodnight-punpun",    q: "goodnight punpun manga dark",           manga: true,  color: "#505050" },
    { id: "slam-dunk",           q: "slam dunk basketball manga",            manga: true,  color: "#d04030" },
    { id: "akira",               q: "akira katsuhiro otomo anime city",      manga: false, color: "#d03020" },
    { id: "gantz",               q: "gantz manga alien dark",                manga: true,  color: "#304050" },
    { id: "dorohedoro",          q: "dorohedoro magic hole landscape",       manga: false, color: "#5c7838" },
    // ── Retro / Classic ──
    { id: "serial-experiments-lain", q: "serial experiments lain wired",    manga: false, color: "#5870a0" },
    { id: "trigun",              q: "trigun vash desert",                    manga: false, color: "#d89040" },
    { id: "rurouni-kenshin",     q: "rurouni kenshin samurai meiji",         manga: false, color: "#c85040" },
    { id: "sailor-moon",         q: "sailor moon senshi moon",               manga: false, color: "#e878d8" },
    { id: "cardcaptor-sakura",   q: "cardcaptor sakura star magic",          manga: false, color: "#e850a8" },
    { id: "inuyasha",            q: "inuyasha kagome feudal japan forest",   manga: false, color: "#c05068" },
    { id: "yuyu-hakusho",        q: "yu yu hakusho yusuke spirit world",     manga: false, color: "#4870d0" },
    { id: "initial-d",           q: "initial d eurobeat mountain road night",manga: false, color: "#e0d020" },
    { id: "ranma-12",            q: "ranma 1/2 martial arts",                manga: false, color: "#e85050" },
    { id: "revolutionary-girl-utena", q: "revolutionary girl utena dueling", manga: false, color: "#e060c0" },
    { id: "outlaw-star",         q: "outlaw star space ship",                manga: false, color: "#c04830" },
    { id: "great-teacher-onizuka", q: "great teacher onizuka GTO school",   manga: false, color: "#d87828" },
    { id: "perfect-blue",        q: "perfect blue satoshi kon psychological",manga: false, color: "#4060c0" },
    { id: "princess-mononoke",   q: "princess mononoke forest spirit",       manga: false, color: "#386828" },
    { id: "spirited-away",       q: "spirited away spirit bath house",       manga: false, color: "#d88838" },
    { id: "lupin-iii",           q: "lupin III heist retro",                 manga: false, color: "#c04030" },
    { id: "grave-of-the-fireflies", q: "grave of the fireflies fireflies",   manga: false, color: "#d09030" },
    { id: "samurai-champloo",    q: "samurai champloo edo japan",            manga: false, color: "#d86830" },
    { id: "flcl",                q: "flcl fooly cooly surreal",              manga: false, color: "#e87040" },
    { id: "gurren-lagann",       q: "gurren lagann mecha drill",             manga: false, color: "#d83020" },
    { id: "haruhi-suzumiya",     q: "haruhi suzumiya SOS brigade school",    manga: false, color: "#e85050" },
    { id: "elfen-lied",          q: "elfen lied Lucy vectors",               manga: false, color: "#d04060" },
    { id: "clannad",             q: "clannad afterstory countryside",        manga: false, color: "#4890c8" },
    { id: "angel-beats",         q: "angel beats afterlife school",          manga: false, color: "#6888d0" },
    { id: "nana",                q: "nana anime music tokyo",                manga: false, color: "#c050a0" },
    { id: "escaflowne",          q: "vision of escaflowne guymelef sky",     manga: false, color: "#9060c0" },
    { id: "claymore",            q: "claymore anime warrior fantasy",        manga: false, color: "#8080a0" },
    { id: "mirai-nikki",         q: "future diary yuno gasai",               manga: false, color: "#d040a0" },
    { id: "higurashi",           q: "higurashi when they cry village",       manga: false, color: "#b03060" },
    { id: "record-of-lodoss-war",q: "record of lodoss war fantasy",          manga: false, color: "#806040" },
    // ── Additional ──
    { id: "no-game-no-life",     q: "no game no life shiro sora chess",      manga: false, color: "#d08030" },
    { id: "fate-grand-order",    q: "fate grand order servants battle",      manga: false, color: "#c0a030" },
    // ── Manga extras ──
    { id: "tokyo-ghoul-re",      q: "tokyo ghoul re kaneki dark city",       manga: false, color: "#404060" },
    { id: "blue-lock",           q: "blue lock soccer football",             manga: false, color: "#2840c0" },
    { id: "kingdom",             q: "kingdom manga china war battlefield",   manga: true,  color: "#906040" },
    { id: "blame",               q: "blame nihei tsutomu megastructure",     manga: true,  color: "#506080" },
    { id: "junji-ito",           q: "junji ito horror manga spiral",         manga: true,  color: "#505050" },
    { id: "uzumaki",             q: "uzumaki junji ito spiral horror",       manga: true,  color: "#404040" },
    { id: "pluto",               q: "pluto naoki urasawa robot",             manga: true,  color: "#607090" },
    { id: "battle-angel-alita",  q: "battle angel alita gunnm cyborg",       manga: true,  color: "#506080" },
    { id: "blade-of-the-immortal", q: "blade of the immortal samurai manga", manga: true,  color: "#808070" },
    { id: "hellsing",            q: "hellsing alucard vampire",              manga: false, color: "#c02020" },
    { id: "homunculus",          q: "homunculus manga trepanation",          manga: true,  color: "#605050" },
    { id: "holyland",            q: "holyland manga street fight",           manga: true,  color: "#606060" },
    { id: "berserk-of-gluttony", q: "berserk of gluttony dark fantasy",      manga: true,  color: "#803030" },
]

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url)
        const lib = u.protocol === "https:" ? https : http
        lib.get(url, { headers: { "User-Agent": "seanime-theme-downloader/1.0" } }, res => {
            let data = ""
            res.on("data", chunk => (data += chunk))
            res.on("end", () => {
                try { resolve(JSON.parse(data)) }
                catch (e) { reject(new Error("JSON parse error: " + data.slice(0, 200))) }
            })
        }).on("error", reject)
    })
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const u = new URL(url)
        const lib = u.protocol === "https:" ? https : http
        const file = fs.createWriteStream(dest)
        lib.get(url, { headers: { "User-Agent": "seanime-theme-downloader/1.0" } }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close()
                fs.unlinkSync(dest)
                return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
            }
            res.pipe(file)
            file.on("finish", () => file.close(resolve))
            file.on("error", e => { fs.unlinkSync(dest); reject(e) })
        }).on("error", e => { fs.unlinkSync(dest); reject(e) })
    })
}

// ─── Phase 1: Download ────────────────────────────────────────────────────────
const results = {}
const creditsLines = [
    "SEANIME THEME BACKGROUND CREDITS",
    "=".repeat(80),
    "All wallpaper images sourced from wallhaven.cc",
    "Wallhaven hosts community-uploaded wallpapers. Full credit to original artists.",
    "Please visit wallhaven.cc to find and credit the original creators.",
    "",
    "Theme ID".padEnd(30) + "  Wallhaven URL",
    "-".repeat(80),
]

console.log("\n=== Downloading theme backgrounds ===\n")

for (const t of themes) {
    const themeFile = path.join(THEMES_DIR, `${t.id}-theme.ts`)
    if (!fs.existsSync(themeFile)) {
        console.warn(`  [--] No theme file: ${t.id}-theme.ts — skipping`)
        continue
    }

    const searchQ = t.manga ? `${t.q} monochrome` : t.q
    const params  = new URLSearchParams({
        q: searchQ,
        categories: "110",
        purity: "100",
        sorting: "toplist",
        order: "desc",
        topRange: "1y",
    })
    const apiUrl = `${API_BASE}?${params.toString()}`

    try {
        const resp    = await fetchJson(apiUrl)
        const data    = resp.data ?? []
        if (data.length === 0) {
            console.warn(`  [--] ${t.id}: no results on wallhaven`)
            results[t.id] = { webPath: "", imgUrl: "", uploader: "" }
        } else {
            const img      = data[0]
            const imgUrl   = img.path
            const uploader = img?.uploader?.username ?? "unknown"
            const ext      = path.extname(imgUrl) || ".jpg"
            const localName = `${t.id}${ext}`
            const localDest = path.join(OUT_DIR, localName)
            const webPath   = `/themes/${localName}`

            await downloadFile(imgUrl, localDest)
            results[t.id] = { webPath, imgUrl, uploader }

            creditsLines.push(`${t.id.padEnd(30)}  ${imgUrl}`)
            creditsLines.push(`${"".padEnd(30)}  Uploader: @${uploader} -- https://wallhaven.cc/user/${uploader}`)
            creditsLines.push("")
            console.log(`  [OK] ${t.id}  (${uploader})`)
        }
    } catch (err) {
        console.warn(`  [!!] ${t.id}: ${err.message}`)
        results[t.id] = { webPath: "", imgUrl: "", uploader: "" }
    }

    await sleep(700) // respect wallhaven rate limit
}

fs.writeFileSync(CREDITS_FILE, creditsLines.join("\n"), "utf8")
console.log(`\nCredit file written: ${CREDITS_FILE}`)

// ─── Phase 2: Update theme .ts files ─────────────────────────────────────────
console.log("\n=== Updating theme files ===\n")

for (const t of themes) {
    const themeFile = path.join(THEMES_DIR, `${t.id}-theme.ts`)
    if (!fs.existsSync(themeFile)) continue

    let content = fs.readFileSync(themeFile, "utf8")
    let changed = false

    const color   = t.color || "#ffffff"
    const webPath = results[t.id]?.webPath ?? ""

    // 1. backgroundImageUrl — replace CDN URL or empty string, or insert if missing
    if (content.includes('backgroundImageUrl: "https://')) {
        if (webPath) {
            content = content.replace(/backgroundImageUrl:\s*"https:\/\/[^"]*"/, `backgroundImageUrl: "${webPath}"`)
            changed = true
        }
    } else if (/backgroundImageUrl:\s*""/.test(content)) {
        content = content.replace(/backgroundImageUrl:\s*""/, `backgroundImageUrl: "${webPath}"`)
        changed = true
    } else if (!content.includes("backgroundImageUrl:")) {
        // Insert before milestoneNames block
        content = content.replace(
            /(\n\s+milestoneNames:)/,
            `\n    backgroundImageUrl: "${webPath}",\n    backgroundDim: 0.30,\n    backgroundBlur: 30,$1`
        )
        changed = true
    }

    // 2. backgroundDim / backgroundBlur — add if missing
    if (!content.includes("backgroundDim:")) {
        content = content.replace(
            /(backgroundImageUrl:\s*"[^"]*",)/,
            `$1\n    backgroundDim: 0.30,\n    backgroundBlur: 30,`
        )
        changed = true
    }

    // 3. hasAnimatedElements — fix false → true, or add if missing
    if (/hasAnimatedElements:\s*false/.test(content)) {
        content = content.replace(/hasAnimatedElements:\s*false/, "hasAnimatedElements: true")
        changed = true
    } else if (!content.includes("hasAnimatedElements:")) {
        content = content.replace(
            /(backgroundImageUrl:\s*"[^"]*",)/,
            `hasAnimatedElements: true,\n    $1`
        )
        changed = true
    }

    // 4. particleColor — add after backgroundImageUrl if missing
    if (!content.includes("particleColor:")) {
        content = content.replace(
            /(backgroundImageUrl:\s*"[^"]*",)/,
            `$1\n    particleColor: "${color}",`
        )
        changed = true
    }

    if (changed) {
        fs.writeFileSync(themeFile, content, "utf8")
        console.log(`  [OK] Updated ${t.id}-theme.ts`)
    } else {
        console.log(`  [--] No change ${t.id}-theme.ts`)
    }
}

console.log("\n=== Done! ===")
console.log(`Images: ${OUT_DIR}`)
console.log(`Credits: ${CREDITS_FILE}`)
console.log("Run: npm --prefix seanime-web run build:desktop")
