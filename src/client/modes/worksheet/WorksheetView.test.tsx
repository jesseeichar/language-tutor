import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorksheetQuestion, SubmitAnswerResponse } from "../../../shared";
import { stubClipboard } from "../../../../tests/support/clipboard";
import { WorksheetView } from "./WorksheetView";

const question: WorksheetQuestion = { id: "one", categories: ["c"], refs: { words: [], topics: [] }, title: "One exercise", instructions: "Fill the gap.",
  items: [{ id: "blank", kind: "blank", prompt: "___ gehe ich.", answers: ["Danach"] }] };
const result = { grade: { correct: true, score: 1, feedback: "1. Correct — Answer: Danach" }, pointsAwarded: 1, pointsPossible: 1 };

test("requires answers, preserves input on failure, then shows feedback and locks the exercise", async () => {
  const submit = mock<() => Promise<SubmitAnswerResponse>>(async () => { throw new Error("Try again"); });
  const next = mock();
  render(<WorksheetView question={question} direction={null} isLast={false} submit={submit} next={next} />);
  expect(screen.getByRole("button", { name: "Check exercise" }).hasAttribute("disabled")).toBe(true);
  await userEvent.type(screen.getByLabelText("1. ___ gehe ich."), "Danach");
  await userEvent.click(screen.getByRole("button", { name: "Check exercise" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Try again");
  expect((screen.getByLabelText("1. ___ gehe ich.") as HTMLInputElement).value).toBe("Danach");
  submit.mockImplementation(async () => result);
  await userEvent.click(screen.getByRole("button", { name: "Check exercise" }));
  expect(submit).toHaveBeenLastCalledWith({ answers: { blank: "Danach" } });
  expect(screen.getByRole("status").textContent).toContain("1 / 1 points");
  expect(screen.getByLabelText("1. ___ gehe ich.").hasAttribute("disabled")).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Next exercise" }));
  expect(next).toHaveBeenCalledTimes(1);
});

test("copies the exercise as text: heading lines, then numbered items with their options, without solutions", async () => {
  const writeText = stubClipboard();
  const full: WorksheetQuestion = { ...question, wordBank: ["zuerst", "danach"], example: "Zuerst esse ich.", items: [
    ...question.items,
    { id: "choice", kind: "choice", prompt: "deshalb", options: [{ value: "a", label: "Zeit" }, { value: "b", label: "Grund" }], answer: "b" },
  ] };
  render(<WorksheetView question={full} direction={null} isLast={false} submit={mock()} next={mock()} />);
  await userEvent.click(screen.getByRole("button", { name: "Copy exercise" }));
  expect(writeText).toHaveBeenCalledWith("One exercise\nFill the gap.\nzuerst – danach\nBeispiel: Zuerst esse ich.\n\n1. ___ gehe ich.\n2. deshalb (Zeit / Grund)");
});

test("an exercise without a word bank or example copies no empty heading lines", async () => {
  const writeText = stubClipboard();
  render(<WorksheetView question={question} direction={null} isLast={false} submit={mock()} next={mock()} />);
  await userEvent.click(screen.getByRole("button", { name: "Copy exercise" }));
  expect(writeText).toHaveBeenCalledWith("One exercise\nFill the gap.\n\n1. ___ gehe ich.");
});
