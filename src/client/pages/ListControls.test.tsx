import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
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
  test("defaults to Needs work and the plus icon adds the card to it", async () => {
    const lists = show("c1");
    expect(screen.getByText("Needs work")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add to Needs work" }));
    expect(lists.setMembership).toHaveBeenCalledWith({ modeId: "flashcards", questionId: "c1", categoryId: "needs-work", member: true });
  });

  test("the menu lists every list; picking one adds the card there and remembers it", async () => {
    const lists = show("c1");
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Choose list" }));
    expect(screen.getAllByRole("menuitemcheckbox").map((m) => m.textContent)).toEqual(["Needs work", "Tricky"]);
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Tricky" }));
    expect(lists.setMembership).toHaveBeenCalledWith({ modeId: "flashcards", questionId: "c1", categoryId: "tricky", member: true });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Add to Tricky" })).toBeTruthy();
    expect(localStorage.getItem("language-tutor:list")).toBe("tricky");
  });

  test("the menu closes on Escape or a click outside, and keeps its keys from the flashcard", async () => {
    const onWindowKey = mock();
    window.addEventListener("keydown", onWindowKey);
    try {
      show("c1");
      await userEvent.click(screen.getByRole("button", { name: "Choose list" }));
      fireEvent.keyDown(screen.getByRole("menuitemcheckbox", { name: "Tricky" }), { key: "ArrowRight" });
      expect(onWindowKey).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByRole("button", { name: "Choose list" }), { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Choose list" }));
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });

  test("a remembered list that is no longer enabled falls back to Needs work", () => {
    localStorage.setItem("language-tutor:list", "vocab-time");
    show("c1");
    expect(screen.getByRole("button", { name: "Add to Needs work" })).toBeTruthy();
  });

  test("a direct member shows a checkmark that removes it; the menu checks member lists; inherited membership is labeled", async () => {
    localStorage.setItem("language-tutor:list", "tricky");
    const snapshot = { ...listSnapshot, questions: listSnapshot.questions.map((q) => q.id === "c2" ? { ...q, categories: [...q.categories, "tricky"] } : q) };
    const lists = show("c2", { snapshot });
    const button = screen.getByRole("button", { name: "Remove from Tricky" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Choose list" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Tricky" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Needs work" }).getAttribute("aria-checked")).toBe("false");
    await userEvent.click(button);
    expect(lists.setMembership).toHaveBeenCalledWith({ modeId: "flashcards", questionId: "c2", categoryId: "tricky", member: false });
    // Without the direct assignment the card is still in the list through its child category.
    render(<ListControls modeId="flashcards" questionId="c2" lists={{ ...lists, snapshot: listSnapshot }} />);
    expect(screen.getByText("Tricky · via Tricky child")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to Tricky" })).toBeTruthy();
  });

  test("the buttons wait while saving and a failure offers a retry", async () => {
    const retry = mock();
    show("c1", { pending: true, error: new Error("offline"), retry });
    expect(screen.getByRole("button", { name: "Add to Needs work" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Choose list" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("offline");
    expect(screen.getByRole("button", { name: "Retry" }).hasAttribute("disabled")).toBe(true);
    render(<ListControls modeId="flashcards" questionId="c1" lists={{ snapshot: listSnapshot, pending: false, error: new Error("offline"), retry, setMembership: mock() }} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Retry" }).at(-1)!);
    expect(retry).toHaveBeenCalled();
  });

  test("renders nothing before the content is loaded or when no list is enabled", () => {
    show("c1", { snapshot: null });
    expect(screen.queryByRole("button", { name: "Choose list" })).toBeNull();
    show("c1", { snapshot: { ...listSnapshot, categories: listSnapshot.categories.filter((c) => !c.isList) } });
    expect(screen.queryByRole("button", { name: "Choose list" })).toBeNull();
  });
});
