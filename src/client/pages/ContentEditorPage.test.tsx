import { expect, mock, spyOn, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { editorSnapshot, mockApi } from "../../../tests/support/mock-api";
import { ContentEditorPage } from "./ContentEditorPage";

test("searches questions and submits category changes with the loaded revision", async () => {
  const calls = mockApi({
    "GET /api/content/editor": () => ({ body: editorSnapshot }),
    "POST /api/content/editor": () => ({ body: { ...editorSnapshot, revision: "revision-2" } }),
  });
  render(<ContentEditorPage onDirtyChange={mock(() => {})} />);
  await userEvent.type(await screen.findByLabelText("Search questions"), "missing");
  expect(screen.getByText("No matches.")).toBeTruthy();
  await userEvent.clear(screen.getByLabelText("Search questions"));
  await userEvent.click(screen.getByRole("button", { name: /zuerst/ }));
  await userEvent.click(screen.getByLabelText("Review"));
  await userEvent.click(screen.getByRole("button", { name: "Save assignments" }));
  expect((await screen.findByRole("status")).textContent).toContain("Saved");
  expect(calls.find((c) => c.method === "POST")!.body).toEqual({ revision: "revision-1", change: { kind: "assign-categories", modeId: "flashcards", questionId: "q1", categoryIds: ["time", "review"] } });
});

test("keeps unsaved changes on conflict and asks before discarding them", async () => {
  mockApi({
    "GET /api/content/editor": () => ({ body: editorSnapshot }),
    "POST /api/content/editor": () => ({ status: 409, body: { error: "Content changed. Reload the editor." } }),
  });
  const confirm = spyOn(window, "confirm").mockReturnValue(false);
  try {
    render(<ContentEditorPage onDirtyChange={mock(() => {})} />);
    await userEvent.click(await screen.findByRole("button", { name: "New category" }));
    await userEvent.type(screen.getByLabelText("Name"), "My draft");
    await userEvent.click(screen.getByRole("button", { name: "Save category" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Reload the editor");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("My draft");
    await userEvent.click(screen.getByRole("button", { name: "Questions" }));
    expect(confirm).toHaveBeenCalledWith("Discard unsaved edits?");
    expect(screen.getByLabelText("Name")).toBeTruthy();
  } finally { confirm.mockRestore(); }
});
