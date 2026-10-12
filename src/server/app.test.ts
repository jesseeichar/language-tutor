import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreateSessionResponse, ModeSummary, SessionLogEntry, SessionSummary, SubmitAnswerResponse } from "../shared";
import { copyFixtureData, FIXTURE_DATA_DIR, writeJson } from "../../tests/support/fixtures";
import { startServer } from "./app";

let server: Server<undefined>;
let base: string;

beforeAll(() => {
  server = startServer({ dataDir: FIXTURE_DATA_DIR, progressPath: null, port: 0 });
  base = `http://localhost:${server.port}`;
});
afterAll(() => server.stop(true));

test("a restored progress file serves the same history and repeats after restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lt-api-recovery-"));
  const originalPath = join(dir, "progress.json");
  const restoredPath = join(dir, "restored.json");
  let local = startServer({ dataDir: FIXTURE_DATA_DIR, progressPath: originalPath, port: 0 });
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(`http://localhost:${local.port}${path}`, body === undefined ? undefined : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  try {
    const original = await request("/api/sessions", {
      modeId: "flashcards", categoryIds: ["vocab-work"], direction: "en-de",
    }) as CreateSessionResponse;
    await request(`/api/sessions/${original.session.id}/answers`, {
      questionId: "fc-lohn", response: { revealed: true },
    });
    await request(`/api/sessions/${original.session.id}/finish`, {});
    const history = await request("/api/sessions");
    local.stop(true);
    copyFileSync(originalPath, restoredPath);
    local = startServer({ dataDir: FIXTURE_DATA_DIR, progressPath: restoredPath, port: 0 });
    expect(await request("/api/sessions")).toEqual(history);
    const repeat = await request(`/api/sessions/${original.session.id}/repeat`, {}) as CreateSessionResponse;
    expect(repeat.session.repeatOf).toBe(original.session.id);
    expect(repeat.questions).toEqual(original.questions);
    expect(repeat.directions).toEqual(original.directions);
  } finally {
    local.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
});

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

describe("progress backup API", () => {
  test("rejects requests without the app header before invoking Git", async () => {
    const res = await fetch(`${base}/api/progress/backup`, {
      method: "POST", headers: { Origin: "https://untrusted.example" },
    });
    expect(res.status).toBe(403);
  });

  test("reports missing saved progress without running Git", async () => {
    const res = await fetch(`${base}/api/progress/backup`, {
      method: "POST", headers: { "X-Language-Tutor-Backup": "1" },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "No saved progress to back up yet. Start a study session first." });
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

describe("session log and repeat", () => {
  const all = ["vocab-connectors", "vocab-work", "grammar-cases"];

  test("the log lists sessions newest first with the learner's choices", async () => {
    await startFlashcards(["vocab-work"]);
    const { body: latest } = await startFlashcards(all, undefined, { questionTypes: ["translation"], direction: "en-de" });
    const { body: log } = await call<SessionLogEntry[]>("/api/sessions");
    expect(log[0]!.session.id).toBe(latest.session.id);
    expect(log[0]).toMatchObject({
      modeTitle: "Flashcards",
      categoryLabels: ["Connectors", "Work", "Cases"],
      questionTypeLabels: ["Translation"],
      finishedAt: null,
      session: { direction: "en-de", repeatOf: null },
    });
  });

  test("a mode-wide session records no type filter, and no direction when nothing is directional", async () => {
    const { body } = await startFlashcards(["grammar-cases"]);
    expect(body.session).toMatchObject({ questionTypes: null, direction: null });
  });

  test("repeat replays the same questions, order and directions as a new linked session", async () => {
    const { body: original } = await startFlashcards(all);
    const { status, body: repeat } = await call<CreateSessionResponse>(`/api/sessions/${original.session.id}/repeat`, {});
    expect(status).toBe(200);
    expect(repeat.session.id).not.toBe(original.session.id);
    expect(repeat.session.repeatOf).toBe(original.session.id);
    expect(repeat.questions.map((q) => q.id)).toEqual(original.questions.map((q) => q.id));
    expect(repeat.directions).toEqual(original.directions);
    expect(repeat.session.categoryIds).toEqual(original.session.categoryIds);
  });

  test("a finished session can be repeated, and the repeat is answerable", async () => {
    const { body: original } = await startFlashcards(["vocab-work"]);
    await call(`/api/sessions/${original.session.id}/finish`, {});
    const { body: repeat } = await call<CreateSessionResponse>(`/api/sessions/${original.session.id}/repeat`, {});
    const answer = await call(`/api/sessions/${repeat.session.id}/answers`, { questionId: "fc-lohn", response: { revealed: true } });
    expect(answer.status).toBe(200);
  });

  test("repeating an unknown session is a 404", async () => {
    expect((await call("/api/sessions/nope/repeat", {})).status).toBe(404);
  });
});

describe("repeat after questions were deleted", () => {
  test("skips deleted questions, and refuses when none are left", async () => {
    const copy = copyFixtureData();
    const local = startServer({ dataDir: copy.dir, progressPath: null, port: 0 });
    const post = async (path: string, body: unknown) =>
      fetch(`http://localhost:${local.port}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    try {
      const original = (await (await post("/api/sessions", { modeId: "flashcards", categoryIds: ["vocab-time", "vocab-work"] })).json()) as CreateSessionResponse;
      const file = (await Bun.file(`${copy.dir}/questions/flashcards.json`).json()) as { questions: { id: string }[] };
      writeJson(copy.dir, "questions/flashcards.json", { ...file, questions: file.questions.filter((q) => q.id !== "fc-lohn") });
      const repeat = (await (await post(`/api/sessions/${original.session.id}/repeat`, {})).json()) as CreateSessionResponse;
      expect(repeat.questions.map((q) => q.id)).toEqual(["fc-zuerst"]);
      expect(Object.keys(repeat.directions)).toEqual(["fc-zuerst"]);

      writeJson(copy.dir, "questions/flashcards.json", { ...file, questions: file.questions.filter((q) => !["fc-lohn", "fc-zuerst"].includes(q.id)) });
      expect((await post(`/api/sessions/${original.session.id}/repeat`, {})).status).toBe(409);
    } finally {
      local.stop(true);
      copy.cleanup();
    }
  });
});

describe("broken data", () => {
  test("returns 500 with the list of problems", async () => {
    const copy = copyFixtureData();
    writeJson(copy.dir, "vocabulary.json", "{ broken");
    const broken = startServer({ dataDir: copy.dir, progressPath: null, port: 0 });
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
