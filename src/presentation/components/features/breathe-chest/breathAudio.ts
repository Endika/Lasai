import type { BreathePhase } from './breathCueSchedule'

/**
 * Web Audio cue playback for the chest-breathing session, fully synthesised
 * (no audio files → stays offline). Every entry point is guarded so that when
 * Web Audio is unavailable (e.g. jsdom in tests) it is a silent no-op rather
 * than a throw.
 *
 *  - inhale → a soft sine gliding UP in pitch over the inhale seconds.
 *  - exhale → a soft sine gliding DOWN over the exhale seconds.
 *  - hold / rest → a single short, quiet tick.
 *
 * With the phone resting on the chest the screen can't be seen, so these audio
 * cues are the primary guide; the visual phase label is a secondary aid.
 */

/** Resolve an AudioContext constructor across vendor prefixes; null when absent. */
export function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  )
}

/** Pitch range (Hz) the inhale/exhale glide sweeps between. */
const LOW_HZ = 220
const HIGH_HZ = 392

/**
 * Schedule the audio cue for a phase on the given context. `durationSec` is the
 * phase length so the glide spans the whole inhale/exhale. No-op when `ctx` is
 * null or any Web Audio call throws (kept robust for tests / locked contexts).
 */
export function playPhaseCue(
  ctx: AudioContext | null,
  phase: BreathePhase,
  durationSec: number,
): void {
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.connect(g)
    g.connect(ctx.destination)

    if (phase === 'inhale' || phase === 'exhale') {
      const dur = Math.max(0.4, durationSec)
      const from = phase === 'inhale' ? LOW_HZ : HIGH_HZ
      const to = phase === 'inhale' ? HIGH_HZ : LOW_HZ
      o.frequency.setValueAtTime(from, now)
      o.frequency.linearRampToValueAtTime(to, now + dur)
      // Gentle in/out envelope across the whole phase so it stays soft.
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.15)
      g.gain.setValueAtTime(0.12, now + Math.max(0.15, dur - 0.25))
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
      o.start(now)
      o.stop(now + dur + 0.05)
    } else {
      // hold / rest: a single short, quiet tick to mark the phase boundary.
      o.frequency.setValueAtTime(330, now)
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(0.05, now + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
      o.start(now)
      o.stop(now + 0.2)
    }
  } catch {
    /* Web Audio unavailable or context locked — the visual label still guides. */
  }
}

/** End-of-session cue: a soft beep + (Android) vibration so the user can stop. */
export function playEndCue(ctx: AudioContext | null): void {
  vibrate([180, 90, 180])
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 660
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
    o.connect(g)
    g.connect(ctx.destination)
    o.start(now)
    o.stop(now + 0.65)
  } catch {
    /* audio unavailable — the vibration / frozen result still convey completion */
  }
}

/** Short vibration pulse (Android); a no-op where the API is absent (iOS). */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* no vibration API — fine */
  }
}
