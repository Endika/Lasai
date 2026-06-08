export const STRESS_BANDS = ['low', 'moderate', 'high'] as const
export type StressBand = (typeof STRESS_BANDS)[number]

/**
 * Maps a PSS-10 total (0..40) to a perceived-stress band.
 *   low:      0..13
 *   moderate: 14..26
 *   high:     27..40
 * These are conventional reference bands for self-reflection, not a clinical cut-off.
 */
export function bandFromScore(score: number): StressBand {
  if (!Number.isInteger(score) || score < 0 || score > 40) {
    throw new Error('StressBand: score must be an integer in 0..40')
  }
  if (score <= 13) return 'low'
  if (score <= 26) return 'moderate'
  return 'high'
}
