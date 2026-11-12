import { describe, expect, it, vi } from "vitest"

// Node has BroadcastChannel and EventTarget; the window, document and media elements are stood in
// for. Both "windows" share this one document stand-in, so each test only looks at what it set up.
class FakeMedia extends EventTarget {
    paused = true
    ended = false
    play() {
        this.paused = false
        // Media events reach the document's capture listeners with the element as target.
        this.dispatchToDocument("play")
        return Promise.resolve()
    }
    pause() {
        if (this.paused) return
        this.paused = true
        this.dispatchToDocument("pause")
    }
    dispatchToDocument(type: string) {
        const event = new Event(type)
        Object.defineProperty(event, "target", { value: this })
        for (const l of listeners.get(type) ?? []) l(event)
    }
}

const listeners = new Map<string, Set<(e: Event) => void>>()
let elements: FakeMedia[] = []
const fakeDocument = Object.assign(new EventTarget(), {
    querySelectorAll: () => elements,
    // The beacon reads the pip's final position off its video when it stops.
    querySelector: () => null,
    addEventListener: (type: string, fn: (e: Event) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: (e: Event) => void) => listeners.get(type)?.delete(fn),
})

Object.assign(globalThis, {
    // The popout's beacon listens for "pagehide" on the window.
    window: Object.assign(globalThis, { location: { pathname: "/" }, addEventListener: () => {}, removeEventListener: () => {} }),
    document: fakeDocument,
    HTMLMediaElement: FakeMedia,
})

const mod = await import("./video-core-single-playback")

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

