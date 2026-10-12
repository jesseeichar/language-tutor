import { describe, expect, test } from "bun:test";
import { QuestionBaseSchema, type QuestionBase } from "../shared";
import { selectQuestions, shuffle, weakness, type QuestionHistory } from "./selection";

const q = (id: string, words: string[] = []): QuestionBase => QuestionBaseSchema.parse({ id, categories: ["c"], refs: { words } });

/** Deterministic PRNG so tests are repeatable. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

const seen = (ids: string[], lastSeen = "2026-01-01T00:00:00Z") =>
  new Map<string, QuestionHistory>(ids.map((id) => [id, { timesSeen: 1, lastSeen }]));

describe("weakness", () => {
  test("is neutral for questions without refs", () => expect(weakness(q("a"), new Map())).toBe(0.5));
  test("is 1 for the weakest and 0 for the strongest items", () => {
    expect(weakness(q("a", ["w"]), new Map([["word:w", -10]]))).toBe(1);
    expect(weakness(q("a", ["w"]), new Map([["word:w", 10]]))).toBe(0);
  });
  test("averages over all referenced items", () => {
    const s = new Map([["word:x", 10], ["word:y", -10]]);
    expect(weakness(q("a", ["x", "y"]), s)).toBe(0.5);
  });
});

describe("selectQuestions", () => {
  const pool = Array.from({ length: 20 }, (_, i) => q(`q${i}`));

  test("returns the requested number of distinct questions", () => {
    const out = selectQuestions({ questions: pool, count: 10, history: new Map(), strengths: new Map(), random: seeded(1) });
    expect(out).toHaveLength(10);
    expect(new Set(out.map((x) => x.id)).size).toBe(10);
  });

  test("never returns more than the pool", () => {
    const out = selectQuestions({ questions: pool.slice(0, 3), count: 10, history: new Map(), strengths: new Map() });
    expect(out).toHaveLength(3);
  });

  test("a majority of the session is fresh when enough fresh questions exist", () => {
    const history = seen(pool.slice(0, 10).map((x) => x.id));
    for (let s = 1; s <= 20; s++) {
      const out = selectQuestions({ questions: pool, count: 10, history, strengths: new Map(), random: seeded(s) });
      const fresh = out.filter((x) => !history.has(x.id)).length;
      expect(fresh).toBeGreaterThanOrEqual(6);
    }
  });

  test("fills up with seen questions when fresh ones run out", () => {
    const history = seen(pool.slice(0, 18).map((x) => x.id));
    const out = selectQuestions({ questions: pool, count: 10, history, strengths: new Map(), random: seeded(3) });
    expect(out).toHaveLength(10);
    expect(out.filter((x) => !history.has(x.id))).toHaveLength(2);
  });

  test("weak words come back more often than strong ones", () => {
    const weak = q("weak", ["w"]);
    const strong = q("strong", ["s"]);
    const history = seen(["weak", "strong"], "2026-10-01T00:00:00Z");
    const strengths = new Map([["word:w", -10], ["word:s", 10]]);
    let weakPicks = 0;
    for (let s = 1; s <= 400; s++) {
      const [pick] = selectQuestions({
        questions: [weak, strong], count: 1, history, strengths, random: seeded(s), now: new Date("2026-10-02T00:00:00Z"),
      });
      if (pick!.id === "weak") weakPicks++;
    }
    expect(weakPicks).toBeGreaterThan(300);
  });
});

describe("shuffle", () => {
  test("keeps every element", () => {
    expect(shuffle([1, 2, 3, 4], seeded(9)).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("session quotas", () => {
  const vocabulary = Array.from({ length: 40 }, (_, i) => q(`v${i}`, ["w"]));
  const grammar = Array.from({ length: 10 }, (_, i) => ({ ...q(`g${i}`), refs: { words: [], topics: ["t"] } }));
  const quota = { share: 1 / 6, matches: (q: QuestionBase) => q.refs.topics.length > 0 };
  const choose = (questions: QuestionBase[], count = 30) => selectQuestions({ questions, count, quota, history: new Map(), strengths: new Map(), random: seeded(10) });
  test("reserves five of thirty for grammar and still samples without replacement", () => {
    const selected = choose([...vocabulary, ...grammar]);
    expect(selected.filter(quota.matches)).toHaveLength(5);
    expect(selected.filter(q => !quota.matches(q))).toHaveLength(25);
    expect(new Set(selected.map(q => q.id)).size).toBe(30);
  });
  test("shortages fill from the other pool, and single-type filters stay usable", () => {
    expect(choose([...vocabulary, ...grammar.slice(0, 2)]).filter(quota.matches)).toHaveLength(2);
    expect(choose([...vocabulary.slice(0, 2), ...grammar])).toHaveLength(12);
    expect(choose(vocabulary)).toHaveLength(30);
    expect(choose(grammar)).toHaveLength(10);
    expect(choose([], 30)).toEqual([]);
    expect(choose([...vocabulary, ...grammar], 6).filter(quota.matches)).toHaveLength(1);
  });
  test("freshness remains a majority within each quota when available", () => {
    const pool = [...vocabulary, ...grammar];
    const history = seen([...vocabulary.slice(0, 20), ...grammar.slice(0, 5)].map(q => q.id));
    const selected = selectQuestions({ questions: pool, count: 30, quota, history, strengths: new Map(), random: seeded(8) });
    expect(selected.filter(q => !history.has(q.id))).toHaveLength(18);
  });
});
