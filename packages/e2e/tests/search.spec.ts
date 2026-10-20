import { test, expect } from "@playwright/test";

/**
 * Search E2E tests — verifies searching for airports by code,
 * displaying results, and navigating to an airport detail page.
 */

test.describe("Search page", () => {
  test("searches airports by code and navigates to detail", async ({ page }) => {
    await page.goto("/search");

    // Page heading
    await expect(page.getByRole("heading", { name: "Search Airports" })).toBeVisible();

    // Search input (AirportSearch component with debounced autocomplete)
    const searchInput = page.getByPlaceholder("Airport code, name, city...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("JFK");

    // Wait for autocomplete dropdown results (results are links containing the airport name)
    const airportLink = page.getByRole("link", { name: /John F. Kennedy/ });
    await expect(airportLink.first()).toBeVisible({ timeout: 10_000 });

    // Navigate to the airport detail
    await airportLink.first().click();

    // Verify we're on the airport detail page (URL uses lowercase code)
    await expect(page).toHaveURL(/\/airport\/jfk/);
  });

  test("displays empty state when no results", async ({ page }) => {
    await page.goto("/search");

    await page.getByPlaceholder("Airport code, name, city...").fill("ZZZZ");

    // Should show no results message in the autocomplete dropdown
    await expect(page.getByText("No airports found.")).toBeVisible({ timeout: 10_000 });
  });
});
