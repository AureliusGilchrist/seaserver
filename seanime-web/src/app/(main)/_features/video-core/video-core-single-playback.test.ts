import { describe, expect, it } from "vitest"

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
    addEventListener: (type: string, fn: (e: Event) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: (e: Event) => void) => listeners.get(type)?.delete(fn),
})

Object.assign(globalThis, {
    window: Object.assign(globalThis, { location: { pathname: "/" } }),
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
        // The episode the pip opened on is not a change; only the move to ep2 is.
        expect(seen).toEqual(["/a/ep2.mkv"])

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
