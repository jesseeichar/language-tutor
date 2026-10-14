import { expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { editorSnapshot } from "../../../tests/support/mock-api";
import { CategoryForm } from "./CategoryForm";

test("creates a category with its chosen group and parent", async () => {
  const save = mock(() => {});
  const dirty = mock(() => {});
  render(<CategoryForm data={editorSnapshot} busy={false} onDirty={dirty} onSave={save} />);
  await userEvent.type(screen.getByLabelText("Name"), "Practice");
  await userEvent.selectOptions(screen.getByLabelText("Parent category"), "time");
  await userEvent.click(screen.getByRole("button", { name: "Save category" }));
  expect(save).toHaveBeenCalledWith({ kind: "create-category", category: { label: "Practice", group: "Custom", parent: "time" } });
  expect(dirty).toHaveBeenCalled();
});

test("the list toggle is saved only when on and shows the saved state when editing", async () => {
  const save = mock(() => {});
  render(<CategoryForm data={editorSnapshot} busy={false} onDirty={() => {}} onSave={save} />);
  await userEvent.type(screen.getByLabelText("Name"), "Weekend");
  await userEvent.click(screen.getByLabelText("Show in flashcard lists"));
  await userEvent.click(screen.getByRole("button", { name: "Save category" }));
  expect(save).toHaveBeenCalledWith({ kind: "create-category", category: { label: "Weekend", group: "Custom", isList: true } });
  cleanup();
  const list = { id: "needs-work", label: "Needs work", group: "Lists", isList: true };
  render(<CategoryForm category={list} data={{ ...editorSnapshot, categories: [...editorSnapshot.categories, list] }} busy={false} onDirty={() => {}} onSave={save} />);
  expect((screen.getByLabelText("Show in flashcard lists") as HTMLInputElement).checked).toBe(true);
  await userEvent.click(screen.getByLabelText("Show in flashcard lists"));
  await userEvent.click(screen.getByRole("button", { name: "Save category" }));
  expect(save).toHaveBeenLastCalledWith({ kind: "update-category", id: "needs-work", category: { label: "Needs work", group: "Lists" } });
});

test("used categories cannot be deleted or made their own parent", () => {
  render(<CategoryForm category={editorSnapshot.categories[0]} data={editorSnapshot} busy={false} onDirty={() => {}} onSave={() => {}} />);
  expect(screen.getByRole("button", { name: "Delete category" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("option", { name: "Vocabulary / Time" })).toBeNull();
});
