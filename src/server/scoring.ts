/**
 * Strength scores for vocabulary words and grammar topics.
 *
 * Scale, from the learner's notes: -10 = very poor, 0 = untested or guessing,
 * 10 = very strong. Only graded modes change scores.
 */
export const MIN_STRENGTH = -10;
export const MAX_STRENGTH = 10;

/** A miss costs more than a hit earns, so a single lucky guess does not mark a word as known. */
export const CORRECT_STEP = 1;
export const INCORRECT_STEP = 2;

export function clampStrength(score: number): number {
  return Math.max(MIN_STRENGTH, Math.min(MAX_STRENGTH, score));
}

export function nextStrength(current: number, correct: boolean): number {
  return clampStrength(current + (correct ? CORRECT_STEP : -INCORRECT_STEP));
}
