import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Direction, QuizQuestion, QuizResponse, SubmitAnswerResponse } from "../../../shared";
import { QuizView } from "./QuizView";

const base = { id: "q", categories: ["c"], refs: { words: [], topics: [] } };
const translation: QuizQuestion = { ...base, type: "translation", de: "Die Tür ist offen.", en: "The door is open." };
const blank: QuizQuestion = { ...base, type: "fill-in-the-blank", prompt: "Das ist ___ Tür.", answer: "die" };
const mc: QuizQuestion = { ...base, type: "multiple-choice", correctIndex: 2,
  de: { prompt: "Die Tür ist offen.", options: ["Cold.", "Hot.", "The door is open.", "Closed."] },
  en: { prompt: "The door is open.", options: ["Kalt.", "Heiss.", "Die Tür ist offen.", "Zu."] },
};
const correct: SubmitAnswerResponse = { grade: { correct: true, score: 1, feedback: "Expected answer: Die Tür ist offen." }, pointsAwarded: 1, pointsPossible: 1 };
const show = (question: QuizQuestion, direction: Direction | null = null, submit = mock<(r: QuizResponse) => Promise<SubmitAnswerResponse>>(() => Promise.resolve(correct)), isLast = false) => {
  const next = mock();
  render(<QuizView question={question} direction={direction} submit={submit} next={next} isLast={isLast} />);
  return { submit, next };
};

test("translation follows direction, sends literal text, and reveals feedback only after grading", async () => {
  const { submit, next } = show(translation, "en-de");
  expect(screen.getByRole("heading").textContent).toBe("The door is open.");
  expect(screen.queryByText("Die Tür ist offen.")).toBeNull();
  expect(screen.getByText(/Jev checks meaning and grammar/)).toBeTruthy();
  expect(screen.queryByText(/Match the expected answer exactly/)).toBeNull();
  expect(screen.getByRole("button", { name: "Check answer" }).hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: " Die Tür ist offen. " } });
  await userEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(submit).toHaveBeenCalledWith({ type: "translation", answer: " Die Tür ist offen. " });
  expect(screen.getByRole("status").textContent).toContain("Correct");
  expect(screen.getByLabelText("Your answer").hasAttribute("disabled")).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(next).toHaveBeenCalledTimes(1);
});

test.each(["de-en", "en-de"] as const)("multiple choice shows the %s options and submits only after confirmation", async (direction) => {
  const { submit } = show(mc, direction);
  expect(screen.getByRole("button", { name: "Check answer" }).hasAttribute("disabled")).toBe(true);
  const text = direction === "de-en" ? "The door is open." : "Die Tür ist offen.";
  await userEvent.click(screen.getByRole("radio", { name: text }));
  expect(submit).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(submit).toHaveBeenCalledWith({ type: "multiple-choice", optionIndex: 2 });
  expect(screen.getAllByRole("radio").every(r => r.closest("fieldset")!.disabled)).toBe(true);
});

test("a blank checks missing text and shows incorrect feedback before Finish", async () => {
  const submit = mock(() => Promise.resolve({ grade: { correct: false, score: 0, feedback: "Expected answer: die" }, pointsAwarded: 0, pointsPossible: 1 }));
  show(blank, null, submit, true);
  expect(screen.getByRole("heading").textContent).toBe("Das ist ___ Tür.");
  expect(screen.getByText(/Match the expected answer exactly/)).toBeTruthy();
  await userEvent.type(screen.getByLabelText("Your answer"), "der{Enter}");
  expect(submit).toHaveBeenCalledWith({ type: "fill-in-the-blank", answer: "der" });
  expect(screen.getByRole("status").textContent).toContain("Incorrect");
  expect(screen.getByRole("status").textContent).toContain("Expected answer: die");
  expect(screen.getByRole("button", { name: "Finish" })).toBeTruthy();
});

test("pending requests cannot be duplicated and failures leave the answer available for retry", async () => {
  let reject!: (e: Error) => void;
  const submit = mock<(r: QuizResponse) => Promise<SubmitAnswerResponse>>(() => new Promise((_, fail) => { reject = fail; }));
  show(translation, "en-de", submit);
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Die Tür ist offen." } });
  const form = screen.getByRole("button", { name: "Check answer" }).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  reject(new Error("offline"));
  expect((await screen.findByRole("alert")).textContent).toContain("offline");
  expect((screen.getByLabelText("Your answer") as HTMLInputElement).value).toBe("Die Tür ist offen.");
  submit.mockImplementation(() => Promise.resolve(correct));
  await userEvent.click(screen.getByRole("button", { name: "Check answer" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Correct"));
});
