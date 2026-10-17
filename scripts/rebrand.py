#!/usr/bin/env python3
"""Rebrand visible 'Seanime' strings to 'Deus Ex Aeternae' in whitelisted files.

- 'Seanime Denshi' (desktop client references) becomes 'Seaserver Denshi'.
- Code identifiers (headers, cookies, settings keys, component names, paths) are protected.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

APP = "Deus Ex Aeternae"

WEB_SRC = os.path.join(ROOT, "seanime-web", "src")

# Files with visible strings to rebrand (paths relative to repo root), excluding
# comment-only or identifier-only files.
WEB_FILES = [
    "src/main.tsx",
    "src/app/splashscreen/page.tsx",
    "src/app/public/auth/server-auth.tsx",
    "src/app/layout.tsx",
    "src/app/manifest.ts",
    "src/app/(main)/entry/_containers/synthetic-anime-entry-page.tsx",
    "src/app/(main)/entry/_containers/anime-entry-page.tsx",
    "src/app/(main)/entry/_containers/entry-actions/anime-entry-download-files-modal.tsx",
    "src/app/(main)/entry/_containers/episode-list/episode-item.tsx",
    "src/app/(main)/entry/_containers/episode-list/episode-section.tsx",
    "src/app/(main)/entry/_containers/episode-list/undownloaded-episode-list.tsx",
    "src/app/(main)/(library)/_components/library-header.tsx",
    "src/app/(main)/(library)/_containers/continue-watching-header.tsx",
    "src/app/(main)/(library)/_containers/continue-watching.tsx",
    "src/app/(main)/(library)/_containers/scanner-modal.tsx",
    "src/app/(main)/(library)/_containers/unknown-media-manager.tsx",
    "src/app/(main)/(library)/_containers/unmatched-file-manager.tsx",
    "src/app/(main)/(library)/_home/home-screen.tsx",
    "src/app/(main)/achievements/page.tsx",
    "src/app/(main)/auto-downloader/_components/autodownloader-rule-item.tsx",
    "src/app/(main)/auto-downloader/_containers/autodownloader-batch-rule-form.tsx",
    "src/app/(main)/auto-downloader/_containers/autodownloader-page.tsx",
    "src/app/(main)/auto-downloader/_containers/autodownloader-profile-form.tsx",
    "src/app/(main)/auto-downloader/_containers/autodownloader-rule-form.tsx",
    "src/app/(main)/auto-downloader/_containers/autodownloader-shared-fields.tsx",
    "src/app/(main)/discover/_components/discover-page-header.tsx",
    "src/app/(main)/discover/_containers/discover-trending.tsx",
    "src/app/(main)/enqueue-future/_containers/enqueue-future-page.tsx",
    "src/app/(main)/entry/_components/anime-onlinestream-button.tsx",
    "src/app/(main)/entry/_components/meta-section.tsx",
    "src/app/(main)/entry/_components/next-airing-episode.tsx",
    "src/app/(main)/entry/_containers/debrid-stream/debrid-stream-button.tsx",
    "src/app/(main)/entry/_containers/debrid-stream/debrid-stream-overlay.tsx",
    "src/app/(main)/entry/_containers/entry-actions/anime-entry-dropdown-menu.tsx",
    "src/app/(main)/_electron/electron-crash-screen.tsx",
    "src/app/(main)/_features/home/landing-widgets.tsx",
    "src/app/(main)/_features/home/landing-widget-views.tsx",
    "src/app/(main)/_features/getting-started/getting-started-page.tsx",
    "src/app/(main)/scan-summaries/page.tsx",
    "src/app/(main)/extensions/_containers/invalid-extension-card.tsx",
    "src/app/(main)/extensions/playground/_containers/extension-playground.tsx",
    "src/app/(main)/_features/video-core/video-core-settings-menu.tsx",
    "src/app/(main)/theme-manager/page.tsx",
    "src/app/(main)/server-data-wrapper.tsx",
    "src/app/(main)/manga/entry/page.tsx",
    "src/app/(main)/settings/page.tsx",
    "src/app/(main)/settings/_containers/anilist-settings.tsx",
    "src/app/(main)/settings/_containers/debrid-settings.tsx",
    "src/app/(main)/settings/_components/playback-settings.tsx",
    "src/app/(main)/settings/_components/mediaplayer-settings.tsx",
    "src/app/(main)/settings/_containers/discord-rich-presence-settings.tsx",
    "src/app/(main)/settings/_containers/local-settings.tsx",
    "src/app/(main)/settings/_containers/mediastream-settings.tsx",
    "src/app/(main)/settings/_containers/nakama-settings.tsx",
    "src/app/(main)/_features/update/update-modal.tsx",
    "src/app/(main)/_features/nakama/nakama-manager.tsx",
    "src/app/(main)/settings/_containers/server-settings.tsx",
    "src/app/(main)/settings/_containers/torrentstream-settings.tsx",
    "src/app/(main)/settings/_containers/ui-settings.tsx",
    "src/app/(main)/_features/video-core/video-core-media-session.ts",
    "src/lib/theme/anime-themes/seanime-theme.ts",
    "src/lib/theme/theme-bank.ts",
    "src/lib/theme/marketplace-theme-loader.ts",
]

GO_FILES = [
    "internal/notifier/notify_windows.go",
    "internal/core/tui.go",
    "internal/core/app.go",
    "internal/core/extensions.go",
]

DENSHI_FILES = [
    "seanime-denshi/src/main.js",
]

# Tokens that must never be rebranded (wire format, identifiers, paths).
PROTECTED = [
    "X-Seanime-Token",
    "X-Seanime-Profile-Token",
    "X-Seanime-Background",
    "Seanime-Client-Id",
    "richPresenceHideSeanimeRepositoryButton",
    "SeanimeGradientBackground",
    "Seanime-dev",
]

PLACEHOLDER = "\x00PROTECTED{}\x00"


def protect(s: str) -> str:
    for i, token in enumerate(PROTECTED):
        s = s.replace(token, PLACEHOLDER.format(i))
    return s


def unprotect(s: str) -> str:
    for i, token in enumerate(PROTECTED):
        s = s.replace(PLACEHOLDER.format(i), token)
    return s


def process(content: str) -> tuple[str, int]:
    content = protect(content)
    # Desktop client name first, so the generic pass doesn't mangle it.
    content = content.replace("Seanime Denshi", "Seaserver Denshi")
    count = content.count("Seanime")
    content = content.replace("Seanime", APP)
    content = unprotect(content)
    return content, count


def main() -> None:
    total = 0
    for group, base in ((WEB_FILES, os.path.join(ROOT, "seanime-web")),
                        (GO_FILES, ROOT), (DENSHI_FILES, ROOT)):
        for rel in group:
            path = os.path.join(base, rel)
            with open(path, "r", encoding="utf-8") as f:
                original = f.read()
            updated, n = process(original)
            if n:
                with open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(updated)
                print(f"{rel}: {n}")
                total += n
    print(f"total replacements: {total}")


if __name__ == "__main__":
    main()
