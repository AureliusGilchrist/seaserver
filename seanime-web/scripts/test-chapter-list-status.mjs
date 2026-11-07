import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { build } from "esbuild"

async function load(path) {
    const result = await build({ entryPoints: [path], bundle: true, format: "cjs", platform: "node", packages: "external", write: false })
    const module = { exports: {} }
    new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
    return module.exports
}

const { getChapterListStatus } = await load("src/app/(main)/manga/_lib/chapter-list-status.ts")
const base = { busy: false, hasData: false, hasError: false, chapterCount: 0, downloadedCount: 0, hasSources: true, hasProvider: true }
const status = over => getChapterListStatus({ ...base, ...over })

// Not asked yet, or still asking: loading, never "no chapters".
assert.equal(status({}), "loading", "provider chosen, request not answered")
assert.equal(status({ hasProvider: false }), "loading", "source still being chosen")
assert.equal(status({ busy: true, chapterCount: 5, hasData: true }), "loading", "a reload in flight")
// Answers.
assert.equal(status({ hasData: true, chapterCount: 162 }), "ready")
assert.equal(status({ hasData: true }), "empty", "the source found nothing")
assert.equal(status({ hasError: true }), "error")
// Downloaded chapters stand in once the source has failed or found nothing — not before.
assert.equal(status({ hasError: true, downloadedCount: 40 }), "fallback")
assert.equal(status({ hasData: true, downloadedCount: 40 }), "fallback")
assert.equal(status({ downloadedCount: 40 }), "loading", "the source has not answered yet")
assert.equal(status({ hasData: true, chapterCount: 10, downloadedCount: 40 }), "ready", "the source's list wins")
// No sources at all is its own answer, not an endless skeleton.
assert.equal(status({ hasSources: false, hasProvider: false }), "no-sources")
console.log("chapter list status: all checks pass")
