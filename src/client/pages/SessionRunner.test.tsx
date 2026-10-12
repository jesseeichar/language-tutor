import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, mockApi, sessionResponse, summary } from "../../../tests/support/mock-api";
import { SessionRunner } from "./SessionRunner";

const ok = () => ({ body: { grade: null, pointsAwarded: 0, pointsPossible: 0 } });

describe("SessionRunner", () => {
  test("steps through every question and finishes", async () => {
    const calls = mockApi({ "POST /api/sessions/s1/answers": ok, "POST /api/sessions/s1/finish": () => ({ body: summary(2) }) });
    const onFinished = mock();
    render(<SessionRunner mode={flashcardMode} data={sessionResponse} onFinished={onFinished} />);

    expect(screen.getByText("1 / 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("2 / 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    await userEvent.click(screen.getByRole("button", { name: /Finish/ }));

    expect(calls.map((c) => c.path)).toEqual([
      "/api/sessions/s1/answers", "/api/sessions/s1/answers", "/api/sessions/s1/finish",
    ]);
    expect(onFinished).toHaveBeenCalledWith(summary(2));
  });

  test("End session finishes early", async () => {
    mockApi({ "POST /api/sessions/s1/finish": () => ({ body: summary(0) }) });
    const onFinished = mock();
    render(<SessionRunner mode={flashcardMode} data={sessionResponse} onFinished={onFinished} />);
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(onFinished).toHaveBeenCalledWith(summary(0));
  });

  test("reports a mode without a registered view", () => {
    const data = { ...sessionResponse, session: { ...sessionResponse.session, modeId: "unknown" } };
    render(<SessionRunner mode={flashcardMode} data={data} onFinished={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain('No view registered for mode "unknown"');
  });
});
