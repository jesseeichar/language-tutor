import { expect, test } from "@playwright/test";
import type { ContentEdit, EditorSnapshot } from "../../src/shared";

test("create, rename, nest, assign and study a category; remove it when unused", async ({ page, request }, testInfo) => {
  const read = async () => (await (await request.get("/api/content/editor")).json()) as EditorSnapshot;
  const edit = async (change: ContentEdit["change"]) => {
    const data = await read();
    const response = await request.post("/api/content/editor", { headers: { "X-Language-Tutor-Edit": "1" }, data: { revision: data.revision, change } });
    expect(response.ok()).toBe(true);
  };
  const original = await read();
  const question = original.questions.find((q) => q.id === "fc-zuerst")!;
  let createdId: string | undefined;
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Manage content" }).click();
    await page.getByRole("button", { name: "New category" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Weekend practice");
    await page.getByLabel("Parent category").selectOption("vocab-time");
    await page.getByRole("button", { name: "Save category" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
    createdId = (await read()).categories.find((c) => c.label === "Weekend practice")!.id;
    await page.getByLabel("Name", { exact: true }).fill("Weekend review");
    await page.getByRole("button", { name: "Save category" }).click();
    await expect(page.getByRole("heading", { name: "Edit Weekend review" })).toBeVisible();
    await page.getByRole("button", { name: "Questions", exact: true }).click();
    await page.getByLabel("Search questions").fill("zuerst");
    await page.getByRole("button", { name: /zuerst — first/ }).click();
    await page.getByLabel("Weekend review", { exact: true }).check();
    await page.getByRole("button", { name: "Save assignments" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
    await page.screenshot({ path: testInfo.outputPath("editor-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("editor-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await page.getByRole("button", { name: "Manage content" }).click();
    await page.getByLabel("Filter by category").selectOption(createdId);
    await expect(page.getByRole("button", { name: /zuerst — first/ })).toBeVisible();
    await page.getByRole("button", { name: "Categories", exact: true }).click();
    await page.getByRole("button", { name: /^Weekend review/ }).click();
    await expect(page.getByRole("button", { name: "Delete category" })).toBeDisabled();
    await page.getByRole("button", { name: "Language Tutor" }).click();
    await page.getByRole("button", { name: /Flashcards/ }).click();
    await page.getByLabel("Weekend review", { exact: false }).check();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator(".flashcard-front")).toBeVisible();
    await page.getByRole("button", { name: "End session" }).click();
    await edit({ kind: "assign-categories", modeId: question.modeId, questionId: question.id, categoryIds: question.categories });
    await page.getByRole("button", { name: "Manage content" }).click();
    await page.getByRole("button", { name: "Categories", exact: true }).click();
    await page.getByRole("button", { name: /^Weekend review/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete category" }).click();
    await expect(page.getByRole("button", { name: /^Weekend review/ })).toHaveCount(0);
  } finally {
    await edit({ kind: "assign-categories", modeId: question.modeId, questionId: question.id, categoryIds: question.categories });
    if (createdId && (await read()).categories.some((c) => c.id === createdId)) await edit({ kind: "delete-category", id: createdId });
  }
});
