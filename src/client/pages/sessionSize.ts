/** The learner's choice of session size: a suggested number, everything that matches, or a typed number. */
export type SessionSize = { kind: "preset"; count: number } | { kind: "all" } | { kind: "custom"; text: string };

const PRESETS = [10, 20, 30, 50, 100];

/**
 * Sizes worth suggesting: the usual presets plus the mode's default, in order. Sizes at or above the
 * pool are left out because "all questions" already covers them. An unknown pool (null) keeps every size.
 */
export function sizeSuggestions(defaultSize: number, poolSize: number | null): number[] {
  return [...new Set([...PRESETS, defaultSize])]
    .filter((n) => n >= 1 && (poolSize === null || n < poolSize))
    .sort((a, b) => a - b);
}

/** The number of questions to ask for, between 1 and the pool (or `fallback` when the pool is unknown). */
export function resolveSessionSize(size: SessionSize, poolSize: number | null, fallback: number): number {
  const max = Math.max(poolSize ?? fallback, 1);
  if (size.kind === "all") return max;
  const n = size.kind === "preset" ? size.count : Number(size.text);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(Math.floor(n), max));
}
