import { expect, test } from "@playwright/test";
import type { CreateSessionResponse, WorksheetQuestion } from "../../src/shared";

test("the complete worksheet starts in one click, grades all 62 items, and repeats in source order", async ({ page }, info) => {
  await page.goto("/");
  const response = page.waitForResponse(r => r.url().endsWith("/api/sessions") && r.request().method() === "POST");
  await page.getByRole("button", { name: /Zeitlicher Ablauf & Verbindungswörter/ }).click();
  const session = await (await response).json() as CreateSessionResponse;
  expect(session.questions).toHaveLength(10);
  await expect(page.getByRole("heading", { name: "Categories", exact: true })).toHaveCount(0);
  for (let section = 0; section < session.questions.length; section++) {
    const question = session.questions[section] as WorksheetQuestion;
    await expect(page.getByRole("heading", { name: question.title, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check exercise" })).toBeDisabled();
    for (const [index, item] of question.items.entries()) {
      const label = `${index + 1}. ${item.prompt}`;
      if (item.kind === "choice") {
        const answer = section === 0 && index === 0 ? item.options.find(o => o.value !== item.answer)!.value : item.answer;
        if (item.options.length === 3) {
          await page.getByRole("group", { name: label, exact: true }).getByRole("radio", { name: item.options.find(o => o.value === answer)!.label, exact: true }).check();
        } else await page.getByLabel(label, { exact: true }).selectOption(answer);
      } else if (item.kind === "personal") {
        await page.getByLabel(`Wort ${index + 1}`, { exact: true }).fill("zunächst");
        await page.getByLabel(`Eigener Satz ${index + 1}`, { exact: true }).fill("Zunächst lese ich ein Buch.");
      } else {
        await page.getByLabel(label, { exact: true }).fill(item.kind === "blank" ? item.answers[0]! : item.exampleAnswer ?? "Zuerst stehe ich auf. Danach esse ich. Ausserdem lese ich. Jedoch bin ich müde, weil ich spät ins Bett gegangen bin. Schliesslich schlafe ich.");
      }
    }
    if (section === 0) await page.screenshot({ path: info.outputPath("worksheet-classification.png"), fullPage: true });
    if (section === 8) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: info.outputPath("worksheet-story-mobile.png"), fullPage: true });
    }
    await page.getByRole("button", { name: "Check exercise" }).click();
    await expect(page.getByRole("status")).toContainText(section === 0 ? "Partly correct" : "Correct");
    if (section === 0) await expect(page.getByRole("status")).toContainText("15 / 16 points");
    await page.getByRole("button", { name: section === 9 ? "Finish worksheet" : "Next exercise", exact: true }).click();
  }
  await expect(page.getByText("9 / 10 correct · 61 of 62 points", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Repeat this session" }).click();
  await expect(page.getByRole("heading", { name: "1. Welche Funktion hat das Wort?", exact: true })).toBeVisible();
});

test("failed one-click start shows an error and can be retried", async ({ page }) => {
  let first = true;
  await page.route("**/api/sessions", async route => {
    if (!first || route.request().method() !== "POST") return route.continue();
    first = false;
    await route.fulfill({ status: 503, json: { error: "Please retry starting the worksheet." } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Zeitlicher Ablauf & Verbindungswörter/ }).click();
  await expect(page.getByRole("alert")).toContainText("Please retry");
  await page.getByRole("button", { name: /Zeitlicher Ablauf & Verbindungswörter/ }).click();
  await expect(page.getByRole("heading", { name: "1. Welche Funktion hat das Wort?", exact: true })).toBeVisible();
});
