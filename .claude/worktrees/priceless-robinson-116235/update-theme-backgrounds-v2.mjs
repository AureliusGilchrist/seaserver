#!/usr/bin/env node
// update-theme-backgrounds-v2.mjs
// Re-downloads only missing theme backgrounds using corrected wallhaven API params.
// Run from: E:\Main\seaserver
// Usage: node update-theme-backgrounds-v2.mjs

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

// categories: "111" = general + anime + people (all)
// sorting: "views"  = most viewed (no topRange needed)
// purity: "100"     = SFW only
const themes = [
    { id: "naruto",                  q: "naruto"               },
    { id: "bleach",                  q: "bleach"               },
    { id: "one-piece",               q: "one piece"            },
    { id: "dragon-ball-z",           q: "dragon ball"          },
    { id: "attack-on-titan",         q: "attack on titan"      },
    { id: "my-hero-academia",        q: "my hero academia"     },
    { id: "demon-slayer",            q: "demon slayer"         },
    { id: "jujutsu-kaisen",          q: "jujutsu kaisen"       },
    { id: "fullmetal-alchemist",     q: "fullmetal alchemist"  },
    { id: "hunter-x-hunter",         q: "hunter x hunter"      },
    { id: "black-clover",            q: "black clover"         },
    { id: "fairy-tail",              q: "fairy tail"           },
    { id: "sword-art-online",        q: "sword art online"     },
    { id: "death-note",              q: "death note"           },
    { id: "code-geass",              q: "code geass"           },
    { id: "tokyo-ghoul",             q: "tokyo ghoul"          },
    { id: "mob-psycho-100",          q: "mob psycho"           },
    { id: "one-punch-man",           q: "one punch man"        },
    { id: "re-zero",                 q: "re zero"              },
    { id: "konosuba",                q: "konosuba"             },
    { id: "mushoku-tensei",          q: "mushoku tensei"       },
    { id: "slime-isekai",            q: "tensura slime"        },
    { id: "overlord",                q: "overlord ainz"        },
    { id: "your-name",               q: "kimi no na wa"        },
    { id: "violet-evergarden",       q: "violet evergarden"    },
    { id: "toradora",                q: "toradora"             },
    { id: "spy-x-family",            q: "spy x family"         },
    { id: "bocchi-the-rock",         q: "bocchi the rock"      },
    { id: "evangelion",              q: "evangelion"           },
    { id: "steins-gate",             q: "steins gate"          },
    { id: "cowboy-bebop",            q: "cowboy bebop"         },
    { id: "psycho-pass",             q: "psycho pass"          },
    { id: "ghost-in-the-shell",      q: "ghost in the shell"   },
    { id: "berserk",                 q: "berserk guts"         },
    { id: "vinland-saga",            q: "vinland saga"         },
    { id: "chainsaw-man",            q: "chainsaw man"         },
    { id: "made-in-abyss",           q: "made in abyss"        },
    { id: "parasyte",                q: "parasyte"             },
    { id: "haikyuu",                 q: "haikyuu"              },
    { id: "frieren",                 q: "frieren"              },
    { id: "dandadan",                q: "dandadan"             },
    { id: "dr-stone",                q: "dr stone"             },
    { id: "fire-force",              q: "fire force"           },
    { id: "solo-leveling",           q: "solo leveling"        },
    { id: "tower-of-god",            q: "tower of god"         },
    { id: "vagabond",                q: "vagabond manga"       },
    { id: "20th-century-boys",       q: "20th century boys"    },
    { id: "monster",                 q: "monster urasawa"      },
    { id: "goodnight-punpun",        q: "punpun"               },
    { id: "slam-dunk",               q: "slam dunk"            },
    { id: "akira",                   q: "akira otomo"          },
    { id: "gantz",                   q: "gantz"                },
    { id: "dorohedoro",              q: "dorohedoro"           },
    { id: "serial-experiments-lain", q: "serial experiments lain" },
    { id: "trigun",                  q: "trigun"               },
    { id: "rurouni-kenshin",         q: "rurouni kenshin"      },
    { id: "sailor-moon",             q: "sailor moon"          },
    { id: "cardcaptor-sakura",       q: "cardcaptor sakura"    },
    { id: "inuyasha",                q: "inuyasha"             },
    { id: "yuyu-hakusho",            q: "yu yu hakusho"        },
    { id: "initial-d",               q: "initial d"            },
    { id: "ranma-12",                q: "ranma"                },
    { id: "revolutionary-girl-utena",q: "utena"                },
    { id: "outlaw-star",             q: "outlaw star"          },
    { id: "great-teacher-onizuka",   q: "gto onizuka"          },
    { id: "perfect-blue",            q: "perfect blue"         },
    { id: "princess-mononoke",       q: "princess mononoke"    },
    { id: "spirited-away",           q: "spirited away"        },
    { id: "lupin-iii",               q: "lupin"                },
    { id: "grave-of-the-fireflies",  q: "grave of the fireflies" },
    { id: "samurai-champloo",        q: "samurai champloo"     },
    { id: "flcl",                    q: "flcl"                 },
    { id: "gurren-lagann",           q: "gurren lagann"        },
    { id: "haruhi-suzumiya",         q: "haruhi suzumiya"      },
    { id: "elfen-lied",              q: "elfen lied"           },
    { id: "clannad",                 q: "clannad"              },
    { id: "angel-beats",             q: "angel beats"          },
    { id: "nana",                    q: "nana anime"           },
    { id: "escaflowne",              q: "escaflowne"           },
    { id: "claymore",                q: "claymore"             },
    { id: "mirai-nikki",             q: "mirai nikki"          },
    { id: "higurashi",               q: "higurashi"            },
    { id: "record-of-lodoss-war",    q: "lodoss"               },
    { id: "no-game-no-life",         q: "no game no life"      },
    { id: "fate-grand-order",        q: "fate grand order"     },
    { id: "tokyo-ghoul-re",          q: "tokyo ghoul re"       },
    { id: "blue-lock",               q: "blue lock"            },
    { id: "kingdom",                 q: "kingdom manga"        },
    { id: "blame",                   q: "blame nihei"          },
    { id: "junji-ito",               q: "junji ito"            },
    { id: "uzumaki",                 q: "uzumaki"              },
    { id: "pluto",                   q: "pluto urasawa"        },
    { id: "battle-angel-alita",      q: "gunnm alita"          },
    { id: "blade-of-the-immortal",   q: "blade immortal"       },
    { id: "hellsing",                q: "hellsing"             },
    { id: "homunculus",              q: "homunculus manga"     },
    { id: "holyland",                q: "holyland manga"       },
    { id: "berserk-of-gluttony",     q: "berserk of gluttony"  },
]

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url)
        const lib = u.protocol === "https:" ? https : http
        const req = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }, res => {
            let data = ""
            res.on("data", chunk => (data += chunk))
            res.on("end", () => {
                if (res.statusCode === 429) { reject(new Error("RATE_LIMITED")) ; return }
                try { resolve(JSON.parse(data)) }
                catch (e) { reject(new Error("JSON_PARSE_ERROR: " + data.slice(0, 100))) }
            })
        })
        req.on("error", reject)
        req.setTimeout(15000, () => { req.destroy(); reject(new Error("TIMEOUT")) })
    })
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const u = new URL(url)
        const lib = u.protocol === "https:" ? https : http
        const file = fs.createWriteStream(dest)
        const req = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close(); try { fs.unlinkSync(dest) } catch {}
                return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
            }
            if (res.statusCode !== 200) {
                file.close(); try { fs.unlinkSync(dest) } catch {}
                return reject(new Error(`HTTP ${res.statusCode}`))
            }
            res.pipe(file)
            file.on("finish", () => file.close(resolve))
        })
        req.on("error", e => { try { fs.unlinkSync(dest) } catch {} reject(e) })
        req.setTimeout(60000, () => { req.destroy(); reject(new Error("DOWNLOAD_TIMEOUT")) })
    })
}

