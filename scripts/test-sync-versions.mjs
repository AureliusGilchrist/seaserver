// Checks the version bump rules in sync-versions.js.   node scripts/test-sync-versions.mjs
import assert from "node:assert/strict"
import { bumpVersion } from "../sync-versions.js"

const cases = [
    ["5.0.6-1", "test", "5.0.6-2"],
    ["5.0.6-15", "test", "5.0.6-16"], // the test suffix never carries
    ["5.0.6-3", "patch", "5.0.7-0"],
    ["5.0.6-3", "minor", "5.1.0-0"],
    ["5.0.15-2", "patch", "5.1.0-0"],
    ["5.15.15-0", "patch", "6.0.0-0"],
    ["5.15.3-4", "minor", "6.0.0-0"],
    ["5.0.6", "test", "5.0.6-1"], // no suffix reads as -0
]

for (const [from, kind, want] of cases) {
    assert.equal(bumpVersion(from, kind), want, `${from} ${kind}`)
}
assert.throws(() => bumpVersion("five", "test"))
console.log(`sync-versions: ${cases.length} bump cases pass`)
