import { describe, expect, test } from "bun:test";
import { mockApi } from "../../tests/support/mock-api";
import { api, ApiRequestError } from "./api";

describe("api", () => {
  test("backup sends the required header and no client-controlled Git arguments", async () => {
    let captured: RequestInit | undefined;
    globalThis.fetch = (async (_: unknown, init?: RequestInit) => {
      captured = init;
      return Response.json({ remote: "origin", branch: "main", commit: "abc", createdCommit: true });
    }) as unknown as typeof fetch;
    expect((await api.backupProgress()).commit).toBe("abc");
    expect(captured?.method).toBe("POST");
    expect(new Headers(captured?.headers).get("X-Language-Tutor-Backup")).toBe("1");
    expect(captured?.body).toBeUndefined();
  });
  test("posts JSON and returns the parsed body", async () => {
    const calls = mockApi({ "POST /api/sessions/s1/answers": () => ({ body: { grade: null, pointsAwarded: 0, pointsPossible: 0 } }) });
    const res = await api.submitAnswer("s1", "q1", { revealed: true });
    expect(res.pointsPossible).toBe(0);
    expect(calls[0]).toEqual({ method: "POST", path: "/api/sessions/s1/answers", body: { questionId: "q1", response: { revealed: true } } });
  });

  test("reads the session log and repeats a session", async () => {
    const calls = mockApi({
      "GET /api/sessions": () => ({ body: [] }),
      "POST /api/sessions/s1/repeat": () => ({ body: { session: { id: "s2" }, questions: [], directions: {} } }),
    });
    expect(await api.sessionLog()).toEqual([]);
    expect((await api.repeatSession("s1")).session.id).toBe("s2");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /api/sessions", "POST /api/sessions/s1/repeat"]);
  });

  test("turns error responses into ApiRequestError with details", async () => {
    mockApi({ "GET /api/modes": () => ({ status: 500, body: { error: "Broken", details: ["a", "b"] } }) });
    const err = await api.modes().catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.message).toBe("Broken");
    expect(err.details).toEqual(["a", "b"]);
  });

  test("handles non-JSON error bodies", async () => {
    globalThis.fetch = (async () => new Response("oops", { status: 502 })) as unknown as typeof fetch;
    await expect(api.finishSession("s1")).rejects.toThrow("Request failed (502)");
  });
});
