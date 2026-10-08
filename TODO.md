# To-do — this batch of work

Everything below was asked for in one batch. Status as of the work being done — the checked items
are in the repo and building; the unchecked ones are explained.

## Done — in the repo and building

- [x] **Fix the build errors** — the landing hub was calling `ContinueWatching` without its props,
      and the generated route tree was missing the `/anime` route in three places. Both fixed; the
      frontend type-check and the full `build:denshi` build pass.
- [x] **"To watch" on the left sidebar** — its own page at `/to-watch`, in the first ("Watch")
      group of the sidebar, showing the same list the profile tab shows. The tab was removed from
      your own profile; other people's profiles keep theirs, read-only.
- [x] **Sidebar categories** — the whole nav above the theme icon is grouped: **Watch** (play
      button icon), **AniList** (AniList logo), **Downloads**, **Community**, **Tools**. The
      back/forward buttons are deliberately left ungrouped.
- [x] **Landing page** — the hub at `/` leading to every popular area, each a card with a live
      count of what is waiting in it, plus continue-watching on top.
- [x] **Manga ⇄ Anime swap button** — a brand-tinted pill in both library toolbars ("Switch to
      Manga" / "Switch to Anime"), always visible when manga is enabled.
- [x] **Enqueue Future — queue view switch** — a "Queue view" toggle next to the other list
      buttons: a flat strip of everything still waiting, in order, no franchise spines — the
      reading that matters while the torrent client is offline.
- [x] **PiP sized to the video exactly** — the pop-out player window locks its width/height to the
      video's aspect ratio the moment the stream's metadata is known (and on every resize), so no
      bars are ever drawn. Wired through the Denshi preload, main process, and the player.
- [x] **Vignette** — a light vignette over the picture, under the UI, in the main player, the
      pop-out window, and the Document PiP window.
- [x] **Manga downloads popup lag** — the downloaded grid now renders a window at a time
      (virtualized), and the double re-sort on every render is done once per payload.
- [x] **Profile shop XP bar colors** — each bar in the shop is drawn in its own color, named for
      what it looks like; the flat ones are given a gradient in their own hue, so the shelf is
      gradients almost all the way down.
- [x] **"Move to the sequel?"** — when the last episode of a series ends and AniList knows a sequel
      exists, the player offers it: one press to the sequel's page.
- [x] **"Still watching?" check** — every 3 episodes, playback pauses and asks; continuing is one
      press, nothing is marked either way.
- [x] **Streaming providers** — three built-in Go providers that ship with the server (no manual
      install on the NAS), all searching versatilely (query → english → romaji → synonyms):
      - **AniZone** (anizone.to) — verified end-to-end: search, episode lists, playable m3u8.
      - **AnimePahe** (animepahe.com) — its own API + Kwik embed unpacking.
      - **GojoWtf** (animetsu.net) — the working extension's API, ported to Go (pahe/zoro/zaza
        servers, sub + dub).

## Investigated — with findings

- [x] **Update notification** — the whole path (updater → notice file → API → banner → websocket
      event) checks out. One real fix was made: the release check used to fall back to **upstream
      Seanime's** releases when the fork's couldn't be read, which could raise a bogus "update
      available" notice about a version that was never installable — that fallback is gone.
      Separately, the wall of "Network Error" toasts (your screenshot) is fixed: network-level
      failures no longer toast at all, and the update-notice query no longer fails with
      "data is undefined" when an error payload comes back.
- [x] **Lag after the pop-out** — could not reproduce, but one cause was found and fixed: the
      server was writing watch history to the database **every second** per playing client, for the
      whole episode — with the pop-out plus a lingering client that was several writes a second,
      which on a NAS stalls everything. It now writes at most every ten seconds (and always on
      pause), so resume positions are still accurate.
- [x] **Kickassanime cast-stream subtitles (the 500)** — the provider hands out subtitle URLs with
      no host (bare paths), which the convert-subs endpoint refused. It now resolves a bare path
      against the provider page named in the track's headers — exactly what a browser would have
      done.
- [x] **Providers not finding anything** — found and fixed: the AniZone extractor's unescaping had
      been written with mangled quote literals (replacing a quote with itself, so the pages'
      escaped-JSON payloads never parsed), and its array-terminator search was too fragile. Both
      extractors now read with a streaming JSON decoder and are **proven against the live site** —
      search returns results, episode lists resolve, and a playable m3u8 with subtitle tracks comes
      back (`ANIZONE_LIVE=1 go test ./internal/onlinestream/providers/` passes).
- [x] **Enqueue Future only working on the page** — the walk was already server-side, but the only
      things that ever started a run were a button and the startup resume: a run that ended in an
      error sat dead until you opened the queue and pressed Resume. A background supervisor now
      looks every couple of minutes and starts whatever is waiting (a walk with progress, or
      anything queued) on its own, backing off after repeated failures.
- [x] **No limit on queued series** — the 20-series waiting-list cap is gone (unlimited, still
      de-duplicated).
- [x] **Sidebar categories collapsible** — every group heading is now a fold: press it and the
      group's entries tuck away, remembered across reloads.

## Not possible

- **AnimeCrush** — animecrush.to is a real site but has been **down for over a month** (every
  uptime check since early September shows it not responding), and animecrush.com is a parked
  domain. There is nothing to scrape. AniZone and AnimePahe cover the same ground while it's down;
  when it returns, a provider for it can follow the same pattern.
- **AniFlix** — aniflix.tv is a parked ad page, not a streaming site.
- **Hanime** — noted from the earlier request; hanime.tv is up but its API rejected the probe
  requests (404s). It can be added as a fourth built-in provider the same way once the right
  endpoints are confirmed.
