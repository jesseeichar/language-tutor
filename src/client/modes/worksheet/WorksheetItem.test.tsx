import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorksheetItem } from "./WorksheetItem";

test("three choices render as radios and send only the chosen value", async () => {
  const onChange = mock();
  render(<WorksheetItem number={1} disabled={false} onChange={onChange} value="" item={{ id: "one", kind: "choice", prompt: "Pick", answer: "a", options: ["a", "b", "c"].map(value => ({ value, label: value })) }} />);
  await userEvent.click(screen.getByRole("radio", { name: "b" }));
  expect(onChange).toHaveBeenCalledWith("b");
});

test("personal word and sentence inputs preserve the other field", async () => {
  const onChange = mock();
  render(<WorksheetItem number={1} disabled={false} onChange={onChange} value={{ word: "zuerst", sentence: "" }} item={{ id: "one", kind: "personal", prompt: "Personal choice" }} />);
  await userEvent.type(screen.getByLabelText("Eigener Satz 1"), "X");
  expect(onChange).toHaveBeenCalledWith({ word: "zuerst", sentence: "X" });
});

test("a category dropdown has a concise accessible label independent of its options", async () => {
  const onChange = mock();
  render(<WorksheetItem number={1} disabled={false} onChange={onChange} value="" item={{ id: "one", kind: "choice", prompt: "deshalb", answer: "d", options: ["a", "b", "c", "d"].map(value => ({ value, label: value })) }} />);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "1. deshalb" }), "d");
  expect(onChange).toHaveBeenCalledWith("d");
});
