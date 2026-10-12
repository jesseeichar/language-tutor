import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import type { CreateSessionResponse, ModeSummary, SessionSummary, SubmitAnswerResponse } from "../shared";
import { copyFixtureData, FIXTURE_DATA_DIR, writeJson } from "../../tests/support/fixtures";
import { startServer } from "./app";

let server: Server<undefined>;
let base: string;

beforeAll(() => {
  server = startServer({ dataDir: FIXTURE_DATA_DIR, dbPath: ":memory:", port: 0 });
  base = `http://localhost:${server.port}`;
});
afterAll(() => server.stop(true));

async function call<T>(path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(base + path, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

const startFlashcards = (categoryIds: string[], count?: number, extra: Record<string, unknown> = {}) =>
  call<CreateSessionResponse>("/api/sessions", { modeId: "flashcards", categoryIds, count, ...extra });

describe("GET /api/modes", () => {
  test("lists modes with per-category counts, parents including children", async () => {
    const { status, body } = await call<ModeSummary[]>("/api/modes");
    expect(status).toBe(200);
    const fc = body.find((m) => m.id === "flashcards")!;
    expect(fc.graded).toBe(false);
    expect(fc.questionCount).toBe(4);
    const counts = Object.fromEntries(fc.categories.map((c) => [c.id, c.count]));
    expect(counts["vocab-connectors"]).toBe(2);
    expect(counts["vocab-time"]).toBe(1);
    expect(counts.unused).toBeUndefined();
  });

  test("lists question types with counts and whether the mode is directional", async () => {
    const fc = (await call<ModeSummary[]>("/api/modes")).body.find((m) => m.id === "flashcards")!;
    expect(fc.questionTypes.map((t) => [t.id, t.count])).toEqual([["translation", 3], ["fill-in-the-blank", 1]]);
    expect(fc.directional).toBe(true);
  });
});

describe("sessions", () => {
  test("only questions from the selected categories are used", async () => {
    const { status, body } = await startFlashcards(["vocab-connectors", "grammar-cases"]);
    expect(status).toBe(200);
    expect(body.questions.map((q) => q.id).sort()).toEqual(["fc-jedoch", "fc-kasus", "fc-zuerst"]);
    expect(body.session.graded).toBe(false);
  });

  test("question types narrow the session", async () => {
    const all = ["vocab-connectors", "vocab-work", "grammar-cases"];
    const { body } = await startFlashcards(all, undefined, { questionTypes: ["fill-in-the-blank"] });
    expect(body.questions.map((q) => q.id)).toEqual(["fc-kasus"]);
    const none = await startFlashcards(["vocab-work"], undefined, { questionTypes: ["fill-in-the-blank"] });
    expect(none.status).toBe(400);
    expect((await startFlashcards(all, undefined, { questionTypes: [] })).status).toBe(400);
  });

  test("a chosen direction applies to every translation card, not to fixed cards", async () => {
    const all = ["vocab-connectors", "vocab-work", "grammar-cases"];
    const { body } = await startFlashcards(all, undefined, { direction: "en-de" });
    expect(body.directions).toEqual({ "fc-zuerst": "en-de", "fc-jedoch": "en-de", "fc-lohn": "en-de" });
  });

  test("direction defaults to random", async () => {
    const { body } = await startFlashcards(["vocab-connectors", "vocab-work"]);
    expect(Object.keys(body.directions).sort()).toEqual(["fc-jedoch", "fc-lohn", "fc-zuerst"]);
    for (const d of Object.values(body.directions)) expect(["de-en", "en-de"]).toContain(d);
    expect((await startFlashcards(["vocab-work"], undefined, { direction: "sideways" })).status).toBe(400);
  });

  test("count limits the session size", async () => {
    const { body } = await startFlashcards(["vocab-connectors", "vocab-work", "grammar-cases"], 2);
    expect(body.questions).toHaveLength(2);
  });

  test("full flashcard flow: reveal, then finish with 0 points", async () => {
    const { body } = await startFlashcards(["vocab-work"]);
    const sid = body.session.id;
    const answer = await call<SubmitAnswerResponse>(`/api/sessions/${sid}/answers`, {
      questionId: "fc-lohn", response: { revealed: true },
    });
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ grade: null, pointsAwarded: 0, pointsPossible: 0 });

    const summary = await call<SessionSummary>(`/api/sessions/${sid}/finish`, {});
    expect(summary.body).toMatchObject({ answered: 1, totalQuestions: 1, correct: null, pointsAwarded: 0, pointsPossible: 0 });

    const late = await call(`/api/sessions/${sid}/answers`, { questionId: "fc-lohn", response: { revealed: true } });
    expect(late.status).toBe(409);
  });

  test("rejects answering twice, foreign questions and bad responses", async () => {
    const { body } = await startFlashcards(["vocab-work"]);
    const path = `/api/sessions/${body.session.id}/answers`;
    expect((await call(path, { questionId: "fc-zuerst", response: { revealed: true } })).status).toBe(400);
    expect((await call(path, { questionId: "fc-lohn", response: { revealed: "yes" } })).status).toBe(400);
    expect((await call(path, { questionId: "fc-lohn", response: { revealed: true } })).status).toBe(200);
    expect((await call(path, { questionId: "fc-lohn", response: { revealed: true } })).status).toBe(409);
  });

  test("validation errors", async () => {
    expect((await call("/api/sessions", { modeId: "flashcards", categoryIds: [] })).status).toBe(400);
    expect((await call("/api/sessions", { modeId: "nope", categoryIds: ["vocab-work"] })).status).toBe(404);
    expect((await call("/api/sessions", { modeId: "flashcards", categoryIds: ["unused"] })).status).toBe(400);
    expect((await call("/api/sessions/missing/finish", {})).status).toBe(404);
    const res = await fetch(`${base}/api/sessions`, { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
  });

  test("unknown API paths return 404 JSON", async () => {
    const { status, body } = await call<{ error: string }>("/api/nothing-here");
    expect(status).toBe(404);
    expect(body.error).toBe("Not found");
  });
});

describe("broken data", () => {
  test("returns 500 with the list of problems", async () => {
    const copy = copyFixtureData();
    writeJson(copy.dir, "vocabulary.json", "{ broken");
    const broken = startServer({ dataDir: copy.dir, dbPath: ":memory:", port: 0 });
    try {
      const res = await fetch(`http://localhost:${broken.port}/api/modes`);
      const body = (await res.json()) as { error: string; details: string[] };
      expect(res.status).toBe(500);
      expect(body.details.some((d) => d.startsWith("vocabulary.json"))).toBe(true);
    } finally {
      broken.stop(true);
      copy.cleanup();
    }
  });
});
