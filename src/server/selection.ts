/**
 * Chooses which questions go into a session.
 *
 * Rules, from the learner's notes:
 *  - A majority of each session is fresh: questions never asked before.
 *  - Words and topics the learner struggles with come back more often.
 *  - Otherwise the pick is random.
 *
 * The function is pure. The caller supplies history and strengths, which keeps it easy to test.
 */
import type { QuestionBase } from "../shared";
import { MAX_STRENGTH, MIN_STRENGTH } from "./scoring";

export interface QuestionHistory {
  timesSeen: number;
  /** ISO timestamp of the last time it was answered or revealed. */
  lastSeen: string;
}

export interface SelectionInput {
  questions: readonly QuestionBase[];
  count: number;
  /** Keyed by question id. Missing = never seen. */
  history: ReadonlyMap<string, QuestionHistory>;
  /** Keyed by "word:<id>" or "topic:<id>". Missing = 0. */
  strengths: ReadonlyMap<string, number>;
  /** Share of the session reserved for fresh questions when enough exist. */
  freshShare?: number;
  now?: Date;
  random?: () => number;
  quota?: { share: number; matches(question: QuestionBase): boolean };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 0 for a fully known item, 1 for a fully unknown one. Questions without refs count as neutral (0.5). */
export function weakness(q: QuestionBase, strengths: ReadonlyMap<string, number>): number {
  const keys = [...q.refs.words.map((w) => `word:${w}`), ...q.refs.topics.map((t) => `topic:${t}`)];
  if (keys.length === 0) return 0.5;
  const avg = keys.reduce((sum, k) => sum + (strengths.get(k) ?? 0), 0) / keys.length;
  return (MAX_STRENGTH - avg) / (MAX_STRENGTH - MIN_STRENGTH);
}

/** Weighted sampling without replacement (Efraimidis-Spirakis). */
function weightedSample<T>(items: readonly T[], weight: (t: T) => number, k: number, random: () => number): T[] {
  return items
    .map((item) => ({ item, key: Math.pow(random(), 1 / Math.max(weight(item), 1e-6)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, k)
    .map((x) => x.item);
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function selectQuestions(input: SelectionInput): QuestionBase[] {
  const { questions, history, strengths } = input;
  const random = input.random ?? Math.random;
  const now = (input.now ?? new Date()).getTime();
  const count = Math.min(input.count, questions.length);
  const freshShare = input.freshShare ?? 0.6;

  if (input.quota) {
    const reserved = questions.filter(input.quota.matches);
    const remaining = questions.filter((q) => !input.quota!.matches(q));
    const reservedCount = Math.min(reserved.length, Math.max(Math.round(count * input.quota.share), count - remaining.length));
    const pick = (pool: readonly QuestionBase[], size: number) => selectQuestions({ ...input, questions: pool, count: size, quota: undefined });
    return shuffle([...pick(reserved, reservedCount), ...pick(remaining, count - reservedCount)], random);
  }

  const fresh = questions.filter((q) => !history.has(q.id));
  const seen = questions.filter((q) => history.has(q.id));

  const freshTarget = Math.min(fresh.length, Math.max(Math.ceil(count * freshShare), count - seen.length));
  const seenTarget = Math.min(seen.length, count - freshTarget);

  // Fresh questions about weak words still go first.
  const freshWeight = (q: QuestionBase) => 0.5 + weakness(q, strengths);

  // Seen questions: weak items and ones not seen for a while are favoured.
  const seenWeight = (q: QuestionBase) => {
    const h = history.get(q.id)!;
    const days = (now - new Date(h.lastSeen).getTime()) / DAY_MS;
    const staleness = Math.min(Math.max(days, 0) / 14, 1);
    return 0.2 + 2 * weakness(q, strengths) + staleness;
  };

  const picked = [
    ...weightedSample(fresh, freshWeight, freshTarget, random),
    ...weightedSample(seen, seenWeight, seenTarget, random),
  ];
  return shuffle(picked, random);
}
