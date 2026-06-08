import { useEffect, useRef } from 'react'

/**
 * Generates a soft ambient pad entirely with the Web Audio API — no audio
 * files, so the app stays fully offline. A low sine "pad" plus a gentle
 * filtered-noise wash, kept at a very low gain. Starts only when `active` is
 * true and stops/cleans up on toggle-off and unmount.
 */
export function useAmbientSound(active: boolean): void {
  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!active) return

    const AudioCtor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return

    const ctx = new AudioCtor()
    ctxRef.current = ctx

    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)

    // Soft low pad — two detuned sines for a slow beating warmth.
    const padGain = ctx.createGain()
    padGain.gain.value = 0.06
    padGain.connect(master)
    const oscA = ctx.createOscillator()
    oscA.type = 'sine'
    oscA.frequency.value = 110
    const oscB = ctx.createOscillator()
    oscB.type = 'sine'
    oscB.frequency.value = 110.3
    oscA.connect(padGain)
    oscB.connect(padGain)

    // Gentle brown-noise wash through a low-pass filter.
    const bufferSize = 2 * ctx.sampleRate
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.value = 480
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.04
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(master)

    oscA.start()
    oscB.start()
    noise.start()

    // Fade in to avoid a click.
    const now = ctx.currentTime
    master.gain.setValueAtTime(0, now)
    master.gain.linearRampToValueAtTime(0.5, now + 1.5)

    return () => {
      try {
        const t = ctx.currentTime
        master.gain.cancelScheduledValues(t)
        master.gain.setValueAtTime(master.gain.value, t)
        master.gain.linearRampToValueAtTime(0, t + 0.3)
      } catch {
        /* context may already be closing */
      }
      window.setTimeout(() => {
        try {
          oscA.stop()
          oscB.stop()
          noise.stop()
        } catch {
          /* already stopped */
        }
        void ctx.close()
        if (ctxRef.current === ctx) ctxRef.current = null
      }, 350)
    }
  }, [active])
}
