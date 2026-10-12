import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionSizePicker } from "./SessionSizePicker";
import type { SessionSize } from "./sessionSize";

const setup = (value: SessionSize, poolSize: number | null = 40) => {
  const onChange = mock();
  render(<SessionSizePicker value={value} onChange={onChange} defaultSize={30} poolSize={poolSize} />);
  return onChange;
};
const options = () => screen.getAllByRole("option").map((o) => o.textContent);

describe("SessionSizePicker", () => {
  test("offers sizes below the pool, all questions with the pool size, and custom", () => {
    setup({ kind: "preset", count: 30 });
    expect(options()).toEqual(["10", "20", "30", "All questions (40)", "Custom…"]);
    expect((screen.getByLabelText("Questions in this session") as HTMLSelectElement).value).toBe("30");
    expect(screen.queryByLabelText("Number of questions")).toBeNull();
  });

  test("a preset larger than the pool shows as all questions", () => {
    setup({ kind: "preset", count: 30 }, 12);
    expect((screen.getByLabelText("Questions in this session") as HTMLSelectElement).value).toBe("all");
  });

  test("an unknown pool offers every size and a plain 'All questions'", () => {
    setup({ kind: "preset", count: 30 }, null);
    expect(options()).toEqual(["10", "20", "30", "50", "100", "All questions", "Custom…"]);
  });

  test("choosing a size, all or custom reports the choice", async () => {
    const onChange = setup({ kind: "preset", count: 30 });
    const select = screen.getByLabelText("Questions in this session");
    await userEvent.selectOptions(select, "10");
    expect(onChange).toHaveBeenLastCalledWith({ kind: "preset", count: 10 });
    await userEvent.selectOptions(select, "all");
    expect(onChange).toHaveBeenLastCalledWith({ kind: "all" });
    // Custom starts from the size that was selected, so the learner only has to adjust it.
    await userEvent.selectOptions(select, "custom");
    expect(onChange).toHaveBeenLastCalledWith({ kind: "custom", text: "30" });
  });

  test("custom shows a number field that reports every edit", async () => {
    const onChange = setup({ kind: "custom", text: "3" });
    const input = screen.getByLabelText("Number of questions") as HTMLInputElement;
    expect(input.value).toBe("3");
    expect(input.max).toBe("40");
    await userEvent.type(input, "5");
    expect(onChange).toHaveBeenLastCalledWith({ kind: "custom", text: "35" });
  });
});
