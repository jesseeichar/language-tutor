import { describe, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { listSnapshot, mockApi, withMembership } from "../../../tests/support/mock-api";
import { useListMembership, type MembershipIntent } from "./useListMembership";

const intent: MembershipIntent = { modeId: "flashcards", questionId: "c1", categoryId: "needs-work", member: true };
const added = withMembership(listSnapshot, "c1", "needs-work", true);

describe("useListMembership", () => {
  test("loads nothing while disabled and the snapshot once enabled", async () => {
    const calls = mockApi({ "GET /api/content/editor": () => ({ body: listSnapshot }) });
    const hook = renderHook(({ enabled }) => useListMembership(enabled), { initialProps: { enabled: false } });
    expect(calls).toHaveLength(0);
    hook.rerender({ enabled: true });
    await waitFor(() => expect(hook.result.current.snapshot).toEqual(listSnapshot));
    expect(calls).toHaveLength(1);
  });

  test("saves a change against the loaded revision and publishes the result", async () => {
    const calls = mockApi({ "GET /api/content/editor": () => ({ body: listSnapshot }), "POST /api/content/editor": () => ({ body: added }) });
    const hook = renderHook(() => useListMembership(true));
    await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
    act(() => hook.result.current.setMembership(intent));
    expect(hook.result.current.pending).toBe(true);
    act(() => hook.result.current.setMembership({ ...intent, member: false })); // ignored while saving
    await waitFor(() => expect(hook.result.current.pending).toBe(false));
    expect(hook.result.current.snapshot).toEqual(added);
    expect(calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([{ revision: "list-1", change: { kind: "set-list-membership", ...intent } }]);
  });

  test("a stale revision reloads the content and applies the same intent again", async () => {
    let revision = "list-1";
    const calls = mockApi({
      "GET /api/content/editor": () => ({ body: { ...listSnapshot, revision } }),
      "POST /api/content/editor": (body) => (body as { revision: string }).revision === "list-2" ? { body: added } : { status: 409, body: { error: "Content changed." } },
    });
    const hook = renderHook(() => useListMembership(true));
    await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
    revision = "list-2";
    act(() => hook.result.current.setMembership(intent));
    await waitFor(() => expect(hook.result.current.snapshot).toEqual(added));
    expect(hook.result.current.error).toBeNull();
    expect(calls.map((c) => `${c.method} ${(c.body as { revision?: string })?.revision ?? ""}`.trim())).toEqual(["GET", "POST list-1", "GET", "POST list-2"]);
  });

  test("other failures keep the saved state and offer a retry", async () => {
    let fail = true;
    mockApi({
      "GET /api/content/editor": () => ({ body: listSnapshot }),
      "POST /api/content/editor": () => fail ? { status: 500, body: { error: "disk full" } } : { body: added },
    });
    const hook = renderHook(() => useListMembership(true));
    await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
    act(() => hook.result.current.setMembership(intent));
    await waitFor(() => expect(hook.result.current.error).not.toBeNull());
    expect((hook.result.current.error as Error).message).toBe("disk full");
    expect(hook.result.current.snapshot).toEqual(listSnapshot);
    fail = false;
    act(() => hook.result.current.retry!());
    await waitFor(() => expect(hook.result.current.snapshot).toEqual(added));
    expect(hook.result.current.error).toBeNull();
  });

  test("a failed load can be retried", async () => {
    let fail = true;
    mockApi({ "GET /api/content/editor": () => fail ? { status: 500, body: { error: "broken" } } : { body: listSnapshot } });
    const hook = renderHook(() => useListMembership(true));
    await waitFor(() => expect(hook.result.current.error).not.toBeNull());
    fail = false;
    act(() => hook.result.current.retry!());
    await waitFor(() => expect(hook.result.current.snapshot).toEqual(listSnapshot));
  });
});
