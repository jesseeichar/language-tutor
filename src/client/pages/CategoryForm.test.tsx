import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
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

test("used categories cannot be deleted or made their own parent", () => {
  render(<CategoryForm category={editorSnapshot.categories[0]} data={editorSnapshot} busy={false} onDirty={() => {}} onSave={() => {}} />);
  expect(screen.getByRole("button", { name: "Delete category" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("option", { name: "Vocabulary / Time" })).toBeNull();
});
