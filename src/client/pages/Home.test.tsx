import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, mockApi } from "../../../tests/support/mock-api";
import { Home } from "./Home";

describe("Home", () => {
  test("lists study tools and lets the learner pick one", async () => {
    mockApi({ "GET /api/modes": () => ({ body: [flashcardMode] }) });
    const onPick = mock();
    render(<Home onPick={onPick} />);
    await userEvent.click(await screen.findByRole("button", { name: /Flashcards/ }));
    expect(onPick).toHaveBeenCalledWith(flashcardMode);
    expect(screen.getByText(/No quizzes yet/)).toBeTruthy();
  });

  test("disables modes without questions or without a view", async () => {
    mockApi({
      "GET /api/modes": () => ({
        body: [{ ...flashcardMode, questionCount: 0 }, { ...flashcardMode, id: "unknown", title: "Mystery", graded: true }],
      }),
    });
    render(<Home onPick={() => {}} />);
    expect((await screen.findByRole("button", { name: /Flashcards/ })).hasAttribute("disabled")).toBe(true);
    const mystery = screen.getByRole("button", { name: /Mystery/ });
    expect(mystery.hasAttribute("disabled")).toBe(true);
    expect(mystery.textContent).toContain("No view registered");
  });

  test("shows load errors", async () => {
    mockApi({ "GET /api/modes": () => ({ status: 500, body: { error: "Data broken" } }) });
    render(<Home onPick={() => {}} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Data broken");
  });
});
