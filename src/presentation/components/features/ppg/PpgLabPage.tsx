import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/presentation/components/common/Button'
import { CameraSignalSource } from '@/infrastructure/ppg/CameraSignalSource'
import type { ISignalSource } from '@/infrastructure/ppg/ISignalSource'
import {
  analyzeWindow,
  bandpass,
  QUALITY_PASS_THRESHOLD,
  type WindowAnalysis,
} from '@/domain/ppg/dsp'

/** Seconds of signal held in the rolling analysis window. */
const WINDOW_SECONDS = 8

/** iOS Safari gives no torch control; detect to show the lighting hint. */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
}

interface PpgLabPageProps {
  /** Override the signal source (tests inject a fake). Defaults to the camera. */
  createSource?: () => ISignalSource
}

export function PpgLabPage({ createSource }: PpgLabPageProps) {
  const { t } = useTranslation()

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [analysis, setAnalysis] = useState<WindowAnalysis | null>(null)

  const sourceRef = useRef<ISignalSource | null>(null)
  const bufferRef = useRef<number[]>([])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const stop = useCallback(() => {
    sourceRef.current?.stop()
    sourceRef.current = null
    bufferRef.current = []
    setRunning(false)
    setTorchOn(false)
  }, [])

  // Always release the camera when the view unmounts.
  useEffect(() => {
    return () => {
      sourceRef.current?.stop()
      sourceRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setAnalysis(null)
    bufferRef.current = []
    const source = createSource ? createSource() : new CameraSignalSource(30)
    sourceRef.current = source
    const fps = source.fps()
    const maxLen = Math.round(fps * WINDOW_SECONDS)

    try {
      await source.start((sample) => {
        const buf = bufferRef.current
        buf.push(sample.value)
        if (buf.length > maxLen) buf.shift()
        if (buf.length >= fps) {
          setAnalysis(analyzeWindow(buf, fps))
          drawWaveform(canvasRef.current, buf, fps)
        }
      })
      setTorchSupported(source.capabilities().torch)
      setRunning(true)
    } catch {
      sourceRef.current = null
      setError(t('ppg.errorPermission'))
    }
  }, [createSource, t])

  const toggleTorch = useCallback(async () => {
    const next = !torchOn
    await sourceRef.current?.setTorch(next)
    setTorchOn(next)
  }, [torchOn])

  const quality = analysis?.quality ?? 0
  const passes = quality >= QUALITY_PASS_THRESHOLD
  const bpm = analysis && Number.isFinite(analysis.bpm) ? Math.round(analysis.bpm) : null

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
      <header className="text-center">
        <span className="inline-block rounded-full bg-calm-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-calm-deep">
          {t('ppg.experimental')}
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{t('ppg.title')}</h1>
        <p className="mx-auto mt-2 max-w-xs text-balance text-sm text-ink-soft">
          {t('ppg.permissionExplain')}
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {!running ? (
        <Button className="self-center" onClick={() => void start()}>
          {t('ppg.start')}
        </Button>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={320}
            height={120}
            role="img"
            aria-label={t('ppg.waveformAria')}
            className="w-full rounded-2xl border border-calm/15 bg-surface/70"
          />

          <div className="grid grid-cols-2 gap-3">
            <Metric label={t('ppg.bpm')} value={bpm !== null ? String(bpm) : '—'} />
            <Metric
              label={t('ppg.rmssd')}
              value={analysis?.rmssd != null ? `${Math.round(analysis.rmssd)} ms` : '—'}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm text-ink-soft">
              <span>{t('ppg.quality')}</span>
              <span className="tabular-nums">{Math.round(quality * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink-faint/20">
              <div
                className={`h-full rounded-full transition-all ${passes ? 'bg-calm' : 'bg-amber-400'}`}
                style={{ width: `${Math.round(quality * 100)}%` }}
                role="progressbar"
                aria-valuenow={Math.round(quality * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            {!passes && <p className="mt-1 text-sm text-amber-700">{t('ppg.weakSignal')}</p>}
          </div>

          {torchSupported ? (
            <label className="flex items-center justify-between rounded-2xl border border-calm/15 bg-surface/70 px-4 py-3">
              <span className="text-sm font-medium text-ink-soft">{t('ppg.torch')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={torchOn}
                aria-label={t('ppg.torch')}
                onClick={() => void toggleTorch()}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  torchOn ? 'bg-calm' : 'bg-ink-faint/30'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    torchOn ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </label>
          ) : (
            isIos() && <p className="text-sm text-ink-faint">{t('ppg.iosHint')}</p>
          )}

          <Button variant="soft" className="self-center" onClick={stop}>
            {t('ppg.stop')}
          </Button>
        </>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-calm/15 bg-surface/70 px-4 py-3">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
    </div>
  )
}

/**
 * Draw the recent band-passed signal with detected peaks overlaid. Pure canvas
 * drawing — reads the buffer, writes pixels, keeps nothing.
 */
function drawWaveform(canvas: HTMLCanvasElement | null, raw: number[], fps: number): void {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const filtered = bandpass(raw, fps)
  if (filtered.length < 2) return

  let min = Infinity
  let max = -Infinity
  for (const v of filtered) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || 1
  const x = (i: number) => (i / (filtered.length - 1)) * w
  const y = (v: number) => h - ((v - min) / range) * (h - 8) - 4

  ctx.beginPath()
  ctx.strokeStyle = '#2c8c85'
  ctx.lineWidth = 2
  for (let i = 0; i < filtered.length; i++) {
    const px = x(i)
    const py = y(filtered[i] ?? 0)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()

  // Peaks (recomputed here so the overlay matches the drawn, filtered curve).
  const peaks = analyzeWindow(raw, fps).peaks
  ctx.fillStyle = '#e11d48'
  for (const p of peaks) {
    if (p < 0 || p >= filtered.length) continue
    ctx.beginPath()
    ctx.arc(x(p), y(filtered[p] ?? 0), 3, 0, Math.PI * 2)
    ctx.fill()
  }
}
