import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FlashcardQuestion } from "../../../shared";
import { FlashcardView } from "./FlashcardView";

const card: FlashcardQuestion = {
  id: "c1", categories: ["x"], refs: { words: [], topics: [] }, front: "zuerst", back: "first", notes: "Zuerst lesen wir.",
};
const resolved = () => mock(() => Promise.resolve({ grade: null, pointsAwarded: 0, pointsPossible: 0 }));

describe("FlashcardView", () => {
  test("shows only the front until flipped", async () => {
    const submit = resolved();
    render(<FlashcardView question={card} submit={submit} next={() => {}} isLast={false} />);
    expect(screen.getByText("zuerst")).toBeTruthy();
    expect(screen.queryByText("first")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.getByText("Zuerst lesen wir.")).toBeTruthy();
    expect(submit).toHaveBeenCalledWith({ revealed: true });
  });

  test("records the reveal only once", async () => {
    const submit = resolved();
    render(<FlashcardView question={card} submit={submit} next={() => {}} isLast={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await userEvent.click(screen.getByRole("button", { name: "Card answer" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  test("keyboard: Space flips, then Enter or → moves on", () => {
    const next = mock();
    render(<FlashcardView question={card} submit={resolved()} next={next} isLast={false} />);
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("first")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(next).toHaveBeenCalledTimes(2);
  });

  test("the last card says Finish", async () => {
    render(<FlashcardView question={card} submit={resolved()} next={() => {}} isLast />);
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    expect(screen.getByRole("button", { name: /Finish/ })).toBeTruthy();
  });

  test("shows an error if the reveal cannot be recorded", async () => {
    const submit = mock(() => Promise.reject(new Error("offline")));
    render(<FlashcardView question={card} submit={submit} next={() => {}} isLast={false} />);
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    expect(await screen.findByText(/Could not record this card: offline/)).toBeTruthy();
  });
});
