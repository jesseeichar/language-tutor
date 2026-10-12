import { expect, test, type Page } from "@playwright/test";
import type { CreateSessionResponse, QuizQuestion } from "../../src/shared";

async function openQuiz(page: Page, type: string, category: string, direction = "German → English", count = "1") {
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

for (const direction of ["German → English", "English → German"]) {
  test(`multiple choice ${direction}: correct and incorrect answers, summary and exact repeat`, async ({ page }, info) => {
    const session = await openQuiz(page, "Multiple choice", "Time", direction, "2");
    const prompts: string[] = [];
    for (let i = 0; i < 2; i++) {
      const question = session.questions[i] as Extract<QuizQuestion, { type: "multiple-choice" }>;
      const side = direction === "German → English" ? question.de : question.en;
      prompts.push(side.prompt);
      await expect(page.getByRole("heading", { name: side.prompt, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Check answer" })).toBeDisabled();
      await page.getByRole("radio", { name: side.options[i === 0 ? question.correctIndex : (question.correctIndex + 1) % 4], exact: true }).check();
      await page.getByRole("button", { name: "Check answer" }).click();
      await expect(page.getByRole("status")).toContainText(i === 0 ? "Correct" : "Incorrect");
      await expect(page.getByRole("status")).toContainText(`Expected answer: ${side.options[question.correctIndex]}`);
      if (i === 0) await page.screenshot({ path: info.outputPath("multiple-choice-desktop.png"), fullPage: true });
      await page.getByRole("button", { name: i === 0 ? "Next" : "Finish", exact: true }).click();
    }
    await expect(page.getByText("1 / 2 correct · 1 of 2 points", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Repeat this session" }).click();
    await expect(page.getByRole("heading", { name: prompts[0], exact: true })).toBeVisible();
    await expect(page.getByText(direction, { exact: true })).toBeVisible();
  });

  test(`translation ${direction}: alternative wording accepted, incorrect meaning rejected and saved history`, async ({ page }, info) => {
    const session = await openQuiz(page, "Translation", "Time", direction);
    const question = session.questions[0] as Extract<QuizQuestion, { type: "translation" }>;
    const answer = direction === "German → English" ? question.en : question.de;
    await expect(page.getByRole("heading", { name: direction === "German → English" ? question.de : question.en, exact: true })).toBeVisible();
    await page.getByLabel("Your answer").fill(direction === "German → English" ? "We first read the report." : "Wir lesen zuerst den Bericht.");
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByRole("status")).toContainText("Correct");
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByText("1 / 1 correct · 1 of 1 points", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Repeat this session" }).click();
    await page.getByLabel("Your answer").fill("This sentence has the opposite meaning.");
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByRole("status")).toContainText("Incorrect");
    await expect(page.getByRole("status")).toContainText(answer);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath("translation-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByText("0 / 1 correct · 0 of 1 points", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.locator(".log-entry").first()).toContainText("0 / 1 correct · 0 of 1 points");
    await expect(page.locator(".log-entry").first()).toContainText("Translation");
  });
}

test("fill in the blank: check missing text, finish, and repeat with the correct answer", async ({ page }) => {
  await openQuiz(page, "Fill in the blank", "Cases");
  await expect(page.getByRole("heading", { name: "Ich lege das Buch auf ___ Tisch." })).toBeVisible();
  await page.getByLabel("Your answer").fill("Den");
  await page.getByLabel("Your answer").press("Enter");
  await expect(page.getByRole("status")).toContainText("Incorrect");
  await expect(page.getByRole("status")).toContainText("Wohin? Use the accusative.");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Repeat this session" }).click();
  await page.getByLabel("Your answer").fill("den");
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("status")).toContainText("Correct");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText("1 / 1 correct · 1 of 1 points", { exact: true })).toBeVisible();
});

test("a lost answer response can be retried without duplicate scoring, and pending saves block End session", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let drop = true;
  await page.route("**/api/sessions/*/answers", async route => {
    const response = await route.fetch();
    if (drop) {
      drop = false;
      await pending;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await openQuiz(page, "Fill in the blank", "Cases");
  await page.getByLabel("Your answer").fill("den");
  await page.getByRole("button", { name: "Check answer" }).click();
  try { await expect(page.getByRole("button", { name: "End session" })).toBeDisabled(); }
  finally { release(); }
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check answer" })).toBeEnabled();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("status")).toContainText("Correct");
  await expect(page.getByRole("status")).toContainText("Expected answer: den");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText("1 / 1 correct · 1 of 1 points", { exact: true })).toBeVisible();
});

test("Jev failure preserves the translation and allows retry while pending grading blocks ending", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  await page.route("**/api/sessions/*/answers", async route => {
    if (!first) return route.continue();
    first = false;
    await pending;
    await route.fulfill({ status: 503, json: { error: "Jev is unavailable. Your answer has not been scored; please retry." } });
  });
  await openQuiz(page, "Translation", "Time");
  const answer = "Initially, we read the report.";
  await page.getByLabel("Your answer").fill(answer);
  await page.getByRole("button", { name: "Check answer" }).click();
  try {
    await expect(page.getByRole("button", { name: "Checking with Jev…" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "End session" })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByRole("alert")).toContainText("not been scored");
  await expect(page.getByLabel("Your answer")).toHaveValue(answer);
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("status")).toContainText("Meaning and grammar accepted");
  await expect(page.getByRole("status")).toContainText("Reference translation:");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText("1 / 1 correct · 1 of 1 points", { exact: true })).toBeVisible();
});
