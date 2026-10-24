// Verifies the TypeScript extractEpisodeNumber against the shared fixture in
// internal/unmatched/testdata/episode_number_cases.json — the same cases the Go copy is tested
// with, so the two implementations cannot quietly disagree. Run with `npm run test`.
import { build } from "esbuild"
import { readFileSync } from "node:fs"
import { join, relative, dirname, resolve } from "node:path"

// npm run always starts at the package root, so relative paths from there are stable.
const webRoot = process.cwd()
const repoRoot = dirname(webRoot)

const fixturePath = join(repoRoot, "internal", "unmatched", "testdata", "episode_number_cases.json")
const cases = JSON.parse(readFileSync(fixturePath, "utf8").replace(/^﻿/, ""))
if (!Array.isArray(cases) || cases.length === 0) {
    console.error(`episode-number fixture is empty: ${relative(repoRoot, fixturePath)}`)
    process.exit(1)
}

// The parser lives in the app source; esbuild strips its types so plain node can run it.
const result = await build({
    entryPoints: [join(webRoot, "src", "app", "(main)", "unmatched", "_lib", "unmatched-episode-number.ts")],
    bundle: true,
    format: "esm",
    write: false,
})
const bundled = result.outputFiles[0].text.replace("export {", "return {")
const { extractEpisodeNumber } = new Function(`${bundled}`)()
if (typeof extractEpisodeNumber !== "function") {
    console.error("could not load extractEpisodeNumber from unmatched-episode-number.ts")
    process.exit(1)
}

let failed = 0
for (const c of cases) {
    // The Go copy answers 0 when no episode can be read; this copy answers null. Same meaning,
    // so the fixture holds the Go convention and the check maps between them.
    const got = extractEpisodeNumber(c.filename) ?? 0
    if (got !== c.expected) {
        failed++
        console.error(`FAIL ${c.name}\n  ${c.filename}\n  got ${got}, want ${c.expected}`)
    }
}

if (failed) {
    console.error(`\n${failed} of ${cases.length} episode-number cases failed — the Go and TypeScript copies have drifted.`)
    process.exit(1)
}
console.log(`episode-number lockstep: ${cases.length} cases agree with the Go copy`)
