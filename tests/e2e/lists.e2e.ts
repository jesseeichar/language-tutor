import { expect, test } from "@playwright/test";
import type { ContentEdit, EditorSnapshot } from "../../src/shared";
import { openFlashcards } from "./support";

test("create a list, add and remove cards while studying, browse members, and study the list", async ({ page, request }) => {
  const read = async () => (await (await request.get("/api/content/editor")).json()) as EditorSnapshot;
  const edit = async (change: ContentEdit["change"]) => {
    const data = await read();
    const response = await request.post("/api/content/editor", { headers: { "X-Language-Tutor-Edit": "1" }, data: { revision: data.revision, change } });
    expect(response.ok()).toBe(true);
  };
  const original = await read();
  const jedoch = original.questions.find((q) => q.id === "fc-jedoch")!;
  let createdId: string | undefined;
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Manage content" }).click();
    await page.getByRole("button", { name: "New category" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Weekend list");
    await page.getByLabel("Show in flashcard lists").check();
    await page.getByRole("button", { name: "Save category" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
    createdId = (await read()).categories.find((c) => c.label === "Weekend list")!.id;
    expect((await read()).categories.find((c) => c.id === createdId)!.isList).toBe(true);

    // Quick-add during study: picking a list in the menu adds the card there; the icon then toggles it.
    await openFlashcards(page);
    await page.getByLabel("Contrast").check();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.locator(".flashcard-front")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to Needs work" })).toBeVisible();
    await page.getByRole("button", { name: "Choose list" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Weekend list" }).click();
    await expect(page.getByRole("button", { name: "Remove from Weekend list" })).toBeVisible();
    await page.getByRole("button", { name: "Remove from Weekend list" }).click();
    await expect(page.getByRole("button", { name: "Add to Weekend list" })).toBeVisible();
    await page.getByRole("button", { name: "Add to Weekend list" }).click();
    await expect(page.getByRole("button", { name: "Remove from Weekend list" })).toBeVisible();
    await page.getByRole("button", { name: "Choose list" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Weekend list" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    // Keys used inside the control must not drive the flashcard: → on a flipped last card would finish the session.
    await page.getByRole("button", { name: /Flip/ }).click();
    await page.getByRole("button", { name: "Choose list" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".runner-head")).toContainText("1 / 1");
    expect((await read()).questions.find((q) => q.id === "fc-jedoch")!.categories).toEqual([...jedoch.categories, createdId]);
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByText("Studied 1 of 1 cards")).toBeVisible();

    // Lists screen: direct members can be removed, inherited ones are labeled.
    await page.getByRole("button", { name: "Lists", exact: true }).click();
    await expect(page.getByRole("button", { name: "Weekend list 1" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("jedoch — however")).toBeVisible();
    await page.getByRole("button", { name: "Tricky words 1" }).click();
    await expect(page.getByText(/Ich lege das Buch/)).toBeVisible();
    await expect(page.getByText("via Tricky grammar")).toBeVisible();
    await page.getByRole("button", { name: "Needs work 0" }).click();
    await expect(page.getByRole("button", { name: "Study Needs work" })).toBeDisabled();

    // Study the list: the setup opens with the list selected and every matching card.
    await page.getByRole("button", { name: "Weekend list 1" }).click();
    await page.getByRole("button", { name: "Study Weekend list" }).click();
    await expect(page.getByRole("heading", { name: "Flashcards" })).toBeVisible();
    await expect(page.getByLabel("Weekend list")).toBeChecked();
    await expect(page.getByLabel("Contrast")).not.toBeChecked();
    await expect(page.getByLabel("Questions in this session")).toHaveValue("all");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.locator(".runner-head")).toContainText("1 / 1");
    await expect(page.locator(".flashcard-front")).toHaveText(/jedoch|however/);
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByText("Studied 0 of 1 cards")).toBeVisible();

    await page.getByRole("button", { name: "Lists", exact: true }).click();
    await page.getByRole("button", { name: "Remove jedoch — however from Weekend list" }).click();
    await expect(page.getByRole("button", { name: "Weekend list 0" })).toBeVisible();
    expect((await read()).questions.find((q) => q.id === "fc-jedoch")!.categories).toEqual(jedoch.categories);
  } finally {
    await edit({ kind: "assign-categories", modeId: jedoch.modeId, questionId: jedoch.id, categoryIds: jedoch.categories });
    if (createdId && (await read()).categories.some((c) => c.id === createdId)) await edit({ kind: "delete-category", id: createdId });
  }
});
