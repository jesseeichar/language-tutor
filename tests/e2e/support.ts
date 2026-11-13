/** Steps shared by the Playwright specs. */
import { expect, type Page } from "@playwright/test";
import type { CreateSessionResponse } from "../../src/shared";

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

/** Starts a quiz of one question type and returns the session the server created. */
export async function openQuiz(page: Page, type: string, category: string, direction = "German → English", count = "1") {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quiz / }).click();
  await page.getByLabel(category, { exact: false }).check();
  for (const label of ["Multiple choice", "Fill in the blank", "Translation"]) {
    await page.getByRole("group", { name: "Question types", exact: true }).getByLabel(new RegExp(`^${label}`)).setChecked(label === type);
  }
  await page.getByLabel(direction, { exact: true }).check();
  await page.getByLabel("Questions in this session").selectOption("custom");
  await page.getByLabel("Number of questions").fill(count);
  const response = page.waitForResponse(r => r.url().endsWith("/api/sessions") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  return await (await response).json() as CreateSessionResponse;
}
