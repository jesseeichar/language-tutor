import { expect, test } from "bun:test";
import { startServer } from "./app";
import { FIXTURE_DATA_DIR } from "../../tests/support/fixtures";
import type { CreateSessionResponse, WorksheetQuestion } from "../shared";

test("one-click worksheets ignore filters and counts, preserve all ten sections and allow repeat", async () => {
  const server = startServer({ dataDir: FIXTURE_DATA_DIR, progressPath: null, port: 0 });
  const post = (path: string, body: unknown) => fetch(`http://localhost:${server.port}${path}`, { method: "POST", body: JSON.stringify(body) });
  try {
    const session = await (await post("/api/sessions", { modeId: "worksheet", categoryIds: ["irrelevant"], count: 1, questionTypes: ["irrelevant"], direction: "en-de" })).json() as CreateSessionResponse;
    expect(session.questions.map(q => q.id)).toEqual(Array.from({ length: 10 }, (_, i) => `ablauf-${String(i + 1).padStart(2, "0")}`));
    expect(session.session.direction).toBeNull();
    expect(session.directions).toEqual({});
    expect(session.questions.reduce((sum, q) => sum + (q as WorksheetQuestion).items.length, 0)).toBe(62);
    const first = session.questions[0] as WorksheetQuestion;
    const answers = Object.fromEntries(first.items.map(item => [item.id, item.kind === "choice" ? item.answer : ""]));
    const graded = await (await post(`/api/sessions/${session.session.id}/answers`, { questionId: first.id, response: { answers } })).json();
    expect(graded).toMatchObject({ pointsAwarded: 16, pointsPossible: 16, grade: { correct: true } });
    const repeated = await (await post(`/api/sessions/${session.session.id}/repeat`, {})).json() as CreateSessionResponse;
    expect(repeated.questions).toEqual(session.questions);
  } finally { server.stop(true); }
});
