import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, summary } from "../../../tests/support/mock-api";
import { SummaryPage } from "./SummaryPage";

const noop = () => {};
const resolved = () => mock(() => Promise.resolve());

describe("SummaryPage", () => {
  test("ungraded sessions show cards studied, not a score", () => {
    render(<SummaryPage mode={flashcardMode} summary={summary(1)} onAgain={noop} onRepeat={resolved()} onHome={noop} />);
    expect(screen.getByText("Studied 1 of 2 cards")).toBeTruthy();
    expect(screen.getByText(/worth 0 points/)).toBeTruthy();
  });

  test("graded sessions show the score", () => {
    const graded = { ...summary(2), session: { ...summary(2).session, graded: true }, correct: 1, pointsAwarded: 1, pointsPossible: 2 };
    render(<SummaryPage mode={flashcardMode} summary={graded} onAgain={noop} onRepeat={resolved()} onHome={noop} />);
    expect(screen.getByText(/1 \/ 2 correct/)).toBeTruthy();
  });

  test("buttons call back; repeat passes this session's id", async () => {
    const onAgain = mock();
    const onHome = mock();
    const onRepeat = resolved();
    render(<SummaryPage mode={flashcardMode} summary={summary(2)} onAgain={onAgain} onRepeat={onRepeat} onHome={onHome} />);
    await userEvent.click(screen.getByRole("button", { name: "Repeat this session" }));
    await userEvent.click(screen.getByRole("button", { name: "New session" }));
    await userEvent.click(screen.getByRole("button", { name: "All modes" }));
    expect(onRepeat).toHaveBeenCalledWith("s1");
    expect(onAgain).toHaveBeenCalled();
    expect(onHome).toHaveBeenCalled();
  });

  test("shows an error when the repeat fails", async () => {
    const onRepeat = mock(() => Promise.reject(new Error("None of this session's questions exist any more")));
    render(<SummaryPage mode={flashcardMode} summary={summary(2)} onAgain={noop} onRepeat={onRepeat} onHome={noop} />);
    await userEvent.click(screen.getByRole("button", { name: "Repeat this session" }));
    expect((await screen.findByRole("alert")).textContent).toContain("exist any more");
  });
});
