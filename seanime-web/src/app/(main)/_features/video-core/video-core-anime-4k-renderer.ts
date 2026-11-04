import type { Anime4KPipeline } from "anime4k-webgpu"

// Replacement for anime4k-webgpu's `render()`. The library's version re-registers a
// requestVideoFrameCallback forever with no way to stop it, so every destroy/re-init left a loop
// running against a destroyed device and a detached canvas, and re-inits stacked loops. This one
// does the same GPU work (copy frame → pipeline passes → draw the last output to the canvas) but
// returns a handle that stops it, takes the device the caller already made, and reports each
// presented frame so the caller does not need a second per-frame loop for stats/frame drops.

const BLIT_WGSL = /* wgsl */`
struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
}

@vertex
fn vert_main(@builtin(vertex_index) i : u32) -> VertexOutput {
  const pos = array(
    vec2( 1.0,  1.0), vec2( 1.0, -1.0), vec2(-1.0, -1.0),
    vec2( 1.0,  1.0), vec2(-1.0, -1.0), vec2(-1.0,  1.0),
  );
  const uv = array(
    vec2(1.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0),
    vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, 0.0),
  );
  var out : VertexOutput;
  out.position = vec4(pos[i], 0.0, 1.0);
  out.uv = uv[i];
  return out;
}

@group(0) @binding(1) var blitSampler : sampler;
@group(0) @binding(2) var blitTexture : texture_2d<f32>;

@fragment
fn frag_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleBaseClampToEdge(blitTexture, blitSampler, uv);
}
`

export interface Anime4KRenderOptions {
    video: HTMLVideoElement
    canvas: HTMLCanvasElement
    device: GPUDevice
    pipelineBuilder: (device: GPUDevice, inputTexture: GPUTexture) => Anime4KPipeline[]
    signal: AbortSignal
    // Called after each video frame was drawn.
    onFrame?: (now: number, metadata: VideoFrameCallbackMetadata) => void
}

export interface Anime4KRenderHandle {
    stop: () => void
}

function waitForFrameData(video: HTMLVideoElement, signal: AbortSignal) {
    if (video.readyState >= video.HAVE_CURRENT_DATA) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
        const done = () => {
            video.removeEventListener("loadeddata", done)
            signal.removeEventListener("abort", aborted)
            resolve()
        }
        const aborted = () => {
            video.removeEventListener("loadeddata", done)
            reject(new DOMException("Aborted", "AbortError"))
        }
        video.addEventListener("loadeddata", done)
        signal.addEventListener("abort", aborted, { once: true })
    })
}

export async function renderAnime4K(options: Anime4KRenderOptions): Promise<Anime4KRenderHandle> {
    const { video, canvas, device, pipelineBuilder, signal, onFrame } = options

    await waitForFrameData(video, signal)
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")

    const width = video.videoWidth
    const height = video.videoHeight

    const context = canvas.getContext("webgpu")
    if (!context) throw new Error("WebGPU canvas context unavailable")
    const format = navigator.gpu.getPreferredCanvasFormat()
    context.configure({ device, format, alphaMode: "premultiplied" })

    const inputTexture = device.createTexture({
        size: [width, height, 1],
        format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    const pipelines = pipelineBuilder(device, inputTexture)
    const output = pipelines.at(-1)
    if (!output) throw new Error("Anime4K pipeline is empty")

    const module = device.createShaderModule({ code: BLIT_WGSL })
    const renderPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vert_main" },
        fragment: { module, entryPoint: "frag_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    })
    const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" })
    const bindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 1, resource: sampler },
            { binding: 2, resource: output.getOutputTexture().createView() },
        ],
    })

    let stopped = false
    let handle: number | null = null

    const draw = () => {
        // The source frame can be missing for a moment (src swap); skip rather than throw.
        if (video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth !== width || video.videoHeight !== height) return
        device.queue.copyExternalImageToTexture({ source: video }, { texture: inputTexture }, [width, height])
        const encoder = device.createCommandEncoder()
        for (const pipeline of pipelines) pipeline.pass(encoder)
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: "clear",
                storeOp: "store",
            }],
        })
        pass.setPipeline(renderPipeline)
        pass.setBindGroup(0, bindGroup)
        pass.draw(6)
        pass.end()
        device.queue.submit([encoder.finish()])
    }

    const stop = () => {
        if (stopped) return
        stopped = true
        if (handle !== null) video.cancelVideoFrameCallback(handle)
        handle = null
        try { context.unconfigure() } catch { /* device may already be gone */ }
        inputTexture.destroy()
    }
    signal.addEventListener("abort", stop, { once: true })

    // rVFC fires once per presented frame, including the frame shown after a seek while paused,
    // so nothing is drawn while the picture is still.
    const onVideoFrame = (now: number, metadata: VideoFrameCallbackMetadata) => {
        if (stopped) return
        draw()
        onFrame?.(now, metadata)
        if (!stopped) handle = video.requestVideoFrameCallback(onVideoFrame)
    }
    handle = video.requestVideoFrameCallback(onVideoFrame)

    // Show the current frame straight away when starting on a paused video.
    draw()

    return { stop }
}