describe("one player at a time, the popout wins", () => {
    it("tells subscribers when the popout starts and stops playing", async () => {
        const main = new FakeMedia()
        elements = [main]
        const seen: boolean[] = []
        const stopListening = mod.onPopoutPlayingChange(playing => seen.push(playing))
        // The current state is delivered on subscribe.
        expect(seen).toEqual([false])

        const stopGuard = mod.startMainWindowPlaybackGuard()
        const popoutChannel = new BroadcastChannel("vc-single-playback")
        popoutChannel.postMessage({ type: "popout-state", playing: true })
        await wait(30)
        expect(seen).toEqual([false, true])

        // The popout stops: the overlay (and everything else listening) comes down.
        popoutChannel.postMessage({ type: "popout-state", playing: false })
        await wait(30)
        expect(seen).toEqual([false, true, false])

        // A popout that dies without a final report stops counting once its last one goes stale.
        popoutChannel.postMessage({ type: "popout-state", playing: true })
        await wait(30)
        expect(seen[seen.length - 1]).toBe(true)
        // STALE_MS (3.5s) plus the next tick of the staleness timer (1s).
        await wait(4700)
        expect(seen[seen.length - 1]).toBe(false)

        stopListening()
        popoutChannel.close()
        stopGuard()
    })

    it("tells subscribers when the pip window is open, paused or not", async () => {
        const seen: boolean[] = []
        const stopListening = mod.onPopoutPresentChange(present => seen.push(present))
        // The current state is delivered on subscribe.
        expect(seen).toEqual([false])

        const stopGuard = mod.startMainWindowPlaybackGuard()
        const popoutChannel = new BroadcastChannel("vc-single-playback")

        // Open, not yet playing: the main window's player blurs already.
        popoutChannel.postMessage({ type: "popout-open" })
        await wait(30)
        expect(seen).toEqual([false, true])

        // Paused: still open — the pip exists either way.
        popoutChannel.postMessage({ type: "popout-state", playing: false })
        await wait(30)
        expect(seen[seen.length - 1]).toBe(true)

        // Closed: gone at once.
        popoutChannel.postMessage({ type: "popout-closed" })
        await wait(30)
        expect(seen[seen.length - 1]).toBe(false)

        // A pip that dies without saying so stops counting once its last report goes stale.
        popoutChannel.postMessage({ type: "popout-open" })
        await wait(30)
        expect(seen[seen.length - 1]).toBe(true)
        // STALE_MS (3.5s) plus the next tick of the staleness timer (1s).
        await wait(4700)
        expect(seen[seen.length - 1]).toBe(false)

        stopListening()
        popoutChannel.close()
        stopGuard()
    })

    it("follows the popout's episode, without any position", async () => {
        const seen: string[] = []
        const stopGuard = mod.startMainWindowPlaybackGuard()
        const stopListening = mod.onPopoutPathChange(path => seen.push(path))
        const popoutChannel = new BroadcastChannel("vc-single-playback")

        popoutChannel.postMessage({ type: "popout-open", path: "/a/ep1.mkv" })
        popoutChannel.postMessage({ type: "popout-open", path: "/a/ep1.mkv" })
        await wait(30)
        popoutChannel.postMessage({ type: "popout-open", path: "/a/ep2.mkv" })
        await wait(30)
        // Every distinct file is announced once, the one the pip opened on included: the follower
        // only acts when the player is on another file, so the first is a no-op when it matches.
        expect(seen).toEqual(["/a/ep1.mkv", "/a/ep2.mkv"])

        popoutChannel.postMessage({ type: "popout-closed" })
        popoutChannel.close()
        stopListening()
        stopGuard()
    })

    it("still follows a change that comes after the pip went quiet for a while", async () => {
        const seen: string[] = []
        const stopGuard = mod.startMainWindowPlaybackGuard()
        const stopListening = mod.onPopoutPathChange(path => seen.push(path))
        const popoutChannel = new BroadcastChannel("vc-single-playback")

        popoutChannel.postMessage({ type: "popout-open", path: "/b/ep1.mkv" })
        await wait(30)
        // A busy pip stops reporting past STALE_MS, so the main window forgets it was there; the
        // report that follows (already on the next episode) must still move the player.
        await wait(4700)
        popoutChannel.postMessage({ type: "popout-open", path: "/b/ep2.mkv" })
        await wait(30)
        expect(seen[seen.length - 1]).toBe("/b/ep2.mkv")

        popoutChannel.postMessage({ type: "popout-closed" })
        popoutChannel.close()
        stopListening()
        stopGuard()
    })

    it("brings the player to the episode the pip closed on", async () => {
        const seen: string[] = []
        const stopGuard = mod.startMainWindowPlaybackGuard()
        const stopListening = mod.onPopoutPathChange(path => seen.push(path))
        const popoutChannel = new BroadcastChannel("vc-single-playback")

        popoutChannel.postMessage({ type: "popout-open", path: "/c/ep3.mkv" })
        await wait(30)
        // The pip moved on through ep4 to ep5 without the main window hearing of it.
        popoutChannel.postMessage({ type: "popout-closed", path: "/c/ep5.mkv", time: 342 })
        await wait(30)
        expect(seen).toEqual(["/c/ep3.mkv", "/c/ep5.mkv"])

        popoutChannel.close()
        stopListening()
        stopGuard()
    })

    it("hands the pip's current episode to a listener that subscribes late", async () => {
        const stopGuard = mod.startMainWindowPlaybackGuard()
        const popoutChannel = new BroadcastChannel("vc-single-playback")

        popoutChannel.postMessage({ type: "popout-open", path: "/d/ep7.mkv" })
        await wait(30)
        const seen: string[] = []
        const stopListening = mod.onPopoutPathChange(path => seen.push(path))
        expect(seen).toEqual(["/d/ep7.mkv"])

        popoutChannel.postMessage({ type: "popout-closed" })
        popoutChannel.close()
        stopListening()
        stopGuard()
    })

    it("pauses the main window when the popout plays, and blocks new playback there", async () => {
        const main = new FakeMedia()
        elements = [main]
        let blocked = 0
        const stopGuard = mod.startMainWindowPlaybackGuard(() => blocked++)

        await main.play()
        expect(main.paused).toBe(false)

        // The popout starts playing (its beacon on its own channel object, like another window).
        const popoutChannel = new BroadcastChannel("vc-single-playback")
        popoutChannel.postMessage({ type: "popout-state", playing: true })
        await wait(30)
        expect(mod.isPopoutPlaying()).toBe(true)
        expect(main.paused).toBe(true)

        // Pressing play in the main window is undone.
        await main.play()
        expect(main.paused).toBe(true)
        expect(blocked).toBeGreaterThan(0)

        // The popout stops (closed): the main window may play again.
        popoutChannel.postMessage({ type: "popout-state", playing: false })
        await wait(30)
        await main.play()
        expect(main.paused).toBe(false)

        popoutChannel.close()
        stopGuard()
    })

    it("lets the main window play once playback is returned to it", async () => {
        const main = new FakeMedia()
        elements = [main]
        const stopGuard = mod.startMainWindowPlaybackGuard()
        const popoutChannel = new BroadcastChannel("vc-single-playback")
        popoutChannel.postMessage({ type: "popout-state", playing: true })
        await wait(30)
        expect(mod.isPopoutPlaying()).toBe(true)

        mod.releasePopoutPriority()
        // A late "still playing" from the closing popout is ignored.
        popoutChannel.postMessage({ type: "popout-state", playing: true })
        await wait(30)
        await main.play()
        expect(main.paused).toBe(false)

        popoutChannel.close()
        stopGuard()
    })

})

