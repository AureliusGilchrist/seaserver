"""Replace a theme's achievementNames with a hand-written list.

Usage: python scripts/apply-achievement-names.py <theme-id> <names-file> [--check]

<names-file> has one `key|Name` per line. The script refuses the list unless it names every
achievement key exactly once, with no empty and no repeated names (case-insensitive) — every
achievement in a theme gets its own name. Only the "achievementNames" block of
seanime-themes/themes/<id>/theme.json is rewritten; the rest of the file (formatting, BOM) is kept.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES = ROOT / "seanime-themes" / "themes"
# The canonical key list: every key the full themes carry. 91-days is a full theme.
REFERENCE = THEMES / "91-days" / "theme.json"


def load(path: Path):
    raw = path.read_bytes()
    bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    return text, bom


def find_block(text: str):
    """Return (start, end) of the `{...}` after "achievementNames":, or None."""
    m = re.search(r'"achievementNames"\s*:\s*\{', text)
    if not m:
        return None
    i = m.end() - 1
    depth, in_str, esc = 0, False, False
    for j in range(i, len(text)):
        c = text[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i, j + 1
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check_only = "--check" in sys.argv
    if len(args) != 2:
        print(__doc__)
        sys.exit(2)
    theme_id, names_file = args
    target = THEMES / theme_id / "theme.json"

    ref_text, _ = load(REFERENCE)
    keys = list(json.loads(ref_text)["achievementNames"].keys())

    rows = []
    for n, line in enumerate(Path(names_file).read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        if "|" not in line:
            sys.exit(f"line {n}: expected key|Name: {line!r}")
        k, name = line.split("|", 1)
        rows.append((k.strip(), name.strip()))

    problems = []
    got = [k for k, _ in rows]
    for k, c in Counter(got).items():
        if c > 1:
            problems.append(f"key listed {c} times: {k}")
    missing = [k for k in keys if k not in set(got)]
    extra = [k for k in got if k not in set(keys)]
    if missing:
        problems.append(f"{len(missing)} keys missing: {', '.join(missing[:20])}")
    if extra:
        problems.append(f"{len(extra)} unknown keys: {', '.join(extra[:20])}")
    for k, name in rows:
        if not name:
            problems.append(f"empty name: {k}")
    for name, c in Counter(name.lower() for _, name in rows).items():
        if c > 1:
            problems.append(f"name used {c} times: {name}")
    # No name may be shared with another theme: each theme's names are its own.
    elsewhere = {}
    for other in THEMES.glob("*/theme.json"):
        if other.parent.name == theme_id:
            continue
        try:
            other_names = json.loads(load(other)[0]).get("achievementNames") or {}
        except ValueError:
            continue
        for v in other_names.values():
            elsewhere.setdefault(v.lower(), other.parent.name)
    for k, name in rows:
        if name.lower() in elsewhere:
            problems.append(f"{k}: '{name}' is already used by {elsewhere[name.lower()]}")
    if problems:
        print(f"{theme_id}: refused")
        for p in problems:
            print("  -", p)
        sys.exit(1)

    names = dict(rows)
    text, bom = load(target)
    block = find_block(text)
    if block is None:
        sys.exit(f"{target}: no achievementNames block")
    start, end = block

    # Match the indentation the file already uses for the block's members.
    line_start = text.rfind("\n", 0, start) + 1
    outer = re.match(r"[ \t]*", text[line_start:]).group(0)
    inner = outer + "  "
    body = ",\n".join(f"{inner}{json.dumps(k)}: {json.dumps(names[k], ensure_ascii=False)}" for k in keys)
    new_text = text[:start] + "{\n" + body + "\n" + outer + "}" + text[end:]

    json.loads(new_text)  # still valid JSON
    if check_only:
        print(f"{theme_id}: ok ({len(keys)} names)")
        return
    data = new_text.encode("utf-8")
    if bom:
        data = b"\xef\xbb\xbf" + data
    target.write_bytes(data)
    print(f"{theme_id}: wrote {len(keys)} names")


if __name__ == "__main__":
    main()
