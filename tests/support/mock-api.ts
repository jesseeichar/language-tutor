/** Replaces fetch with canned API responses for client tests. */
import type { CategoryCount, CreateSessionResponse, EditorSnapshot, FlashcardQuestion, ModeSummary, SessionSummary } from "../../src/shared";

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

/** Content matching `sessionResponse`: c2 belongs to Tricky through its child category. */
export const listSnapshot: EditorSnapshot = {
  revision: "list-1",
  categories: [
    { id: "vocab-connectors", label: "Connectors", group: "Vokabular" },
    { id: "vocab-time", label: "Time", group: "Vokabular", parent: "vocab-connectors" },
    { id: "needs-work", label: "Needs work", group: "Lists", isList: true },
    { id: "tricky", label: "Tricky", group: "Lists", isList: true },
    { id: "tricky-child", label: "Tricky child", group: "Lists", parent: "tricky" },
  ],
  questions: [
    { id: "c1", modeId: "flashcards", modeTitle: "Flashcards", preview: "zuerst — first", type: "translation", categories: ["vocab-time"] },
    { id: "c2", modeId: "flashcards", modeTitle: "Flashcards", preview: "Wir essen, ___ gehen wir. — danach", type: "fill-in-the-blank", categories: ["vocab-time", "tricky-child"] },
    { id: "q1", modeId: "quiz", modeTitle: "Quiz", preview: "quiz question", categories: ["needs-work"] },
  ],
  usage: {},
};

/** The snapshot after applying one membership change, as the server would return it. */
export function withMembership(snapshot: EditorSnapshot, questionId: string, categoryId: string, member: boolean, revision = `${snapshot.revision}+`): EditorSnapshot {
  return { ...snapshot, revision, questions: snapshot.questions.map((q) => q.id !== questionId ? q : {
    ...q, categories: member ? [...q.categories.filter((c) => c !== categoryId), categoryId] : q.categories.filter((c) => c !== categoryId),
  }) };
}

export const editorSnapshot: EditorSnapshot = {
  revision: "revision-1",
  categories: [{ id: "time", label: "Time", group: "Vocabulary" }, { id: "review", label: "Review", group: "Custom" }],
  questions: [{ id: "q1", modeId: "flashcards", modeTitle: "Flashcards", preview: "zuerst — first", categories: ["time"] }],
  usage: { time: { questions: 1, words: 1, topics: 0, children: 0 }, review: { questions: 0, words: 0, topics: 0, children: 0 } },
};
