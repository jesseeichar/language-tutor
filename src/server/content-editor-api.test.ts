import { expect, test } from "bun:test";
import type { ContentEdit, EditorSnapshot, ModeSummary } from "../shared";
import { copyFixtureData } from "../../tests/support/fixtures";
import { startServer } from "./app";

test("category edits persist through the API and immediately affect session selection", async () => {
  const copy = copyFixtureData();
  const server = startServer({ dataDir: copy.dir, progressPath: null, port: 0 });
  const base = `http://localhost:${server.port}`;
  const post = (path: string, body: unknown, editor = false) => fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json", ...(editor ? { "X-Language-Tutor-Edit": "1" } : {}) }, body: JSON.stringify(body),
  });
  try {
    let data = await (await fetch(`${base}/api/content/editor`)).json() as EditorSnapshot;
    const edit = async (change: ContentEdit["change"]) => {
      const res = await post("/api/content/editor", { revision: data.revision, change }, true);
      expect(res.status).toBe(200);
      data = await res.json() as EditorSnapshot;
    };
    expect((await post("/api/content/editor", {}, false)).status).toBe(403);
    expect((await post("/api/content/editor", { revision: data.revision, change: { kind: "assign-categories", modeId: "flashcards", questionId: "fc-zuerst", categoryIds: [] } }, true)).status).toBe(400);
    await edit({ kind: "create-category", category: { label: "Weekend", group: "Custom" } });
    const id = data.categories.at(-1)!.id;
    await edit({ kind: "assign-categories", modeId: "flashcards", questionId: "fc-zuerst", categoryIds: [id] });
    const modes = await (await fetch(`${base}/api/modes`)).json() as ModeSummary[];
    expect(modes[0]!.categories.find((c) => c.id === id)?.count).toBe(1);
    const session = await post("/api/sessions", { modeId: "flashcards", categoryIds: [id] });
    expect(session.status).toBe(200);
    expect((await session.json() as { questions: { id: string }[] }).questions.map((q) => q.id)).toEqual(["fc-zuerst"]);
  } finally { server.stop(true); copy.cleanup(); }
});
