import { test, expect } from "@playwright/test";

/**
 * Airport detail E2E tests — verifies the airport detail page loads
 * with airport information and a list of checkpoints with wait times.
 */

test.describe("Airport detail page", () => {
  test("displays airport info and checkpoints", async ({ page }) => {
    await page.goto("/airport/JFK");

    // Airport name and location
    await expect(page.getByRole("heading", { name: "John F. Kennedy International Airport" })).toBeVisible();
    await expect(page.getByText("New York, NY — USA")).toBeVisible();

    // Checkpoints section
    await expect(page.getByRole("heading", { name: "Checkpoints" })).toBeVisible();

    // At least one checkpoint card
    const checkpointCards = page.locator(".bg-white.rounded-lg");
    await expect(checkpointCards.first()).toBeVisible();

    // Check for a specific seeded checkpoint
    await expect(page.getByText("Terminal 1 Security")).toBeVisible();
  });

  test("has working Report buttons for each checkpoint", async ({ page }) => {
    await page.goto("/airport/JFK");

    // Wait for page to load
    await expect(page.getByRole("heading", { name: "John F. Kennedy International Airport" })).toBeVisible();

    // Find all Report buttons
    const reportButtons = page.getByRole("button", { name: /Report wait time for/ });
    const count = await reportButtons.count();
    expect(count).toBeGreaterThan(0);

    // Click the first report button
    await reportButtons.first().click();

    // Verify the modal appears
    await expect(page.getByRole("heading", { name: "Report Wait Time" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });
});
