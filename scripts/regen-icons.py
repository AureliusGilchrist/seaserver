#!/usr/bin/env python3
"""Regenerate every application icon from the Eternity Server emblem PNG.

- Resizes the master PNG (seanime-web/public/eternity-emblem.png) to each required size.
- Packs Windows .ico and macOS .icns containers.
- Regenerates the Go byte-array sources (internal/icon/iconwin.go, iconunix.go).
"""
import io
import os
import struct
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PNG_PATH = os.path.join(ROOT, "seanime-web", "public", "eternity-emblem.png")


def render(size: int, black: bool = False) -> Image.Image:
    """Resize the emblem to `size`x`size`; optionally as a black silhouette (macOS template)."""
    im = Image.open(PNG_PATH).convert("RGBA")
    im = im.resize((size, size), Image.LANCZOS)
    if black:
        # White-on-black artwork: use luminance as the alpha of a black fill.
        lum = im.convert("L")
        im = Image.new("RGBA", (size, size), (0, 0, 0, 255))
        im.putalpha(lum)
    return im


def write_icns(imgs: dict, path: str) -> None:
    """Pack PNGs into an .icns container (PNG-based chunk types only)."""
    types = [(16, "icp4"), (32, "icp5"), (64, "icp6"), (128, "ic07"), (256, "ic08"), (512, "ic09"), (1024, "ic10")]
    chunks = b""
    for size, code in types:
        if size not in imgs:
            continue
        b = io.BytesIO()
        imgs[size].save(b, "PNG")
        data = b.getvalue()
        chunks += code.encode("ascii") + struct.pack(">I", len(data)) + data
    with open(path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)


def write_ico(imgs: list, path: str) -> None:
    """Pack PNGs (with embedded PNG payloads) into a Windows .ico."""
    png_blobs = []
    for im in imgs:
        b = io.BytesIO()
        im.save(b, "PNG")
        png_blobs.append((im.size[0], b.getvalue()))
    header = struct.pack("<HHH", 0, 1, len(png_blobs))
    offset = 6 + 16 * len(png_blobs)
    entries = b""
    data = b""
    for w, blob in png_blobs:
        entries += struct.pack("<BBBBHHII", w % 256, w % 256, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
        data += blob
    with open(path, "wb") as f:
        f.write(header + entries + data)


def write_go_array(data: bytes, path: str, build_tag: str, go_build_tag: str, header: str) -> None:
    """Write a 2goarray-compatible Go source file."""
    lines = [f"//go:build {go_build_tag}", f"// +build {build_tag}", "", header, "", "package icon", "", "var Data []byte = []byte{"]
    row = []
    for i, b in enumerate(data):
        row.append(f"0x{b:02x}")
        if len(row) == 12:
            lines.append("\t" + ", ".join(row) + ",")
            row = []
    if row:
        lines.append("\t" + ", ".join(row) + ",")
    lines.append("}")
    with open(path, "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def main() -> None:
    master_1024 = render(1024)
    master_black_18 = render(18, black=True)

    def sized(size: int) -> Image.Image:
        return master_1024.resize((size, size), Image.LANCZOS)

    # -- Web (seanime-web/public) ------------------------------------------
    web_icons = os.path.join(ROOT, "seanime-web", "public", "icons")
    sized(16).save(os.path.join(web_icons, "favicon-16x16.png"))
    sized(32).save(os.path.join(web_icons, "favicon-32x32.png"))
    sized(180).save(os.path.join(web_icons, "apple-icon.png"))
    sized(180).save(os.path.join(web_icons, "apple-touch-icon.png"))
    sized(192).save(os.path.join(web_icons, "android-chrome-192x192.png"))
    sized(512).save(os.path.join(web_icons, "android-chrome-512x512.png"))
    write_ico([sized(16), sized(32), sized(48), sized(64), sized(128), sized(256)],
              os.path.join(web_icons, "favicon.ico"))
    sized(439).save(os.path.join(ROOT, "seanime-web", "public", "seanime-logo.png"))

    # -- Go server (internal/icon) ------------------------------------------
    go_icon = os.path.join(ROOT, "internal", "icon")
    sized(439).save(os.path.join(go_icon, "logo.png"))
    sized(180).save(os.path.join(go_icon, "icon.png"))
    ico_sizes = [sized(s) for s in (16, 24, 32, 48, 64, 128, 256)]
    ico_path = os.path.join(go_icon, "iconwin.ico")
    write_ico(ico_sizes, ico_path)
    with open(ico_path, "rb") as f:
        ico_bytes = f.read()
    with open(os.path.join(go_icon, "icon.png"), "rb") as f:
        png_bytes = f.read()
    write_go_array(ico_bytes, os.path.join(go_icon, "iconwin.go"), "windows", "windows",
                   "// File generated from iconwin.ico -- see make_icon.bat")
    write_go_array(png_bytes, os.path.join(go_icon, "iconunix.go"), "linux darwin", "linux || darwin",
                   "// File generated from icon.png -- see make_icon.sh")

    # -- Electron client (seanime-denshi/assets) ----------------------------
    denshi = os.path.join(ROOT, "seanime-denshi", "assets")
    for s in (16, 18, 24, 32, 48, 64, 128, 256, 512, 1024):
        sized(s).save(os.path.join(denshi, f"{s}x{s}.png"))
    sized(439).save(os.path.join(denshi, "icon.png"))
    master_black_18.save(os.path.join(denshi, "iconTemplate.png"))
    write_ico(ico_sizes, os.path.join(denshi, "icon.ico"))
    write_icns({s: sized(s) for s in (16, 32, 64, 128, 256, 512, 1024)},
               os.path.join(denshi, "icon.icns"))

    print("icons regenerated")


if __name__ == "__main__":
    sys.exit(main())
