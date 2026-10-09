# To-do — everything from this batch

Status as of the work being done. The checked items are in the repo and type-check/build clean;
the unchecked ones are explained below.

## Done

- [x] **The two original build errors** — fixed (landing hub props + route tree); the full denshi
      build passes end-to-end.
- [x] **"To watch" on the left sidebar** — its own page, in the Watch group; removed from your own
      profile.
- [x] **Sidebar categories** — the whole nav grouped (Watch / AniList / Downloads / Community /
      Tools), with the landing page as its own entry above them.
- [x] **Collapsible categories** — every group heading folds, in both label and icon-only mode,
      remembered across reloads. The "More" overflow menu is **gone** — it was eating the bar's own
      icons and fighting the folds; the bar scrolls instead, and folding is in your hands.
- [x] **Anime ⇄ Manga in one sidebar slot** — one entry that flips: the icon and label follow the
      page you are on, and the swap button's jump re-highlights the same slot as its other door.
- [x] **Landing page** — rebuilt as a compact dashboard: a hero strip (greeting, search,
      Customize), a tile band where every door shares one grid with its stats, and the wider
      sections below. Customize opens the same kind of settings the anime/manga home screens have:
      every widget toggleable and draggable.
- [x] **Landing widgets (12)** — continue watching, quick links, anime stats, manga stats,
      schedule, updates, to-watch, unmatched, torrents, achievements, continue reading, airing
      today. Per-profile config, stored client-side; every widget reads the hooks the app already
      reads.
- [x] **Manga continue-reading header** — the full header the anime home screen has: banner, cover
      card on the left, title, genres, score, description, Preview — for what you are reading.
- [x] **AniList banner not updating** — the banner/avatar came from a snapshot taken at login and
      never refreshed; an hourly job now re-fetches the Viewer and updates the stored account (only
      when it changed, only when a real account is signed in).
- [x] **Profile banner missing** — same root cause, same fix: the account row now stays current.
- [x] **Missed sequels** — its own page in the Watch group, two sections: **Not watched** (from
      AniList) and **Not matched** (in your library, nothing on disk). Press a "not matched" card
      and the real torrent search opens in a drawer — live, the same UI the anime page opens. Every
      card has hide (for now) and skip (never again); a restore button brings the hidden ones back.
- [x] **The orange "matched" badges** — now the brand color (your wallpaper's accent), everywhere
      the badge exists: the corner flags, the pills, the compact markers, and the queue's state
      mark.
- [x] **The "Update error" toast** — the Electron shell sent the updater's error as an object, so
      the toast said "[object Object]"; it now shows the actual message.
- [x] **The Denshi updater 404** — your releases carry no `latest.yml`, so every client update
      check errored. The client now treats that as "nothing to check" instead of announcing it —
      the server updates itself from its checkout, which is the updater that matters.
- [x] **Updates based on git, not releases** — the `latest-update` endpoint now asks the git
      checkout (what gets pulled) when the server runs from one, and only falls back to the
      releases endpoint when there is no checkout.
- [x] **Update checks in real time** — the git check now runs hourly in the cron (plus the
      updater's own 15-minute loop), so "behind" state is known within the hour of a push.
- [x] **Network-error toast wall** — network-level failures no longer toast; error payloads throw
      the server's real message instead of React Query's "data is undefined".
- [x] **Providers working** — AniZone (verified against the live site end-to-end), AnimePahe, and
      GojoWtf/Animetsu, all built-in Go, all searching versatilely (query → english → romaji →
      synonyms).
- [x] **Enqueue Future** — no more 20-series waiting-list cap (unlimited), a background supervisor
      that starts whatever is waiting every couple of minutes with no page open, the queue-view
      switch, and the queue's "matched" badge in the brand color.
- [x] **Manga downloads popup lag** — virtualized; sorts done once per payload.
- [x] **PiP** — the pop-out window locks to the video's exact aspect ratio (no bars), the vignette
      under the UI / above the video in the main player, pop-out and Document PiP, and the lag
      fixes (write throttle + no resize thrash + stable pause callback).
- [x] **"Move to the sequel?" prompt** and the **"Still watching?" check every 3 episodes** (night
      hours only: 7 pm–10 am).
- [x] **Manga ⇄ Anime swap buttons** on both library toolbars.
- [x] **Subtitle fixes** — relative URLs resolved against the provider page (Kickassanime cast
      streams), and empty subtitle files handed back instead of a 500.

## Not possible

- **AnimeCrush** — animecrush.to has been down for over a month; animecrush.com is parked.
- **AniFlix** — aniflix.tv is a parked ad page.
- **Hanime** — hanime.tv is up but its API rejected the probes; addable later as a fourth built-in
  provider once the right endpoints are confirmed.
