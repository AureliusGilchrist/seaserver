import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { build } from "esbuild"
import { createBrowserHistory } from "@tanstack/react-router"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFile } from "node:fs/promises"

async function load(path) {
    const result = await build({ entryPoints: [path], bundle: true, format: "cjs", platform: "node", packages: "external", write: false })
    const module = { exports: {} }
    new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
    return module.exports
}

const { isCurrentRoute } = await load("src/lib/route-guard.ts")
function fakeWindow(href) {
    let url = new URL(href, "http://localhost")
    const listeners = new Map()
    const win = {
        location: {},
        history: {
            state: null, length: 1,
            pushState(state, _title, next) { this.state = state; if (next) url = new URL(next, url) },
            replaceState(state, _title, next) { this.state = state; if (next) url = new URL(next, url) },
        },
        addEventListener(name, callback) { listeners.set(name, callback) },
        removeEventListener(name) { listeners.delete(name) },
        pop(next, state) {
            url = new URL(next, url)
            this.history.state = state
            listeners.get("popstate")?.()
        },
    }
    for (const key of ["pathname", "search", "hash"]) Object.defineProperty(win.location, key, { get: () => url[key] })
    return win
}

for (const source of ["/entry?id=42", "/manga/entry?id=42", "/mediastream?id=42"]) {
    for (const destination of ["/anime", "/manga", "/schedule", "/settings", "/profile/user?id=7"]) {
        const win = fakeWindow(source)
        const history = createBrowserHistory({ window: win })
        const path = new URL(source, "http://localhost").pathname
        assert.ok(isCurrentRoute(history.location, path))
        history.push(destination)
        assert.equal(win.location.pathname, path)
        assert.equal(isCurrentRoute(history.location, path), false, `${source} -> ${destination}`)
        await Promise.resolve()
        history.destroy()
    }
}
assert.ok(isCurrentRoute({ pathname: "/entry/", search: "" }, "/entry"))
assert.ok(!isCurrentRoute({ pathname: "/entry", search: "?id=43" }, "/entry", "42"))
const win = fakeWindow("/entry?id=42")
const history = createBrowserHistory({ window: win })
history.replace("/entry?id=43")
assert.ok(!isCurrentRoute(history.location, "/entry", "42"))
assert.ok(isCurrentRoute(history.location, "/entry", "43"))
await Promise.resolve()
win.pop("/manga/entry?id=21", { __TSR_index: -1 })
assert.ok(!isCurrentRoute(history.location, "/entry"))
assert.ok(isCurrentRoute(history.location, "/manga/entry", "21"))
win.pop("/entry?id=43", { __TSR_index: 0 })
assert.ok(isCurrentRoute(history.location, "/entry", "43"))
history.destroy()

