import { describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiRequestError } from "../api";
import { ErrorBox } from "./ErrorBox";

describe("ErrorBox", () => {
  test("renders nothing without an error", () => {
    const { container } = render(<ErrorBox error={null} />);
    expect(container.innerHTML).toBe("");
  });
  test("shows the message and API details", () => {
    render(<ErrorBox error={new ApiRequestError("Invalid data", ["vocabulary.json: bad"])} />);
    expect(screen.getByRole("alert").textContent).toContain("Invalid data");
    expect(screen.getByText("vocabulary.json: bad")).toBeTruthy();
  });
});

test("offers a retry when given one, disabled while busy", async () => {
  const onRetry = mock();
  render(<ErrorBox error={new Error("offline")} onRetry={onRetry} busy />);
  expect(screen.getByRole("button", { name: "Retry" }).hasAttribute("disabled")).toBe(true);
  cleanup();
  render(<ErrorBox error={new Error("offline")} onRetry={onRetry} />);
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalled();
});
