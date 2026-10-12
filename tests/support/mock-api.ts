/** Replaces fetch with canned API responses for client tests. */
import type { CategoryCount, CreateSessionResponse, FlashcardQuestion, ModeSummary, SessionSummary } from "../../src/shared";

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (body: unknown, path: string) => { status?: number; body: unknown };

/** Routes are "METHOD /path"; a path may end in * to match a prefix. */
export function mockApi(routes: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, body });
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(" ");
      return m === method && (p!.endsWith("*") ? url.pathname.startsWith(p!.slice(0, -1)) : p === url.pathname);
    });
    if (!key) return new Response(JSON.stringify({ error: `unmocked ${method} ${url.pathname}` }), { status: 500 });
    const res = routes[key]!(body, url.pathname);
    return new Response(JSON.stringify(res.body), { status: res.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

export const category = (id: string, group: string, count: number, parent?: string): CategoryCount => ({
  id, label: `Label ${id}`, group, count, parent,
});

export const flashcardMode: ModeSummary = {
  id: "flashcards",
  title: "Flashcards",
  description: "Study tool.",
  graded: false,
  defaultSessionSize: 20,
  questionCount: 3,
  categories: [
    category("vocab-connectors", "Vokabular", 2),
    category("vocab-time", "Vokabular", 1, "vocab-connectors"),
    category("grammar-cases", "Grammatik", 1),
  ],
  questionTypes: [
    { id: "translation", label: "Translation", count: 2 },
    { id: "fill-in-the-blank", label: "Fill in the blank", count: 1 },
  ],
  directional: true,
};

const cards: FlashcardQuestion[] = [
  { id: "c1", type: "translation", categories: ["vocab-time"], refs: { words: [], topics: [] }, de: "zuerst", en: "first" },
  { id: "c2", type: "fill-in-the-blank", categories: ["vocab-time"], refs: { words: [], topics: [] }, front: "Wir essen, ___ gehen wir.", back: "danach", notes: "after that" },
];

export const sessionResponse: CreateSessionResponse = {
  session: {
    id: "s1", modeId: "flashcards", graded: false, categoryIds: ["vocab-time"],
    questionTypes: null, direction: "random", repeatOf: null, startedAt: "2026-10-12T00:00:00Z",
  },
  questions: cards,
  directions: { c1: "en-de" },
};

export const summary = (answered: number): SessionSummary => ({
  session: sessionResponse.session,
  totalQuestions: 2,
  answered,
  correct: null,
  pointsAwarded: 0,
  pointsPossible: 0,
});