// ─── Load existing credits ────────────────────────────────────────────────────
const existingCredits = fs.existsSync(CREDITS_FILE)
    ? fs.readFileSync(CREDITS_FILE, "utf8")
    : ""

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

// ─── Download phase ────────────────────────────────────────────────────────────
const results = {}
console.log("\n=== Downloading missing theme backgrounds ===\n")

let retryDelay = 2000

for (const t of themes) {
    // Skip if a file already exists for this theme
    const existing = ["jpg","jpeg","png","webp"].map(e => path.join(OUT_DIR, `${t.id}.${e}`)).find(f => fs.existsSync(f))
    if (existing) {
        const ext = path.extname(existing)
        results[t.id] = { webPath: `/themes/${t.id}${ext}`, imgUrl: "(cached)", uploader: "(cached)" }
        console.log(`  [==] ${t.id} (already downloaded)`)
        continue
    }

    const params = new URLSearchParams({
        q: t.q,
        categories: "111",
        purity: "100",
        sorting: "views",
        order: "desc",
        atleast: "1920x1080",
    })
    const apiUrl = `${API_BASE}?${params.toString()}`

    let attempt = 0
    let success = false
    while (attempt < 3 && !success) {
        attempt++
        try {
            const resp = await fetchJson(apiUrl)
            const data = resp.data ?? []
            if (data.length === 0) {
                console.warn(`  [--] ${t.id}: 0 results`)
                results[t.id] = { webPath: "", imgUrl: "", uploader: "" }
                success = true
                break
            }

            // Pick the best landscape image (prefer 16:9 or wider)
            let img = data[0]
            for (const candidate of data.slice(0, 5)) {
                if (candidate.dimension_x >= 1920 && candidate.dimension_y <= candidate.dimension_x) {
                    img = candidate; break
                }
            }

            const imgUrl   = img.path
            const uploader = img?.uploader?.username ?? "unknown"
            const ext      = path.extname(new URL(imgUrl).pathname) || ".jpg"
            const localDest = path.join(OUT_DIR, `${t.id}${ext}`)
            const webPath   = `/themes/${t.id}${ext}`

            await downloadFile(imgUrl, localDest)
            results[t.id] = { webPath, imgUrl, uploader }

            creditsLines.push(`${t.id.padEnd(30)}  ${imgUrl}`)
            creditsLines.push(`${"".padEnd(30)}  Uploader: @${uploader}  https://wallhaven.cc/user/${uploader}`)
            creditsLines.push("")

            console.log(`  [OK] ${t.id}  (${uploader})  ${img.dimension_x}x${img.dimension_y}`)
            success = true
            retryDelay = 2000  // reset after success
        } catch (err) {
            if (err.message === "RATE_LIMITED") {
                retryDelay = Math.min(retryDelay * 2, 30000)
                console.warn(`  [!!] ${t.id}: rate limited — waiting ${retryDelay/1000}s then retry ${attempt}/3`)
                await sleep(retryDelay)
            } else {
                console.warn(`  [!!] ${t.id}: ${err.message}`)
                results[t.id] = { webPath: "", imgUrl: "", uploader: "" }
                success = true
            }
        }
    }
    if (!success) {
        console.warn(`  [!!] ${t.id}: gave up after 3 attempts`)
        results[t.id] = { webPath: "", imgUrl: "", uploader: "" }
    }

    await sleep(1500)  // 1.5s between requests
}

