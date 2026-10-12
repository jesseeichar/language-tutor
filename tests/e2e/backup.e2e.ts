import { expect, test } from "@playwright/test";

// Git itself is integration-tested with temporary local remotes; browser tests never push this repository.
test("History backs up progress, shows busy state, and reports the destination", async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/progress/backup", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-language-tutor-backup"]).toBe("1");
    await ready;
    await route.fulfill({ json: { remote: "origin", branch: "main", commit: "abc", createdCommit: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "History" }).click();
  await page.getByRole("button", { name: "Back up changes" }).click();
  await expect(page.getByRole("button", { name: "Backing up…" })).toBeDisabled();
  release();
  await expect(page.getByRole("status")).toHaveText("Changes backed up to origin/main.");
  await expect(page.getByRole("button", { name: "Back up changes" })).toBeEnabled();
});

test("a failed push can be retried from History", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/progress/backup", (route) => ++attempts === 1
    ? route.fulfill({ status: 502, json: { error: "Changes are committed locally, but pushing failed. You can retry the backup." } })
    : route.fulfill({ json: { remote: "origin", branch: "main", commit: "abc", createdCommit: false } }));
  await page.goto("/");
  await page.getByRole("button", { name: "History" }).click();
  await page.getByRole("button", { name: "Back up changes" }).click();
  await expect(page.getByRole("alert")).toContainText("pushing failed");
  await page.getByRole("button", { name: "Back up changes" }).click();
  await expect(page.getByRole("status")).toContainText("Changes backed up");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
