/**
 * PSS-10 (Perceived Stress Scale, Cohen et al.) scoring.
 *
 * Ten items, each answered on a 0..4 Likert scale ("never" .. "very often").
 * The four positively-worded items — questions 4, 5, 7 and 8, i.e. zero-based
 * indices 3, 4, 6 and 7 — are reverse-scored (0->4, 1->3, 2->2, 3->1, 4->0).
 * The total is the sum of all (adjusted) items, range 0..40.
 *
 * Faithful to the original instrument; provided for self-reflection, not diagnosis.
 */
export const PSS_ITEM_COUNT = 10
export const PSS_MIN_ANSWER = 0
export const PSS_MAX_ANSWER = 4

/** Zero-based indices of the positively-worded, reverse-scored items (Q4, Q5, Q7, Q8). */
export const PSS_REVERSE_INDICES = [3, 4, 6, 7] as const

const REVERSE = new Set<number>(PSS_REVERSE_INDICES)

function assertAnswers(answers: readonly number[]): void {
  if (answers.length !== PSS_ITEM_COUNT) {
    throw new Error(`PssScore: expected ${PSS_ITEM_COUNT} answers, got ${answers.length}`)
  }
  for (const [i, a] of answers.entries()) {
    if (!Number.isInteger(a) || a < PSS_MIN_ANSWER || a > PSS_MAX_ANSWER) {
      throw new Error(`PssScore: answer ${i} must be an integer in 0..4`)
    }
  }
}

/** Compute the PSS-10 total (0..40) from ten 0..4 answers. */
export function compute(answers: readonly number[]): number {
  assertAnswers(answers)
  return answers.reduce((sum, a, i) => sum + (REVERSE.has(i) ? PSS_MAX_ANSWER - a : a), 0)
}
