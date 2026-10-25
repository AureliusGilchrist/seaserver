// Guards against the re-introduction of the bug that killed the player mid-episode
// (2026-10): number-input.tsx calling api.setValue() with a number from an effect. The zag
// number-input machine re-parses values through Intl.NumberFormat whenever formatOptions is
// set, and feeding it a number instead of a string crashes the whole React tree
// (TypeError: e.replace is not a function) — an uncaught render error unmounts the app, so
// playback died and the episode restarted before the still-watching prompt could appear.
//
// The controlled value must flow into the machine as a string via the `value` prop only.
// Run with `npm run test`.

import { readFileSync } from "node:fs"
import { join } from "node:path"

const file = join(process.cwd(), "src", "components", "ui", "number-input", "number-input.tsx")
const source = readFileSync(file, "utf8")

const BANNED = [
    // The exact crash: handing a number to the machine's setValue
    { re: /api\.setValue\s*\(/, why: "api.setValue() re-parses through Intl.NumberFormat; a number argument crashes the app. Pass values as strings via the `value` prop instead." },
]

// The value/dropdown props must be null-safe String conversions, never truthiness guards
// (0 is falsy and would silently fall through to defaultValue/undefined).
const REQUIRED = [
    { re: /controlledValue !== undefined && controlledValue !== null/, why: "the controlled `value` prop must be null-checked (not truthy-checked: 0 is falsy) before String()" },
]

let failed = false
// Strip comments first, so the guard below only sees executable code (the file documents
// the ban in a comment that names the banned call).
const code = source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
for (const { re, why } of BANNED) {
    if (re.test(code)) {
        failed = true
        console.error(`FAIL number-input.tsx contains ${re} — ${why}`)
    }
}
for (const { re, why } of REQUIRED) {
    if (!re.test(source)) {
        failed = true
        console.error(`FAIL number-input.tsx is missing ${re} — ${why}`)
    }
}

if (failed) process.exit(1)
console.log("number-input guard: no known crash patterns present")
