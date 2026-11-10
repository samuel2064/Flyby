import { test, expect } from "@playwright/test";

/**
 * Landing dashboard E2E (rewritten for the TIR-363 public dashboard surface).
 * The "/" route renders PublicDashboard: severity-bucketed airport rows fed
 * by the live /api/wait-times/summary aggregate, 60s auto-refresh, client-side
 * filter. Rows drill into the per-airport stats page.
 */

test.describe("Landing dashboard", () => {
  test("loads the wait-time dashboard with seeded airport rows", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Wait-time dashboard" })).toBeVisible();

    // The seeded JFK airport renders as a severity row with wait + report count.
    const jfkRow = page.getByRole("button", { name: /John F. Kennedy International/ });
    await expect(jfkRow).toBeVisible({ timeout: 10_000 });
    await expect(jfkRow).toContainText(/report/);
    await expect(jfkRow).toContainText(/min/);
  });

  test("filters rows and shows the empty state for unknown queries", async ({ page }) => {
    await page.goto("/");

    const jfkRow = page.getByRole("button", { name: /John F. Kennedy International/ });
    await expect(jfkRow).toBeVisible({ timeout: 10_000 });

    const filter = page.getByPlaceholder(/Filter airports/);
    await filter.fill("JFK");
    await expect(jfkRow).toBeVisible();

    await filter.fill("ZZZZ");
    await expect(page.getByText(/No airports match/)).toBeVisible();
    await expect(jfkRow).toHaveCount(0);

    await filter.fill("");
    await expect(jfkRow).toBeVisible();
  });

  test("drills into the airport stats page when a row is clicked", async ({ page }) => {
    await page.goto("/");

    const jfkRow = page.getByRole("button", { name: /John F. Kennedy International/ });
    await expect(jfkRow).toBeVisible({ timeout: 10_000 });
    await jfkRow.click();

    await expect(page).toHaveURL(/\/airport\/JFK$/);
    await expect(page.getByRole("heading", { name: /JFK · John F. Kennedy International/ })).toBeVisible();
  });
});
