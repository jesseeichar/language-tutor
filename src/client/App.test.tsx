import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, listSnapshot, mockApi, sessionResponse, summary } from "../../tests/support/mock-api";
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

  test("repeat from the summary replays the same session", async () => {
    const calls = mockApi({
      "GET /api/modes": () => ({ body: [flashcardMode] }),
      "POST /api/sessions": () => ({ body: sessionResponse }),
      "POST /api/sessions/s1/finish": () => ({ body: summary(0) }),
      "POST /api/sessions/s1/repeat": () => ({ body: { ...sessionResponse, session: { ...sessionResponse.session, id: "s2", repeatOf: "s1" } } }),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Flashcards/ }));
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(await screen.findByRole("button", { name: "End session" }));
    await userEvent.click(await screen.findByRole("button", { name: "Repeat this session" }));
    expect(await screen.findByText("1 / 2")).toBeTruthy();
    expect(calls.some((c) => c.path === "/api/sessions/s1/repeat")).toBe(true);
  });

  test("History is reachable from the top bar and can repeat a session", async () => {
    mockApi({
      "GET /api/modes": () => ({ body: [flashcardMode] }),
      "GET /api/sessions": () => ({
        body: [{ ...summary(1), modeTitle: "Flashcards", finishedAt: null, categoryLabels: ["Time"], questionTypeLabels: null }],
      }),
      "POST /api/sessions/s1/repeat": () => ({ body: sessionResponse }),
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "History" }));
    await userEvent.click(await screen.findByRole("button", { name: "Repeat" }));
    expect(await screen.findByText("1 / 2")).toBeTruthy();
  });

  test("a repeat of a mode that no longer exists shows an error", async () => {
    mockApi({
      "GET /api/modes": () => ({ body: [] }),
      "GET /api/sessions": () => ({
        body: [{ ...summary(1), modeTitle: "Old", finishedAt: null, categoryLabels: [], questionTypeLabels: null }],
      }),
      "POST /api/sessions/s1/repeat": () => ({ body: sessionResponse }),
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "History" }));
    await userEvent.click(await screen.findByRole("button", { name: "Repeat" }));
    expect((await screen.findByRole("alert")).textContent).toContain("no longer available");
  });

  test("Lists → Study opens the setup with the list preselected", async () => {
    const calls = mockApi({
      "GET /api/modes": () => ({ body: [{ ...flashcardMode, categories: [...flashcardMode.categories, { id: "tricky", label: "Tricky", group: "Lists", count: 1, isList: true }] }] }),
      "GET /api/content/editor": () => ({ body: listSnapshot }),
      "GET /api/modes/flashcards/pool": () => ({ body: { count: 1 } }),
      "POST /api/sessions": () => ({ body: sessionResponse }),
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Lists" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Tricky 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Study Tricky" }));
    expect(await screen.findByRole("heading", { name: "Flashcards" })).toBeTruthy();
    expect((screen.getByLabelText(/^Tricky/) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((calls.find((c) => c.path === "/api/sessions")!.body as { categoryIds: string[] }).categoryIds).toEqual(["tricky"]);
    expect(await screen.findByText("1 / 2")).toBeTruthy();
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
