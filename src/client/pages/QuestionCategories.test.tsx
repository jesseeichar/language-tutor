import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { editorSnapshot } from "../../../tests/support/mock-api";
import { QuestionCategories } from "./QuestionCategories";

test("requires at least one category and saves the selected assignments", async () => {
  const save = mock(() => {});
  render(<QuestionCategories question={editorSnapshot.questions[0]!} data={editorSnapshot} busy={false} onDirty={() => {}} onSave={save} />);
  await userEvent.click(screen.getByLabelText("Time"));
  expect(screen.getByRole("button", { name: "Save assignments" }).hasAttribute("disabled")).toBe(true);
  await userEvent.click(screen.getByLabelText("Review"));
  await userEvent.click(screen.getByRole("button", { name: "Save assignments" }));
  expect(save).toHaveBeenCalledWith({ kind: "assign-categories", modeId: "flashcards", questionId: "q1", categoryIds: ["review"] });
});
