import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorksheetQuestion, SubmitAnswerResponse } from "../../../shared";
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
