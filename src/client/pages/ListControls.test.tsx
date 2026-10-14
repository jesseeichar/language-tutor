import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { listSnapshot } from "../../../tests/support/mock-api";
import { ListControls } from "./ListControls";
import type { ListMembership } from "./useListMembership";

function show(questionId: string, overrides: Partial<ListMembership> = {}) {
  const lists: ListMembership = { snapshot: listSnapshot, pending: false, error: null, retry: null, setMembership: mock(), ...overrides };
  render(<ListControls modeId="flashcards" questionId={questionId} lists={lists} />);
  return lists;
}

describe("ListControls", () => {
  test("defaults to Needs work and adds the card to the chosen list", async () => {
    const lists = show("c1");
    expect((screen.getByLabelText("List") as HTMLSelectElement).value).toBe("needs-work");
    expect(screen.getByText("Not in Needs work")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add to Needs work" }));
    expect(lists.setMembership).toHaveBeenCalledWith({ modeId: "flashcards", questionId: "c1", categoryId: "needs-work", member: true });
  });

  test("choosing a list only changes the destination and is remembered", async () => {
    const lists = show("c1");
    await userEvent.selectOptions(screen.getByLabelText("List"), "tricky");
    expect(lists.setMembership).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add to Tricky" })).toBeTruthy();
    expect(localStorage.getItem("language-tutor:list")).toBe("tricky");
  });

  test("a remembered list that is no longer enabled falls back to Needs work", () => {
    localStorage.setItem("language-tutor:list", "vocab-time");
    show("c1");
    expect(screen.getByRole("button", { name: "Add to Needs work" })).toBeTruthy();
  });

  test("a direct member shows a checkmark that removes it; inherited membership is labeled", async () => {
    localStorage.setItem("language-tutor:list", "tricky");
    const snapshot = { ...listSnapshot, questions: listSnapshot.questions.map((q) => q.id === "c2" ? { ...q, categories: [...q.categories, "tricky"] } : q) };
    const lists = show("c2", { snapshot });
    const button = screen.getByRole("button", { name: "Remove from Tricky" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("In Tricky")).toBeTruthy();
    await userEvent.click(button);
    expect(lists.setMembership).toHaveBeenCalledWith({ modeId: "flashcards", questionId: "c2", categoryId: "tricky", member: false });
    // Without the direct assignment the card is still in the list through its child category.
    render(<ListControls modeId="flashcards" questionId="c2" lists={{ ...lists, snapshot: listSnapshot }} />);
    expect(screen.getByText("In Tricky via Tricky child")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to Tricky" })).toBeTruthy();
  });

  test("the button waits while saving and a failure offers a retry", async () => {
    const retry = mock();
    show("c1", { pending: true, error: new Error("offline"), retry });
    expect(screen.getByRole("button", { name: "Add to Needs work" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("offline");
    expect(screen.getByRole("button", { name: "Retry" }).hasAttribute("disabled")).toBe(true);
    render(<ListControls modeId="flashcards" questionId="c1" lists={{ snapshot: listSnapshot, pending: false, error: new Error("offline"), retry, setMembership: mock() }} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Retry" }).at(-1)!);
    expect(retry).toHaveBeenCalled();
  });

  test("renders nothing before the content is loaded or when no list is enabled", () => {
    show("c1", { snapshot: null });
    expect(screen.queryByLabelText("List")).toBeNull();
    show("c1", { snapshot: { ...listSnapshot, categories: listSnapshot.categories.filter((c) => !c.isList) } });
    expect(screen.queryByLabelText("List")).toBeNull();
  });
});
