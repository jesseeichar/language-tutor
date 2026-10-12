import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckboxGroup, useCheckedSet } from "./CheckboxGroup";

const items = [
  { id: "a", label: "Alpha", count: 3 },
  { id: "b", label: "Beta", depth: 1 },
];

function Harness({ initial = [] as string[] }) {
  const [checked, setChecked] = useCheckedSet(() => new Set(initial));
  return (
    <>
      <CheckboxGroup legend="Group" items={items} checked={checked} onChange={setChecked} />
      <output>{[...checked].sort().join(",")}</output>
    </>
  );
}

const value = () => screen.getByRole("status").textContent;

describe("CheckboxGroup", () => {
  test("renders labels, counts and initial state", () => {
    render(<Harness initial={["b"]} />);
    expect(screen.getByText("Group")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect((screen.getByLabelText("Beta") as HTMLInputElement).checked).toBe(true);
  });

  test("checkboxes toggle single items", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByLabelText(/Alpha/));
    expect(value()).toBe("a");
    await userEvent.click(screen.getByLabelText(/Alpha/));
    expect(value()).toBe("");
  });

  test("'all' and 'none' change the whole group", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "all" }));
    expect(value()).toBe("a,b");
    await userEvent.click(screen.getByRole("button", { name: "none" }));
    expect(value()).toBe("");
  });
});
