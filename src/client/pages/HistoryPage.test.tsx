import { describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionLogEntry } from "../../shared";
import { mockApi, summary } from "../../../tests/support/mock-api";
import { HistoryPage } from "./HistoryPage";

const entry = (id: string, over: Partial<SessionLogEntry> = {}, session: Partial<SessionLogEntry["session"]> = {}): SessionLogEntry => ({
  ...summary(1),
  session: { ...summary(1).session, id, ...session },
  modeTitle: "Flashcards",
  finishedAt: "2026-10-12T10:05:00Z",
  categoryLabels: ["Time", "Cases"],
  questionTypeLabels: null,
  ...over,
});

describe("HistoryPage", () => {
  test("lists each session with its choices and result", async () => {
    mockApi({
      "GET /api/sessions": () => ({
        body: [
          entry("s2", { questionTypeLabels: ["Translation"], finishedAt: null }, { direction: "en-de", repeatOf: "s1" }),
          entry("s1"),
        ],
      }),
    });
    render(<HistoryPage onRepeat={mock(() => Promise.resolve())} />);
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.getByText(/The last 50 sessions are kept/)).toBeTruthy();
    const latest = within(items[0]!);
    expect(latest.getByText("Repeated session")).toBeTruthy();
    expect(latest.getByText(/Translation · English → German/)).toBeTruthy();
    expect(latest.getByText(/not finished/)).toBeTruthy();
    const older = within(items[1]!);
    expect(older.getByText("Time, Cases")).toBeTruthy();
    expect(older.getByText(/All question types · Random/)).toBeTruthy();
    expect(older.getByText("Studied 1 of 2 cards")).toBeTruthy();
  });

  test("an empty log says so", async () => {
    mockApi({ "GET /api/sessions": () => ({ body: [] }) });
    render(<HistoryPage onRepeat={mock(() => Promise.resolve())} />);
    expect(await screen.findByText("No sessions yet.")).toBeTruthy();
  });

  test("Repeat starts the chosen session and shows failures", async () => {
    mockApi({ "GET /api/sessions": () => ({ body: [entry("s1")] }) });
    const onRepeat = mock(() => Promise.reject(new Error("gone")));
    render(<HistoryPage onRepeat={onRepeat} />);
    await userEvent.click(await screen.findByRole("button", { name: "Repeat" }));
    expect(onRepeat).toHaveBeenCalledWith("s1");
    expect((await screen.findByRole("alert")).textContent).toContain("gone");
    expect(screen.getByRole("button", { name: "Repeat" }).hasAttribute("disabled")).toBe(false);
  });

  test("shows load errors", async () => {
    mockApi({ "GET /api/sessions": () => ({ status: 500, body: { error: "Database locked" } }) });
    render(<HistoryPage onRepeat={mock(() => Promise.resolve())} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Database locked");
  });
});
