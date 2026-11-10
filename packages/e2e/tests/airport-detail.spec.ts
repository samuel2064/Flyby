import { test, expect } from "@playwright/test";

/**
 * Airport detail E2E (rewritten for the TIR-363 stats drill surface).
 * /airport/:code renders the per-airport stats page: Avg / Median / P90 strip,
 * busiest-hours and day-of-week CSS bar charts, all fed by the live
 * /api/airports/:code/wait-stats endpoint.
 *
 * NOTE: the previous spec asserted the retired checkpoint-list UI (checkpoint
 * cards, per-card report buttons, best-time chips). That surface was replaced
 * by this stats drill in the TIR-363 port; the forecast API contract itself
 * remains covered by the packages/api contract tests and the 32-probe
 * launch corpus.
 */

test.describe("Airport detail stats page", () => {
  test("renders airport stats fed by the live wait-stats endpoint", async ({ page }) => {
    const statsResponse = page.waitForResponse(
      (res) => res.url().includes("/api/airports/JFK/wait-stats") && res.status() === 200,
      { timeout: 30_000 },
    );
    await page.goto("/airport/JFK");
    await statsResponse;

    // Heading combines the code and the airport name from the stats payload.
    await expect(page.getByRole("heading", { name: /JFK · John F. Kennedy International/ })).toBeVisible();

    // Sample-size provenance line (no reporter identity exposed).
    await expect(page.getByText(/Based on \d+ crowd report/)).toBeVisible();

    // The Avg / Median / P90 strip.
    await expect(page.getByText("Average")).toBeVisible();
    await expect(page.getByText("Median (P50)")).toBeVisible();
    await expect(page.getByText("Worst case (P90)")).toBeVisible();

    // Both CSS bar charts render with their titles (figcaption only — the
    // sr-only summary paragraph repeats the title text).
    await expect(page.locator("figure figcaption").filter({ hasText: "Busiest hours" })).toBeVisible();
    await expect(page.locator("figure figcaption").filter({ hasText: "By day of week" })).toBeVisible();
  });

  test("returns to the dashboard via the back control", async ({ page }) => {
    await page.goto("/airport/JFK");
    await expect(page.getByRole("heading", { name: /JFK · / })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /All airports/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Wait-time dashboard" })).toBeVisible();
  });

  test("shows an error state for an unknown airport code", async ({ page }) => {
    await page.goto("/airport/ZZZ");

    // The stats drill error state (NOTE: unlike PublicDashboard it currently
    // has no Retry control — flagged as a UX follow-up on the TIR-363 lane).
    await expect(page.getByText(/Could not load stats for ZZZ/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("The API may be waking up. Try again in a moment.")).toBeVisible();
  });
});
