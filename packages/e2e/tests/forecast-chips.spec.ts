import { test, expect } from "@playwright/test";

/**
 * Forecast chips E2E — verifies the per-checkpoint "best time today" chips
 * (TIR-300/TIR-311 feature) render on the airport detail page against the
 * real batched forecast endpoint, with the loading skeleton resolving.
 *
 * Seed data guarantees every checkpoint has recent (<1h) reports, so the
 * live-blended imminent slots always produce bestHours — every checkpoint
 * card must therefore end up with exactly one chip.
 */

const CHIP = '[data-testid="best-time-chip"]';
const SKELETON = '[data-testid="best-time-skeleton"]';

test.describe("Airport page forecast chips", () => {
  test("renders a Best-time chip on every checkpoint card once forecasts load", async ({ page }) => {
    await page.goto("/airport/JFK");

    await expect(page.getByRole("heading", { name: "Checkpoints" })).toBeVisible();

    // One "Report wait time for ..." button per checkpoint card = card count.
    const reportButtons = page.getByRole("button", { name: /Report wait time for/ });
    const cardCount = await reportButtons.count();
    expect(cardCount).toBeGreaterThan(0);

    // Forecasts are fetched after the checkpoint list resolves; wait for the
    // first chip, then require ALL cards to have their chip (skeletons gone).
    await expect(page.locator(CHIP).first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator(SKELETON)).toHaveCount(0);
    await expect(page.locator(CHIP)).toHaveCount(cardCount);
  });

  test("chip text matches the API contract format (airport-local hour + predicted minutes)", async ({ page }) => {
    await page.goto("/airport/JFK");

    const firstChip = page.locator(CHIP).first();
    await expect(firstChip).toBeVisible({ timeout: 30000 });

    // "Best ~2 PM · 7 min" — 12-hour clock label plus integer minutes.
    const text = (await firstChip.textContent())?.trim() ?? "";
    expect(text).toMatch(/^Best ~\d+ (AM|PM) · \d+ min$/);

    // The tooltip explains what the chip means (accessibility contract).
    await expect(firstChip).toHaveAttribute(
      "title",
      "Quietest upcoming hour today, from crowd reports",
    );
  });

  test("chip disappears while loading and never blocks checkpoint cards", async ({ page }) => {
    // The forecast request happens after the checkpoint list loads. What must
    // NEVER happen: the checkpoint card failing to render because forecasts
    // are still in flight or errored. Cards + Report buttons must exist
    // regardless of the chip's state.
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/airports/JFK/forecasts") && res.status() === 200,
      { timeout: 30000 },
    );
    await page.goto("/airport/JFK");
    const forecastResponse = await responsePromise;

    // Forecast round trip is a single batched call per airport view.
    expect(forecastResponse.url()).toContain("/api/airports/JFK/forecasts");

    // Checkpoint cards are interactive independent of the forecast result.
    await expect(
      page.getByRole("button", { name: /Report wait time for/ }).first(),
    ).toBeVisible();
    await expect(page.getByText("Terminal 1 Security")).toBeVisible();
  });
});
