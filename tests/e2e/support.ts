/** Steps shared by the Playwright specs. */
import { expect, type Page } from "@playwright/test";

export async function openFlashcards(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Flashcards/ }).click();
  await expect(page.getByRole("heading", { name: "Flashcards" })).toBeVisible();
}

export async function startSession(page: Page, categories: string[]) {
  await openFlashcards(page);
  for (const c of categories) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Start" }).click();
}

/** Flips and advances through every card, returning each front in the order shown. */
export async function studyAndRecord(page: Page): Promise<string[]> {
  const progress = (await page.locator(".runner-head .muted").first().textContent()) ?? "";
  const total = Number(progress.split("/")[1]);
  const fronts: string[] = [];
  for (let i = 1; i <= total; i++) {
    await expect(page.locator(".runner-head")).toContainText(`${i} / ${total}`);
    fronts.push((await page.locator(".flashcard-front").textContent()) ?? "");
    await page.getByRole("button", { name: /Flip/ }).click();
    await page.getByRole("button", { name: i === total ? /Finish/ : /Next/ }).click();
  }
  await expect(page.getByText(/^Studied/)).toBeVisible();
  return fronts;
}