// The module keeps its state (the file each window is on) at module level, so every test here
// loads its own copy. Both "windows" run in this one process and talk over the real channel.
async function freshModules() {
    vi.resetModules()
    return {
        sp: await import("./video-core-single-playback"),
        resume: await import("./video-core-popout-resume"),
    }
}

describe("the pip and the main window keep one episode between them", () => {
    it("moves the pip to the episode the main window changed to, once", async () => {
        const { sp } = await freshModules()
        sp.setPopoutCurrentPath("/m/ep1.mkv")
        const stopBeacon = sp.startPopoutPlaybackBeacon()
        const seen: string[] = []
        const stopListening = sp.onMainPathChange(path => seen.push(path))

        sp.announceMainPath("/m/ep2.mkv")
        sp.announceMainPath("/m/ep2.mkv")
        await wait(30)
        expect(seen).toEqual(["/m/ep2.mkv"])
        // From then on the pip counts as being on it, which is what its heartbeat reports.
        expect(sp.getPopoutCurrentPath()).toBe("/m/ep2.mkv")

        // The file the pip is on already needs no change.
        sp.announceMainPath("/m/ep2.mkv")
        await wait(30)
        expect(seen).toEqual(["/m/ep2.mkv"])

        stopListening()
        stopBeacon()
    })

    it("holds the main window's episode until the pip has an episode of its own", async () => {
        const { sp } = await freshModules()
        const stopBeacon = sp.startPopoutPlaybackBeacon()
        const seen: string[] = []
        const stopListening = sp.onMainPathChange(path => seen.push(path))

        // A pip still starting its first stream is on no file yet.
        sp.announceMainPath("/w/ep5.mkv")
        await wait(400)
        expect(seen).toEqual([])

        sp.setPopoutCurrentPath("/w/ep1.mkv")
        await wait(450)
        expect(seen).toEqual(["/w/ep5.mkv"])

        stopListening()
        stopBeacon()
    })

    it("holds it while a handoff still has a position to put on the pip's first stream, and takes the latest", async () => {
        const { sp, resume } = await freshModules()
        sp.setPopoutCurrentPath("/h/ep1.mkv")
        resume.setPendingPopoutResume(0, false, "handoff-1")
        const stopBeacon = sp.startPopoutPlaybackBeacon()
        const seen: string[] = []
        const stopListening = sp.onMainPathChange(path => seen.push(path))

        sp.announceMainPath("/h/ep2.mkv")
        sp.announceMainPath("/h/ep3.mkv")
        await wait(400)
        expect(seen).toEqual([])

        // The first stream played from the handed-over position: the pip is free to move.
        resume.takePendingPopoutResume()
        await wait(450)
        expect(seen).toEqual(["/h/ep3.mkv"])

        stopListening()
        stopBeacon()
    })

    it("does not announce a file the main window was only moved to by the pip", async () => {
        const { sp } = await freshModules()
        const posted: string[] = []
        const spy = new BroadcastChannel("vc-single-playback")
        spy.onmessage = event => {
            if (event.data?.type === "main-path") posted.push(event.data.path)
        }

        sp.noteFollowedPopoutPath("/e/ep5.mkv")
        sp.announceMainPath("/e/ep5.mkv")
        // The user's own choice is announced, and so is going back to a file the pip once had.
        sp.announceMainPath("/e/ep6.mkv")
        sp.announceMainPath("/e/ep5.mkv")
        sp.announceMainPath(undefined)
        await wait(30)
        expect(posted).toEqual(["/e/ep6.mkv", "/e/ep5.mkv"])

        spy.close()
    })

    it("lets a file the pip moved through be skipped by the player without that sticking", async () => {
        const { sp } = await freshModules()
        const posted: string[] = []
        const spy = new BroadcastChannel("vc-single-playback")
        spy.onmessage = event => {
            if (event.data?.type === "main-path") posted.push(event.data.path)
        }

        // Two changes in one render: the player only ever shows ep6.
        sp.noteFollowedPopoutPath("/s/ep5.mkv")
        sp.noteFollowedPopoutPath("/s/ep6.mkv")
        sp.announceMainPath("/s/ep6.mkv")
        sp.announceMainPath("/s/ep5.mkv")
        await wait(30)
        expect(posted).toEqual(["/s/ep5.mkv"])

        spy.close()
    })

    it("stops treating a file as the pip's after a while", async () => {
        const { sp } = await freshModules()
        const posted: string[] = []
        const spy = new BroadcastChannel("vc-single-playback")
        spy.onmessage = event => {
            if (event.data?.type === "main-path") posted.push(event.data.path)
        }

        const now = vi.spyOn(Date, "now")
        const start = Date.now()
        now.mockReturnValue(start)
        sp.noteFollowedPopoutPath("/t/ep5.mkv")
        now.mockReturnValue(start + 6000)
        sp.announceMainPath("/t/ep5.mkv")
        now.mockRestore()
        await wait(30)
        expect(posted).toEqual(["/t/ep5.mkv"])

        spy.close()
    })

    it("settles on one episode when either window changes it, without arguing", async () => {
        const { sp } = await freshModules()
        const stopGuard = sp.startMainWindowPlaybackGuard()
        sp.setPopoutCurrentPath("/i/ep1.mkv")
        const stopBeacon = sp.startPopoutPlaybackBeacon()

        // The main window's player, as native-player.tsx drives it: follow the pip, announce its own.
        let mainPath = "/i/ep1.mkv"
        const stopFollowing = sp.onPopoutPathChange(path => {
            if (path === mainPath) return
            sp.noteFollowedPopoutPath(path)
            mainPath = path
            // The effect that watches the player's file runs after the change.
            sp.announceMainPath(path)
        })
        const pipPlays: string[] = []
        const stopListening = sp.onMainPathChange(path => pipPlays.push(path))
        await wait(30)

        // The pip moves on: the main window follows, and the pip is not told to "follow" it back.
        sp.setPopoutCurrentPath("/i/ep2.mkv")
        await wait(30)
        expect(mainPath).toBe("/i/ep2.mkv")
        expect(pipPlays).toEqual([])

        // The user picks another episode in the main window: the pip plays it.
        mainPath = "/i/ep7.mkv"
        sp.announceMainPath(mainPath)
        await wait(30)
        expect(pipPlays).toEqual(["/i/ep7.mkv"])

        // The pip's heartbeat now reports ep7, which the main window is already on: nothing moves.
        await wait(1300)
        expect(mainPath).toBe("/i/ep7.mkv")
        expect(pipPlays).toEqual(["/i/ep7.mkv"])

        stopListening()
        stopFollowing()
        stopBeacon()
        stopGuard()
    })

    it("does not drag the pip back when the main window's player lags behind two quick changes", async () => {
        const { sp } = await freshModules()
        const stopGuard = sp.startMainWindowPlaybackGuard()
        sp.setPopoutCurrentPath("/r/ep4.mkv")
        const stopBeacon = sp.startPopoutPlaybackBeacon()

        let mainPath = "/r/ep4.mkv"
        // What the main window's observer of the player's file has not seen yet.
        const unseen: string[] = []
        const stopFollowing = sp.onPopoutPathChange(path => {
            if (path === mainPath) return
            sp.noteFollowedPopoutPath(path)
            mainPath = path
            unseen.push(path)
        })
        const pipPlays: string[] = []
        const stopListening = sp.onMainPathChange(path => pipPlays.push(path))
        await wait(30)

        // The user skips through the pip's episodes: the main window follows both before its
        // player has rendered either, then the observer runs for each of them.
        sp.setPopoutCurrentPath("/r/ep5.mkv")
        sp.setPopoutCurrentPath("/r/ep6.mkv")
        await wait(30)
        expect(mainPath).toBe("/r/ep6.mkv")
        unseen.forEach(path => sp.announceMainPath(path))
        await wait(30)

        // Telling the pip about ep5 now would send it back from ep6.
        expect(pipPlays).toEqual([])
        expect(sp.getPopoutCurrentPath()).toBe("/r/ep6.mkv")

        stopListening()
        stopFollowing()
        stopBeacon()
        stopGuard()
    })
})
