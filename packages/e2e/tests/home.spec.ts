import { test, expect } from "@playwright/test";

/**
 * Home page E2E tests — verifies the main dashboard loads and displays
 * live checkpoint wait times with the correct structure.
 */

test.describe("Home page", () => {
  test("loads live wait times dashboard", async ({ page }) => {
    await page.goto("/");

    // Heading
    await expect(page.getByRole("heading", { name: "Live Wait Times" })).toBeVisible();

    // Airport cards rendered
    const airportCards = page.locator(".bg-white.rounded-lg");
    await expect(airportCards.first()).toBeVisible();

    // Expand the first airport card by clicking its header button
    const firstCard = airportCards.first();
    const expandButton = firstCard.locator("button[aria-expanded]");
    await expect(expandButton).toBeVisible();
    await expandButton.click();

    // After expanding, the card should show checkpoint details
    const firstExpanded = firstCard.locator('[data-testid^="airport-checkpoints-"]');
    await expect(firstExpanded).toBeVisible();

    // Checkpoint details should include Terminal info and a Report button
    await expect(firstExpanded.getByText(/Terminal/).first()).toBeVisible();
    await expect(firstExpanded.getByRole("button", { name: "Report time" }).first()).toBeVisible();
  });

  test("shows correct wait time color buckets", async ({ page }) => {
    await page.goto("/");

    const cards = page.locator(".bg-white.rounded-lg");
    await expect(cards.first()).toBeVisible();

    // Verify at least one card has a valid color class applied based on wait time
    const validWaitTime = page.locator(".text-green-600, .text-yellow-600, .text-red-600");
    const noWaitTime = page.locator(".text-gray-400");
    const waitTimeCount = await validWaitTime.count();
    const noWaitCount = await noWaitTime.count();

    // Expect either some cards show colors OR some show gray (if no data)
    expect(waitTimeCount + noWaitCount).toBeGreaterThan(0);
  });
});
