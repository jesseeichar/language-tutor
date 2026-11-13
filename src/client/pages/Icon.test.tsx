import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { Icon, ICONS } from "./Icon";

test("draws the given path and stays hidden from assistive technology", () => {
  const { container } = render(<Icon d={ICONS.copy} />);
  const svg = container.querySelector("svg")!;
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(svg.querySelector("path")!.getAttribute("d")).toBe(ICONS.copy);
});
