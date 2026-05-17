/**
 * Gojuuon-style sorting helpers for romaji titles.
 *
 * The user's mental model: sort by the first character; titles starting with
 * the same row (e.g. all "k…") group together; within that group, sort by the
 * next character relative to the gojuuon rows; and so on, character by
 * character. This file produces a canonical sort key for any romaji string so
 * a plain string comparison reproduces that ordering.
 *
 * No server scan needed — works the moment you switch to Gojuuon sorting.
 */

// Gojuuon row index for each ASCII letter. Lower index = earlier in sort.
//   0  vowels (a, i, u, e, o)
//   1  k
//   2  s
//   3  t
//   4  n  (also ん)
//   5  h / f
//   6  m
//   7  y
//   8  r / l
//   9  w
//  10  g
//  11  z / j
//  12  d
//  13  b
//  14  p
//  15  anything else (digits, symbols, etc. — sorted last)
const LETTER_ROW: Record<string, number> = {
    a: 0, i: 0, u: 0, e: 0, o: 0,
    k: 1,
    s: 2,
    t: 3,
    n: 4,
    h: 5, f: 5,
    m: 6,
    y: 7,
    r: 8, l: 8,
    w: 9,
    g: 10,
    z: 11, j: 11,
    d: 12,
    b: 13,
    p: 14,
}

function rowFor(ch: string): number {
    const row = LETTER_ROW[ch]
    return row === undefined ? 15 : row
}

/**
 * Strip common leading articles/punctuation so titles like "The Idolm@ster" sort
 * by their meaningful first character ("i"), not by "t".
 */
function normalizeForSort(raw: string): string {
    let s = (raw || "").toLowerCase()
    // Strip leading non-letter/digit characters (quotes, punctuation, brackets).
    s = s.replace(/^[^a-z0-9]+/i, "")
    // Strip a leading english article so e.g. "The Quintessential…" lands under
    // "Q" — matches how most fans look for titles.
    s = s.replace(/^(the|a|an)\s+/i, "")
    return s.trim()
}

/**
 * Convert a single character into two sort-key bytes: the row index (00-15)
 * followed by the character itself as a secondary tiebreaker. Two characters
 * in the same row sort by their natural code-point order (so "ka" < "ki" <
 * "ku" < "ke" < "ko" within the k-row).
 */
function charToKey(ch: string): string {
    // Pad row to 2 hex chars so it sorts lexicographically and never overflows.
    const row = rowFor(ch).toString(16).padStart(2, "0")
    return row + ch
}

/**
 * Build a stable sort key for a romaji title. Plain `localeCompare` on the
 * resulting strings produces gojuuon order character-by-character.
 *
 * Examples (rows shown in brackets):
 *   "Akira"      → [0]a [0]k... well, we walk each character; first row 0
 *                  (a), then row 1 (k), then 0 (i), 8 (r), 0 (a).
 *   "Kuroko"     → row 1, then 0, 8, 0, 1, 0 — clusters with all k-words.
 *   "The Quint…" → article stripped → "quint…" → row 15 (q falls to misc).
 */
export function gojuuonSortKey(raw: string): string {
    const s = normalizeForSort(raw)
    if (!s) return "ff" // unknown → after everything (row 15 max)
    let out = ""
    for (const ch of s) {
        out += charToKey(ch)
    }
    return out
}
