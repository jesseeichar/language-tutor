import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Direction, FlashcardQuestion } from "../../../shared";
import { FlashcardView } from "./FlashcardView";

const base = { categories: ["x"], refs: { words: [], topics: [] } };
const translation: FlashcardQuestion = { ...base, id: "t", de: "zuerst", en: "first", notes: "Zuerst lesen wir." };
const fixed: FlashcardQuestion = { ...base, id: "f", front: "Wir essen, ___ gehen wir.", back: "danach" };
const resolved = () => mock(() => Promise.resolve({ grade: null, pointsAwarded: 0, pointsPossible: 0 }));

function show(card: FlashcardQuestion, direction: Direction | null, overrides: Partial<{ next: () => void; previous: () => void; isLast: boolean; submit: ReturnType<typeof resolved>; tools: React.ReactNode }> = {}) {
  const submit = overrides.submit ?? resolved();
  render(<FlashcardView question={card} direction={direction} submit={submit} next={overrides.next ?? (() => {})} previous={overrides.previous}
    isLast={overrides.isLast ?? false} tools={overrides.tools} />);
  return submit;
}

describe("FlashcardView", () => {
  test("German first: shows German, then English after flipping", async () => {
    const submit = show(translation, "de-en");
    expect(screen.getByText("zuerst")).toBeTruthy();
    expect(screen.queryByText("first")).toBeNull();
    expect(screen.getByText(/German → English/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.getByText("Zuerst lesen wir.")).toBeTruthy();
    expect(submit).toHaveBeenCalledWith({ revealed: true });
  });

  test("English first: shows English, then German after flipping", async () => {
    show(translation, "en-de");
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.queryByText("zuerst")).toBeNull();
    expect(screen.getByText(/English → German/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    expect(screen.getByText("zuerst")).toBeTruthy();
  });

  test("fixed cards ignore direction and show no language hint", async () => {
    show(fixed, null);
    expect(screen.getByText("Wir essen, ___ gehen wir.")).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    expect(screen.getByText("danach")).toBeTruthy();
  });

  test("records the reveal only once", async () => {
    const submit = show(translation, "de-en");
    await userEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await userEvent.click(screen.getByRole("button", { name: "Card answer" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  test("keyboard: Space flips, then Enter or → moves on", () => {
    const next = mock();
    show(translation, "de-en", { next });
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("first")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(next).toHaveBeenCalledTimes(2);
  });

  test("the last card says Finish", async () => {
    show(translation, "de-en", { isLast: true });
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    expect(screen.getByRole("button", { name: /Finish/ })).toBeTruthy();
  });

  test("shows an error if the reveal cannot be recorded", async () => {
    show(translation, "de-en", { submit: mock(() => Promise.reject(new Error("offline"))) as never });
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    expect(await screen.findByText(/Could not record this card: offline/)).toBeTruthy();
  });
});

test("tools render outside the card and their dropdown keeps the arrow keys", () => {
  const previous = mock();
  const next = mock();
  show(translation, "de-en", { previous, next, tools: <select aria-label="List"><option>Needs work</option></select> });
  const dropdown = screen.getByLabelText("List");
  expect(screen.getByRole("button", { name: "Show answer" }).contains(dropdown)).toBe(false);
  fireEvent.keyDown(dropdown, { key: "ArrowLeft" });
  fireEvent.keyDown(dropdown, { key: " " });
  fireEvent.keyDown(dropdown, { key: "Enter" });
  expect(previous).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Show answer" })).toBeTruthy();
});

test("a failed save can be retried by flipping again", async () => {
  const submit = mock().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ grade: null, pointsAwarded: 0, pointsPossible: 0 });
  show(translation, "de-en", { submit });
  await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
  await screen.findByText(/Could not record/);
  await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
  expect(screen.queryByText(/Could not record/)).toBeNull();
  expect(screen.getByRole("button", { name: "Card answer" })).toBeTruthy();
  expect(submit).toHaveBeenCalledTimes(2);
});
