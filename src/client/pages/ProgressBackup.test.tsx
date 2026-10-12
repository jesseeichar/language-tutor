import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi } from "../../../tests/support/mock-api";
import { ProgressBackup } from "./ProgressBackup";

describe("ProgressBackup", () => {
  test("backs up progress and reports the destination", async () => {
    const calls = mockApi({ "POST /api/progress/backup": () => ({
      body: { commit: "abc", remote: "origin", branch: "main", createdCommit: true },
    }) });
    render(<ProgressBackup />);
    await userEvent.click(screen.getByRole("button", { name: "Back up progress" }));
    expect((await screen.findByRole("status")).textContent).toBe("Progress backed up to origin/main.");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
  });

  test("disables the button while running", async () => {
    let finish!: (response: Response) => void;
    let calls = 0;
    globalThis.fetch = (() => { calls++; return new Promise<Response>((resolve) => { finish = resolve; }); }) as unknown as typeof fetch;
    render(<ProgressBackup />);
    await userEvent.click(screen.getByRole("button", { name: "Back up progress" }));
    const busy = screen.getByRole("button", { name: "Backing up…" });
    expect(busy.hasAttribute("disabled")).toBe(true);
    await userEvent.click(busy);
    expect(calls).toBe(1);
    await act(async () => finish(Response.json({ remote: "origin", branch: "main", createdCommit: false, commit: "abc" })));
    expect(screen.getByRole("button", { name: "Back up progress" }).hasAttribute("disabled")).toBe(false);
  });

  test("shows failure and permits retry", async () => {
    let attempts = 0;
    mockApi({ "POST /api/progress/backup": () => ++attempts === 1
      ? { status: 502, body: { error: "Progress is committed locally, but pushing failed." } }
      : { body: { remote: "origin", branch: "main", commit: "abc", createdCommit: false } },
    });
    render(<ProgressBackup />);
    await userEvent.click(screen.getByRole("button", { name: "Back up progress" }));
    expect((await screen.findByRole("alert")).textContent).toContain("pushing failed");
    await userEvent.click(screen.getByRole("button", { name: "Back up progress" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
