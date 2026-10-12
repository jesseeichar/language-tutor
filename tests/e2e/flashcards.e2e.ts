import { expect, test } from "@playwright/test";
import { openFlashcards, studyAndRecord } from "./support";

test("home lists the flashcard study tool", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Study" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Flashcards/ })).toContainText("5 questions");
  await expect(page.getByRole("button", { name: /^Quiz / })).toContainText("7 questions");
});

test("Start needs at least one category", async ({ page }) => {
  await openFlashcards(page);
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
  await page.getByLabel("Time").check();
  await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
});

test("study a session across several categories", async ({ page }) => {
  await openFlashcards(page);
  await page.getByLabel("Time").check();
  await page.getByLabel("Cases").check();
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.locator(".flashcard-side-label")).toHaveText(/^Question/);
  await page.getByRole("button", { name: /Flip/ }).click();
  await expect(page.locator(".flashcard-side-label")).toHaveText(/^Answer/);
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Flip/ }).click();
  await page.getByRole("button", { name: /Finish/ }).click();

  await expect(page.getByText("Studied 2 of 2 cards")).toBeVisible();
  await expect(page.getByText(/worth 0 points/)).toBeVisible();
});

test("a parent category includes its children", async ({ page }) => {
  await openFlashcards(page);
  await page.getByLabel("Connectors").check();
  await page.getByRole("button", { name: "Start" }).click();
  expect(await studyAndRecord(page)).toHaveLength(2);
  await expect(page.getByText("Studied 2 of 2 cards")).toBeVisible();
});

test("keyboard: Space flips, arrow moves on", async ({ page }) => {
  await openFlashcards(page);
  await page.getByLabel("Contrast").check();
  await page.getByLabel("German → English").check();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("jedoch")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByText("however")).toBeVisible();
  await expect(page.getByText(/Jedoch ist es teuer/)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Studied 1 of 1 cards")).toBeVisible();
});

test("ending a session early shows how far you got", async ({ page }) => {
  await openFlashcards(page);
  await page.getByLabel("Connectors").check();
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: /Flip/ }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByText("Studied 1 of 2 cards")).toBeVisible();
});

test("the category selection is remembered", async ({ page }) => {
  await openFlashcards(page);
  await page.getByLabel("Cases").check();
  await page.getByRole("button", { name: "Start" }).click();
  expect(await studyAndRecord(page)).toHaveLength(1);
  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.getByLabel("Cases")).toBeChecked();
  await expect(page.getByLabel("Time")).not.toBeChecked();
});

test("progress is stored: a card already studied gives way to a fresh one", async ({ page }) => {
  const studyOneFreshCard = async () => {
    await openFlashcards(page);
    await page.getByLabel("Freshness check").check();
    const count = page.getByLabel(/Questions in this session/);
    await count.fill("1");
    await page.getByRole("button", { name: "Start" }).click();
    const front = (await page.locator(".flashcard-front").textContent()) ?? "";
    await page.getByRole("button", { name: /Flip/ }).click();
    await page.getByRole("button", { name: /Finish/ }).click();
    await expect(page.getByText("Studied 1 of 1 cards")).toBeVisible();
    return front;
  };
  const first = await studyOneFreshCard();
  await page.reload();
  const second = await studyOneFreshCard();
  expect(new Set([first, second])).toEqual(new Set(["Fresh card A", "Fresh card B"]));
});

test("question types: only the selected types are studied", async ({ page }) => {
  await openFlashcards(page);
  await page.getByLabel("Connectors").check();
  await page.getByLabel("Cases").check();
  await page.getByLabel(/^Translation/).uncheck();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("1 / 1")).toBeVisible();
  await expect(page.getByText("Fill in the blank", { exact: true })).toBeVisible();
  await expect(page.getByText("Ich lege das Buch auf ___ Tisch.")).toBeVisible();
});

test("unchecking every question type blocks Start", async ({ page }) => {
  await openFlashcards(page);
  await page.getByLabel("Time").check();
  await page.getByLabel(/^Translation/).uncheck();
  await page.getByLabel(/^Fill in the blank/).uncheck();
  await expect(page.getByText("Select at least one question type.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
});

test("English → German shows the English side first", async ({ page }) => {
  await openFlashcards(page);
  await page.getByLabel("Contrast").check();
  await page.getByLabel("English → German").check();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".flashcard-front")).toHaveText("however");
  await page.getByRole("button", { name: /Flip/ }).click();
  await expect(page.locator(".flashcard-back")).toHaveText("jedoch");
});

test("fixed cards look the same whatever the direction", async ({ page }) => {
  await openFlashcards(page);
  await page.getByLabel("Cases").check();
  await page.getByLabel("English → German").check();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".flashcard-front")).toHaveText("Ich lege das Buch auf ___ Tisch.");
});
