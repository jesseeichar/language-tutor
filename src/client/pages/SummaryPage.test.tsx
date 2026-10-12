import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, summary } from "../../../tests/support/mock-api";
import { SummaryPage } from "./SummaryPage";

describe("SummaryPage", () => {
  test("ungraded sessions show cards studied, not a score", () => {
    render(<SummaryPage mode={flashcardMode} summary={summary(1)} onAgain={() => {}} onHome={() => {}} />);
    expect(screen.getByText("Studied 1 of 2 cards")).toBeTruthy();
    expect(screen.getByText(/worth 0 points/)).toBeTruthy();
  });

  test("graded sessions show the score", () => {
    const graded = { ...summary(2), session: { ...summary(2).session, graded: true }, correct: 1, pointsAwarded: 1, pointsPossible: 2 };
    render(<SummaryPage mode={flashcardMode} summary={graded} onAgain={() => {}} onHome={() => {}} />);
    expect(screen.getByText(/1 \/ 2 correct/)).toBeTruthy();
  });

  test("buttons call back", async () => {
    const onAgain = mock();
    const onHome = mock();
    render(<SummaryPage mode={flashcardMode} summary={summary(2)} onAgain={onAgain} onHome={onHome} />);
    await userEvent.click(screen.getByRole("button", { name: "Another session" }));
    await userEvent.click(screen.getByRole("button", { name: "All modes" }));
    expect(onAgain).toHaveBeenCalled();
    expect(onHome).toHaveBeenCalled();
  });
});
