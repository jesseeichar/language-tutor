import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, mockApi, sessionResponse, summary } from "../../tests/support/mock-api";
import { App } from "./App";

describe("App", () => {
  test("home → setup → flashcards → summary → home", async () => {
    mockApi({
      "GET /api/modes": () => ({ body: [flashcardMode] }),
      "POST /api/sessions": () => ({ body: sessionResponse }),
      "POST /api/sessions/s1/answers": () => ({ body: { grade: null, pointsAwarded: 0, pointsPossible: 0 } }),
      "POST /api/sessions/s1/finish": () => ({ body: summary(1) }),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Flashcards/ }));
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(await screen.findByRole("button", { name: /Flip/ }));
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(await screen.findByText("Studied 1 of 2 cards")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "All modes" }));
    expect(await screen.findByRole("heading", { name: "Study" })).toBeTruthy();
  });

  test("the brand button returns home from setup", async () => {
    mockApi({ "GET /api/modes": () => ({ body: [flashcardMode] }) });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Flashcards/ }));
    expect(screen.getByRole("heading", { name: "Flashcards" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Language Tutor" }));
    expect(await screen.findByRole("heading", { name: "Study" })).toBeTruthy();
  });
});
