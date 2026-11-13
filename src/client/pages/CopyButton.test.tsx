import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stubClipboard } from "../../../tests/support/clipboard";
import { CopyButton } from "./CopyButton";

test("copies its text and confirms on the button", async () => {
  const writeText = stubClipboard();
  render(<CopyButton text={"zuerst\nfirst"} label="Copy question" />);
  await userEvent.click(screen.getByRole("button", { name: "Copy question" }));
  expect(writeText).toHaveBeenCalledWith("zuerst\nfirst");
  expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
});

test("shows a caption next to the icon while keeping the accessible name", () => {
  stubClipboard();
  render(<CopyButton text="x" label="Copy front">Front</CopyButton>);
  expect(screen.getByRole("button", { name: "Copy front" }).textContent).toBe("Front");
});

test("reports a refused or unavailable clipboard instead of throwing", async () => {
  stubClipboard(() => Promise.reject(new Error("denied")));
  render(<CopyButton text="x" label="Copy question" />);
  await userEvent.click(screen.getByRole("button", { name: "Copy question" }));
  expect(await screen.findByRole("button", { name: "Copy failed" })).toBeTruthy();
});

test("drops the confirmation when the text to copy changes", async () => {
  stubClipboard();
  const { rerender } = render(<CopyButton text="question" label="Copy question" />);
  await userEvent.click(screen.getByRole("button", { name: "Copy question" }));
  expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  rerender(<CopyButton text="question and answer" label="Copy question and answer" />);
  expect(screen.getByRole("button", { name: "Copy question and answer" })).toBeTruthy();
});
