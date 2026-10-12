import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
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
