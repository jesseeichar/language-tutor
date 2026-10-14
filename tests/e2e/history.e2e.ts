import { expect, test } from "@playwright/test";
import { startSession, studyAndRecord } from "./support";

test("repeat from the summary shows the same cards, in the same order and direction", async ({ page }) => {
  await startSession(page, ["Connectors", "Cases"]); // random direction by default
  const first = await studyAndRecord(page);
  await page.getByRole("button", { name: "Repeat this session" }).click();
  const second = await studyAndRecord(page);
  expect(second).toEqual(first);
});

test("the history logs every session and can repeat one later", async ({ page }) => {
  await startSession(page, ["Cases"]);
  const original = await studyAndRecord(page);

  await page.reload(); // the log is stored on the server, not in the page
  await page.getByRole("button", { name: "History" }).click();
  const latest = page.locator(".log-entry").first();
  await expect(latest).toContainText("Cases");
  await expect(latest).toContainText("Studied 1 of 1 cards");

  await latest.getByRole("button", { name: "Repeat" }).click();
  const repeated = await studyAndRecord(page);
  expect(repeated).toEqual(original);

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".log-entry").first()).toContainText("Repeated session");
});

test("unfinished sessions are logged too", async ({ page }) => {
  await startSession(page, ["Time"]);
  await expect(page.locator(".flashcard-front")).toBeVisible();
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".log-entry").first()).toContainText("not finished");
});

test("history retains only 50 sessions and the oldest retained session can still be repeated", async ({ page }) => {
  const ids: string[] = [];
  for (let i = 0; i < 51; i++) {
    const response = await page.request.post("/api/sessions", { data: { modeId: "flashcards", categoryIds: ["grammar-cases"], count: 1 } });
    expect(response.ok()).toBe(true);
    ids.push((await response.json()).session.id);
  }
  const history = await (await page.request.get("/api/sessions")).json();
  expect(history.map((entry: { session: { id: string } }) => entry.session.id)).toEqual(ids.slice(1).reverse());
  expect((await page.request.post(`/api/sessions/${ids[0]}/repeat`)).status()).toBe(404);
  const repeated = await page.request.post(`/api/sessions/${ids[1]}/repeat`);
  expect(repeated.ok()).toBe(true);
  expect((await repeated.json()).session.repeatOf).toBeNull();
  await page.goto("/");
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText(/The last 50 sessions are kept/)).toBeVisible();
  await expect(page.locator(".log-entry")).toHaveCount(50);
  await page.locator(".log-entry").first().getByRole("button", { name: "Repeat" }).click();
  await studyAndRecord(page);
  await expect(page.getByText("Studied 1 of 1 cards")).toBeVisible();
});
