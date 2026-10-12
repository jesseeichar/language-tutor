import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectionPicker } from "./DirectionPicker";

describe("DirectionPicker", () => {
  test("shows the current choice and reports changes", async () => {
    const onChange = mock();
    render(<DirectionPicker value="random" onChange={onChange} />);
    expect((screen.getByLabelText(/Random/) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByLabelText("English → German"));
    expect(onChange).toHaveBeenCalledWith("en-de");
  });
});
