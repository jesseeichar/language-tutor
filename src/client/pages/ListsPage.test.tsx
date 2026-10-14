import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, listSnapshot, mockApi, withMembership } from "../../../tests/support/mock-api";
import { ListsPage } from "./ListsPage";

const inList = withMembership(listSnapshot, "c1", "needs-work", true);
const show = (onStudy = mock(), onManage = mock()) => render(<ListsPage onStudy={onStudy} onManage={onManage} />);

describe("ListsPage", () => {
  test("shows each list with its flashcard count, direct and inherited members, and a search", async () => {
    mockApi({ "GET /api/content/editor": () => ({ body: inList }) });
    show();
    expect((await screen.findByRole("button", { name: "Needs work 1" })).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("zuerst — first")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove zuerst — first from Needs work" })).toBeTruthy();
    expect(screen.queryByText("quiz question")).toBeNull(); // only flashcards are listed
    await userEvent.click(screen.getByRole("button", { name: "Tricky 1" }));
    expect(screen.getByText(/Wir essen/)).toBeTruthy();
    expect(screen.getByText("via Tricky child")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    await userEvent.type(screen.getByLabelText("Search Tricky"), "zzz");
    expect(screen.getByText("No matches.")).toBeTruthy();
    expect(localStorage.getItem("language-tutor:list")).toBe("tricky");
  });

  test("removes a direct member with the loaded revision", async () => {
    let snapshot = inList;
    const calls = mockApi({
      "GET /api/content/editor": () => ({ body: snapshot }),
      "POST /api/content/editor": () => { snapshot = listSnapshot; return { body: snapshot }; },
    });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Remove zuerst — first from Needs work" }));
    await waitFor(() => expect(screen.queryByText("zuerst — first")).toBeNull());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      revision: "list-1+", change: { kind: "set-list-membership", modeId: "flashcards", questionId: "c1", categoryId: "needs-work", member: false },
    });
    expect(screen.getByRole("button", { name: "Needs work 0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Study Needs work" }).hasAttribute("disabled")).toBe(true);
  });

  test("Study opens the setup for the mode that has the list", async () => {
    const mode = { ...flashcardMode, categories: [...flashcardMode.categories, { id: "needs-work", label: "Needs work", group: "Lists", count: 1, isList: true }] };
    mockApi({ "GET /api/content/editor": () => ({ body: inList }), "GET /api/modes": () => ({ body: [mode] }) });
    const onStudy = mock();
    show(onStudy);
    await userEvent.click(await screen.findByRole("button", { name: "Study Needs work" }));
    await waitFor(() => expect(onStudy).toHaveBeenCalledWith(mode, "needs-work"));
  });

  test("points to Manage content when no list is enabled", async () => {
    mockApi({ "GET /api/content/editor": () => ({ body: { ...listSnapshot, categories: listSnapshot.categories.filter((c) => !c.isList) } }) });
    const onManage = mock();
    show(mock(), onManage);
    await userEvent.click(await screen.findByRole("button", { name: "Manage content" }));
    expect(onManage).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Study/ })).toBeNull();
  });

  test("shows load errors with a reload", async () => {
    mockApi({ "GET /api/content/editor": () => ({ status: 500, body: { error: "broken" } }) });
    show();
    expect((await screen.findByRole("alert")).textContent).toContain("broken");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
