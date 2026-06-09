import type { ISignalSource, SignalSample, SignalSourceCapabilities } from './ISignalSource'

/**
 * Camera-backed PPG source.
 *
 * Opens the rear camera at low resolution, and on every animation frame draws a
 * small centered ROI to an offscreen canvas, reading back the mean RED-channel
 * value. The finger over the lens makes that value pulse with the heartbeat.
 *
 * Privacy: frames live only in a transient canvas; nothing is stored or sent.
 * On stop()/unmount every MediaStreamTrack is stopped so the camera light goes
 * off promptly. Torch is feature-detected and only used when supported.
 */

/** torch is non-standard, so extend the lib types narrowly (no `any`). */
interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean
}
interface TorchConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean
}
interface TorchConstraints extends MediaTrackConstraints {
  advanced?: TorchConstraintSet[]
}

const ROI = 40 // px square sampled from the center of the frame

export class CameraSignalSource implements ISignalSource {
  private readonly rate: number
  private stream: MediaStream | null = null
  private track: MediaStreamTrack | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private raf: number | null = null
  private cb: ((s: SignalSample) => void) | null = null
  private torchSupported = false
  private stopped = false

  constructor(fps = 30) {
    this.rate = fps
  }

  async start(onSample: (sample: SignalSample) => void): Promise<void> {
    this.stopped = false
    this.cb = onSample

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 320 },
        height: { ideal: 240 },
      },
      audio: false,
    })

    // If stop() was called while permission/getUserMedia was resolving, release the
    // freshly-acquired stream immediately so the camera never stays on in the background.
    if (this.stopped) {
      stream.getTracks().forEach((tr) => tr.stop())
      return
    }

    this.stream = stream
    this.track = this.stream.getVideoTracks()[0] ?? null
    this.detectTorch()

    const video = document.createElement('video')
    video.setAttribute('playsinline', 'true')
    video.muted = true
    video.srcObject = this.stream
    await video.play()
    this.video = video

    const canvas = document.createElement('canvas')
    canvas.width = ROI
    canvas.height = ROI
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })

    this.loop()
  }

  private detectTorch(): void {
    try {
      const caps = this.track?.getCapabilities?.() as TorchCapabilities | undefined
      this.torchSupported = caps?.torch === true
    } catch {
      this.torchSupported = false
    }
  }

  private loop = (): void => {
    const video = this.video
    const ctx = this.ctx
    const canvas = this.canvas
    if (!video || !ctx || !canvas) return

    if (video.readyState >= 2 && video.videoWidth > 0) {
      const sx = (video.videoWidth - ROI) / 2
      const sy = (video.videoHeight - ROI) / 2
      ctx.drawImage(video, sx, sy, ROI, ROI, 0, 0, ROI, ROI)
      const { data } = ctx.getImageData(0, 0, ROI, ROI)
      let redSum = 0
      // RGBA stride: red channel is every 4th byte starting at 0.
      for (let i = 0; i < data.length; i += 4) redSum += data[i] ?? 0
      const meanRed = redSum / (data.length / 4)
      this.cb?.({ value: meanRed, t: performance.now() })
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  stop(): void {
    this.stopped = true
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
    // Best-effort torch off before releasing the track.
    if (this.torchSupported && this.track) {
      try {
        const c: TorchConstraints = { advanced: [{ torch: false }] }
        void this.track.applyConstraints(c)
      } catch {
        /* ignore — track is about to be stopped anyway */
      }
    }
    this.stream?.getTracks().forEach((tr) => tr.stop())
    this.stream = null
    this.track = null
    if (this.video) {
      this.video.srcObject = null
      this.video = null
    }
    this.canvas = null
    this.ctx = null
    this.cb = null
  }

  fps(): number {
    return this.rate
  }

  capabilities(): SignalSourceCapabilities {
    return { torch: this.torchSupported }
  }

  /** The live stream opened by start(), for an optional UI preview. */
  previewStream(): MediaStream | null {
    return this.stream
  }

  async setTorch(on: boolean): Promise<void> {
    if (!this.torchSupported || !this.track) return
    try {
      const c: TorchConstraints = { advanced: [{ torch: on }] }
      await this.track.applyConstraints(c)
    } catch {
      /* torch toggle is best-effort; ignore failures */
    }
  }
}
