import { expect, test, type Page } from "@playwright/test";
import type { CreateSessionResponse, QuizQuestion, WorksheetQuestion } from "../../src/shared";
import { openQuiz, startSession } from "./support";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const sessionStart = (page: Page) => page.waitForResponse(r => r.url().endsWith("/api/sessions") && r.request().method() === "POST");

test("a flashcard copies each side separately, the back only after flipping", async ({ page }) => {
  await startSession(page, ["Contrast", "German → English"]);
  await expect(page.getByRole("button", { name: "Copy back" })).toHaveCount(0);
  await page.getByRole("button", { name: "Copy front" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await clipboard(page)).toBe("jedoch");
  // Copying did not reveal the card.
  await expect(page.locator(".flashcard-side-label")).toHaveText(/^Question/);
  await page.getByRole("button", { name: /Flip/ }).click();
  await page.getByRole("button", { name: "Copy back" }).click();
  expect(await clipboard(page)).toBe("however");
});

test("a multiple-choice quiz card copies the question and its options", async ({ page }) => {
  const question = (await openQuiz(page, "Multiple choice", "Time")).questions[0] as Extract<QuizQuestion, { type: "multiple-choice" }>;
  await page.getByRole("button", { name: "Copy question and options" }).click();
  expect(await clipboard(page)).toBe([question.de.prompt, ...question.de.options.map(o => `- ${o}`)].join("\n"));
});

test("a fill-in-the-blank quiz card copies the question, and the expected answer once checked", async ({ page }) => {
  const question = (await openQuiz(page, "Fill in the blank", "Cases")).questions[0] as Extract<QuizQuestion, { type: "fill-in-the-blank" }>;
  await page.getByRole("button", { name: "Copy question", exact: true }).click();
  expect(await clipboard(page)).toBe(question.prompt);
  await page.getByLabel("Your answer").fill("falsch");
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByRole("button", { name: "Copy question and answer" }).click();
  expect(await clipboard(page)).toBe(`${question.prompt}\n${question.answer}`);
});

test("a worksheet exercise copies its title, instructions and items", async ({ page }) => {
  await page.goto("/");
  const response = sessionStart(page);
  await page.getByRole("button", { name: /Zeitlicher Ablauf & Verbindungswörter/ }).click();
  const question = ((await (await response).json()) as CreateSessionResponse).questions[0] as WorksheetQuestion;
  await page.getByRole("button", { name: "Copy exercise" }).click();
  const text = await clipboard(page);
  expect(text.split("\n").slice(0, 2)).toEqual([question.title, question.instructions]);
  expect(text).toContain(`1. ${question.items[0]!.prompt}`);
  expect(text.split("\n").filter(line => /^\d+\. /.test(line))).toHaveLength(question.items.length + (/^\d+\. /.test(question.title) ? 1 : 0));
});