const { HomeBannerMetadataContent } = await load("src/app/(main)/_features/media/_components/home-banner-metadata.tsx")
const render = (media, type, info) => renderToStaticMarkup(React.createElement(HomeBannerMetadataContent, { media, type, info }))
const anime = render({ id: 1, format: "TV", episodes: 12, duration: 24, countryOfOrigin: "JP" }, "anime", {
    id: 1, status: "FINISHED", source: "MANGA", popularity: 1200, favourites: 300, trending: 42,
    studios: { edges: [{ isMain: true, node: { id: 1, name: "Example Studio" } }] },
    tags: [{ id: 1, name: "Adventure" }, { id: 2, name: "Secret", isMediaSpoiler: true }],
})
for (const value of ["TV Series", "Finished", "12 episodes", "24 min", "Japan", "From Manga", "1.2K members", "300 favourites", "42 trending", "Example Studio", "Adventure"]) assert.ok(anime.includes(value), value)
assert.ok(!anime.includes("Secret"))
const manga = render({ id: 2, format: "MANGA", chapters: 30, volumes: 3 }, "manga", {
    id: 2, staff: { edges: [{ role: "Story & Art", node: { id: 2, name: { full: "Example Creator" } } }] },
})
for (const value of ["Manga", "30 ch", "3 vol", "Example Creator"]) assert.ok(manga.includes(value), value)
assert.ok(!render({ id: 3 }, "manga").includes("members"))
const { HomeSections } = await load("src/app/(main)/_features/home/home-sections.tsx")
const sections = renderToStaticMarkup(React.createElement(HomeSections, {
    items: [
        { id: "anime", type: "anime-continue-watching" },
        { id: "manga", type: "manga-continue-reading" },
        { id: "title", type: "centered-title" },
    ],
    renderItem: () => React.createElement("span", null, "content"),
}))
for (const id of ["anime", "manga"]) {
    assert.match(sections, new RegExp(`<section[^>]*data-home-section="${id}"[^>]*backdrop-blur-md`))
}
assert.doesNotMatch(sections, /<section[^>]*data-home-section="title"[^>]*backdrop-blur-md/)
const { countLists } = await load("src/app/(main)/_features/home/list-insights.ts")
assert.equal(countLists(undefined), null)
const stableCollection = { MediaListCollection: { lists: [{ status: "CURRENT", entries: [{ media: { id: 8 }, progress: 5 }] }] } }
assert.strictEqual(countLists(stableCollection), countLists(stableCollection))
assert.notStrictEqual(countLists(stableCollection), countLists({ ...stableCollection }))
const { resolveLibraryResponse } = await load("src/api/hooks/library-collection-compact.ts")
const fullLibrary = { lists: [] }
const initialLibrary = resolveLibraryResponse({ fingerprint: "one", unchanged: false, collection: fullLibrary }, null, "profile-1")
assert.strictEqual(initialLibrary.collection, fullLibrary)
assert.strictEqual(resolveLibraryResponse({ fingerprint: "one", unchanged: true }, initialLibrary.snapshot, "profile-1").collection, fullLibrary)
assert.throws(() => resolveLibraryResponse({ fingerprint: "one", unchanged: true }, initialLibrary.snapshot, "profile-2"))
assert.throws(() => resolveLibraryResponse({ fingerprint: "other", unchanged: true }, initialLibrary.snapshot, "profile-1"))
assert.throws(() => resolveLibraryResponse({ fingerprint: "one", unchanged: false }, null, "profile-1"))
assert.deepEqual(resolveLibraryResponse(fullLibrary, null, "profile-1"), { collection: fullLibrary, snapshot: null })
assert.deepEqual(countLists({ MediaListCollection: {} }), { onLists: 0, planning: 0, current: 0, completed: 0, progress: 0 })
assert.deepEqual(countLists({ MediaListCollection: { lists: [
    { entries: [{ media: { id: 1 }, progress: 3 }] },
    { status: "CURRENT", entries: [{ media: { id: 1 }, progress: 3 }] },
    { status: "REPEATING", entries: [{ media: { id: 2 }, progress: 4 }] },
    { status: "COMPLETED", entries: [{ media: { id: 3 }, progress: 12 }] },
    { status: "PLANNING", entries: [{ media: { id: 4 }, progress: 5 }, { media: { id: 4 }, progress: 5 }] },
] } }), { onLists: 4, planning: 1, current: 2, completed: 1, progress: 24 })
const landing = await readFile("src/app/(main)/_features/home/landing-hub.tsx", "utf8")
assert.ok(landing.indexOf("<LandingLibraryInsightsWidget />") > landing.indexOf("data-landing-hero"))
assert.ok(landing.indexOf("<LandingLibraryInsightsWidget />") < landing.indexOf("{/* Whatever was being watched */}"))
assert.match(landing, /w\.id !== "library-insights"/)
for (const link of ["anime", "manga", "discover", "schedule", "lists"]) assert.ok(landing.includes(`"${link}"`))
const insights = await readFile("src/app/(main)/_features/home/landing-widget-views.tsx", "utf8")
assert.match(insights, /useGetRawAnimeCollection\(!!profile\?\.id, profile\?\.id\)/)
assert.match(insights, /useGetRawAnilistMangaCollection\(!!profile\?\.id, profile\?\.id\)/)
assert.doesNotMatch(insights, /not counting planning/)
const mediumInsights = await readFile("src/app/(main)/_features/home/medium-home-insights.tsx", "utf8")
for (const label of ["Titles in library", "Watching", "Completed", "Episodes watched", "Local anime files", "Library size", "Missing episodes", "Titles in collection", "Reading", "Chapters read", "Downloaded chapters", "Download size"]) {
    assert.ok(mediumInsights.includes(`label: "${label}"`), label)
}
assert.match(mediumInsights, /useGetProfileMissingEpisodes/)
assert.doesNotMatch(mediumInsights, /anilistAuthenticated|excluding planning/)
assert.equal((mediumInsights.match(/label: "Planning"/g) ?? []).length, 2)
assert.doesNotMatch(mediumInsights, /useGetMissingEpisodes\(|useMissingEpisodeCount\(/)
const animeHome = await readFile("src/app/(main)/(library)/_home/home-screen.tsx", "utf8")
assert.equal((animeHome.match(/<AnimeHomeInsights \/>/g) ?? []).length, 2)
assert.ok(animeHome.indexOf("<AnimeHomeInsights />", animeHome.indexOf("data-home-screen className")) > animeHome.indexOf("<LibraryHeader"))
const mangaHome = await readFile("src/app/(main)/manga/page.tsx", "utf8")
assert.ok(mangaHome.indexOf("<MangaHomeInsights />") < mangaHome.indexOf("<HomeSections"))
const community = await readFile("src/app/(main)/_features/community/community-home-section.tsx", "utf8")
assert.doesNotMatch(community, /backdrop-blur-2xl/)
console.log("home banners and pending navigation: all checks pass")