fs.writeFileSync(CREDITS_FILE, creditsLines.join("\n"), "utf8")
console.log(`\nCredit file written: ${CREDITS_FILE}`)

// ─── Update backgroundImageUrl in theme files ──────────────────────────────
console.log("\n=== Updating backgroundImageUrl in theme files ===\n")

for (const t of themes) {
    const r = results[t.id]
    if (!r || !r.webPath || r.webPath === "") continue
    if (r.uploader === "(cached)") continue  // already set from a previous run, skip if already correct

    const themeFile = path.join(THEMES_DIR, `${t.id}-theme.ts`)
    if (!fs.existsSync(themeFile)) continue

    let content = fs.readFileSync(themeFile, "utf8")
    const before = content

    content = content.replace(/backgroundImageUrl:\s*"[^"]*"/, `backgroundImageUrl: "${r.webPath}"`)

    if (content !== before) {
        fs.writeFileSync(themeFile, content, "utf8")
        console.log(`  [OK] ${t.id}-theme.ts -> ${r.webPath}`)
    }
}

// Summary
const downloaded = Object.values(results).filter(r => r.webPath && r.uploader !== "(cached)").length
const cached     = Object.values(results).filter(r => r.uploader === "(cached)").length
const failed     = Object.values(results).filter(r => !r.webPath).length

console.log(`\n=== Done! ===`)
console.log(`  Downloaded: ${downloaded}`)
console.log(`  Already cached: ${cached}`)
console.log(`  Failed/no results: ${failed}`)
console.log(`  Images: ${OUT_DIR}`)
console.log(`  Credits: ${CREDITS_FILE}`)
