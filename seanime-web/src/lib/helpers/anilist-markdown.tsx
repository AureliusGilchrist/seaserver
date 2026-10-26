import { cn } from "@/components/ui/core/styling"
import React from "react"

/**
 * AniList descriptions are a small markdown dialect: `~!spoiler!~`, `__bold__`, `_italic_`,
 * `**bold**`, `*italic*`, `[text](url)`, `<br>`, and blank-line paragraphs. Character pages also
 * open with fact lines such as `__Height:__ 170 cm`, which read better as tiles than as prose.
 *
 * This renders that dialect to React elements (no HTML injection) and pulls the leading fact lines
 * out separately.
 */

export type AnilistFact = { label: string, value: string }

/** Splits a description into its leading `__Key:__ value` fact lines and the prose after them. */
export function extractAnilistFacts(description: string | undefined | null): { facts: AnilistFact[], body: string } {
    const text = normalize(description ?? "")
    const facts: AnilistFact[] = []
    const lines = text.split("\n")
    let i = 0
    for (; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) {
            if (facts.length) continue
            continue
        }
        // __Key:__ value  |  **Key:** value  |  __Key__: value
        const m = line.match(/^(?:__|\*\*)([^_*:\n]{1,40}?)(?::(?:__|\*\*)|(?:__|\*\*):)\s*(.+)$/)
        if (!m) break
        // A spoiler fact stays in the prose, where it can be hidden.
        if (m[2].includes("~!")) break
        facts.push({ label: m[1].trim(), value: stripInline(m[2].trim()) })
    }
    const body = lines.slice(i).join("\n").trim()
    return { facts, body }
}

function normalize(s: string) {
    return s
        .replace(/\r\n/g, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#039;/g, "'")
        .replace(/<\/?(?:p|div|span|i|b|em|strong)[^>]*>/gi, "")
}

function stripInline(s: string) {
    return s.replace(/(__|\*\*)(.+?)\1/g, "$2").replace(/(^|\W)[_*](.+?)[_*](?=\W|$)/g, "$1$2").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
}

/** Renders AniList description markdown. Spoilers are blurred until clicked. */
export function AnilistMarkdown({ text, className }: { text: string | undefined | null, className?: string }) {
    const paragraphs = React.useMemo(() => normalize(text ?? "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean), [text])
    return (
        <div className={cn("space-y-3", className)}>
            {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line">{renderInline(p, `p${i}`)}</p>
            ))}
        </div>
    )
}

function renderInline(text: string, key: string): React.ReactNode[] {
    const out: React.ReactNode[] = []
    // Order matters: spoilers can contain the rest.
    const re = /~!([\s\S]+?)!~|(__|\*\*)([\s\S]+?)\2|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<![\w])_([^_\n]+?)_(?![\w])|(?<![\w*])\*([^*\n]+?)\*(?![\w*])/g
    let last = 0
    let m: RegExpExecArray | null
    let n = 0
    while ((m = re.exec(text))) {
        if (m.index > last) out.push(text.slice(last, m.index))
        const k = `${key}-${n++}`
        if (m[1] !== undefined) out.push(<Spoiler key={k}>{renderInline(m[1], k)}</Spoiler>)
        else if (m[3] !== undefined) out.push(<strong key={k} className="font-semibold text-white">{renderInline(m[3], k)}</strong>)
        else if (m[4] !== undefined) out.push(
            <a key={k} href={m[5]} target="_blank" rel="noreferrer noopener" className="text-brand-300 underline-offset-2 hover:underline">{m[4]}</a>,
        )
        else if (m[6] !== undefined) out.push(<em key={k}>{renderInline(m[6], k)}</em>)
        else if (m[7] !== undefined) out.push(<em key={k}>{renderInline(m[7], k)}</em>)
        last = re.lastIndex
    }
    if (last < text.length) out.push(text.slice(last))
    return out
}

export function Spoiler({ children, className }: { children: React.ReactNode, className?: string }) {
    const [shown, setShown] = React.useState(false)
    return (
        <span
            role="button"
            tabIndex={0}
            title={shown ? undefined : "Spoiler: click to reveal"}
            onClick={() => setShown(true)}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") setShown(true)
            }}
            className={cn(
                "rounded px-0.5 transition-[filter,background-color] duration-300",
                shown ? "bg-white/[0.04]" : "cursor-pointer select-none bg-white/10 blur-[5px] hover:blur-[4px]",
                className,
            )}
        >
            {children}
        </span>
    )
}
