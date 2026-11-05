import { describe, expect, it, vi } from "vitest"

// The module runs in a browser window; in node the same globals exist except `window`.
Object.assign(globalThis, { window: globalThis })

const mod = await import("./video-core-popout-resume")

// Stands in for the giving window's <video>.
function fakeVideo(time: number, paused: boolean) {
    const v = new EventTarget() as EventTarget & { currentTime: number, paused: boolean, playbackRate: number, isConnected: boolean }
    Object.assign(v, {
        currentTime: time, paused, playbackRate: 1, isConnected: true,
        pause() { (v as any).paused = true },
        play() { (v as any).paused = false; return Promise.resolve() },
    })
    return v as unknown as HTMLVideoElement
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

describe("popout live handoff", () => {
    it("hands over the live position, pausing the giver on it, and stops it once the taker plays", async () => {
        const id = mod.newPopoutHandoffId()
        const onStarted = vi.fn()
        const video = fakeVideo(100, false)
        mod.startPopoutHandoffGiver({ id, video, onStarted, timeoutMs: 5000 })

        // The giving window kept playing while the taker loaded.
        ;(video as any).currentTime = 112
        const position = await mod.requestPopoutHandoffPosition(id, { time: 100, paused: false })
        expect(position.live).toBe(true)
        expect(position.paused).toBe(false)
        // The live time, not the stale URL time.
        expect(position.time).toBe(112)
        // Only one window plays: the giver holds that frame while the taker starts.
        expect(video.paused).toBe(true)
        expect(onStarted).not.toHaveBeenCalled()

        // Asked again (a retried "ready"): the same answer, still "was playing".
        const again = await mod.requestPopoutHandoffPosition(id, { time: 100, paused: false })
        expect(again).toEqual({ time: 112, paused: false, live: true })

        mod.announcePopoutHandoffStarted(id)
        await wait(20)
        expect(onStarted).toHaveBeenCalledTimes(1)
    })

    it("keeps a paused giver paused", async () => {
        const id = mod.newPopoutHandoffId()
        mod.startPopoutHandoffGiver({ id, video: fakeVideo(50, true), onStarted: () => {}, timeoutMs: 5000 })
        const position = await mod.requestPopoutHandoffPosition(id, { time: 1, paused: false })
        expect(position).toEqual({ time: 50, paused: true, live: true })
    })

    it("lets the giver keep playing when the taker fails", async () => {
        const id = mod.newPopoutHandoffId()
        const onStarted = vi.fn()
        const onFailed = vi.fn()
        const video = fakeVideo(10, false)
        mod.startPopoutHandoffGiver({ id, video, onStarted, onFailed, timeoutMs: 5000 })
        await mod.requestPopoutHandoffPosition(id, { time: 10, paused: false })
        expect(video.paused).toBe(true)
        mod.announcePopoutHandoffFailed(id)
        await wait(20)
        expect(onFailed).toHaveBeenCalledTimes(1)
        // Paused for the handoff, so it plays on.
        expect(video.paused).toBe(false)
        expect(onStarted).not.toHaveBeenCalled()
    })

    it("falls back to the handed-over time when nobody answers", async () => {
        const position = await mod.requestPopoutHandoffPosition("nobody", { time: 42, paused: false }, 300)
        expect(position).toEqual({ time: 42, paused: false, live: false })
    })

    it("ignores other handoffs", async () => {
        const onStarted = vi.fn()
        mod.startPopoutHandoffGiver({ id: "a", video: fakeVideo(1, false), onStarted, timeoutMs: 5000 })
        mod.announcePopoutHandoffStarted("b")
        await wait(20)
        expect(onStarted).not.toHaveBeenCalled()
    })

    it("times out to the old one-shot handoff", async () => {
        const onTimeout = vi.fn()
        mod.startPopoutHandoffGiver({ id: mod.newPopoutHandoffId(), video: null, onStarted: () => {}, onTimeout, timeoutMs: 50 })
        await wait(100)
        expect(onTimeout).toHaveBeenCalledTimes(1)
    })

    it("return: the main window acks, and the shell's later return event is recognised", async () => {
        const seen: string[] = []
        const stop = mod.listenForPopoutReturns((request) => {
            seen.push(request.path)
            return true
        })
        const accepted = await mod.requestPopoutReturn(mod.newPopoutHandoffId(), { path: "/a.mkv", time: 3, paused: false })
        expect(accepted).toBe(true)
        expect(seen).toEqual(["/a.mkv"])
        expect(mod.wasReturnedOverChannel("/a.mkv")).toBe(true)
        // Only once.
        expect(mod.wasReturnedOverChannel("/a.mkv")).toBe(false)
        stop()
    })

    it("return: a main window that declines leaves the one-shot return", async () => {
        const stop = mod.listenForPopoutReturns(() => false)
        const accepted = await mod.requestPopoutReturn(mod.newPopoutHandoffId(), { path: "/b.mkv", time: 3, paused: false }, 300)
        expect(accepted).toBe(false)
        expect(mod.wasReturnedOverChannel("/b.mkv")).toBe(false)
        stop()
    })

    it("pending resume carries the handoff id, even at time 0", () => {
        mod.setPendingPopoutResume(0, true, "x")
        expect(mod.hasPendingPopoutHandoff()).toBe(true)
        expect(mod.takePendingPopoutResume()).toEqual({ time: 0, paused: true, handoffId: "x" })
        expect(mod.hasPendingPopoutHandoff()).toBe(false)
        mod.setPendingPopoutResume(0, false)
        expect(mod.takePendingPopoutResume()).toBeNull()
    })
})
