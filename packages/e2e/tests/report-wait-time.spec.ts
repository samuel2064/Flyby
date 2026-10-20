import { test, expect } from "@playwright/test";

/**
 * Report wait time E2E tests — verifies the full reporting flow:
 * open report modal, adjust minutes, submit, and see success feedback.
 */

test.describe("Report wait time", () => {
  test("submits a wait time report and shows success", async ({ page }) => {
    // Intercept the API call so the test is deterministic and not affected
    // by rate limits or DB contention from other test workers.
    await page.route("**/api/checkpoints/*/wait-times", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: { id: "mock-wait-time-id", minutes: 20, source: "crowd" },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/airport/JFK");

    // Wait for the page to be fully loaded
    await expect(page.getByRole("heading", { name: "Checkpoints" })).toBeVisible();

    // Open the report modal on the first checkpoint
    const reportButton = page.getByRole("button", { name: /Report wait time for/ }).first();
    await reportButton.click();

    // Modal appears with the right heading and checkpoint name
    await expect(page.getByRole("heading", { name: "Report Wait Time" })).toBeVisible();

    // Verify the slider and initial value (scope to the modal form to avoid matching list items)
    const modalForm = page.locator("form");
    const slider = modalForm.locator('input[type="range"]');
    await expect(slider).toBeVisible();
    await expect(modalForm.getByText("15 min")).toBeVisible();

    // Adjust minutes to 20 using Playwright's fill method
    await slider.fill("20");

    // Click the Submit button
    await page.getByRole("button", { name: "Submit" }).click();

    // Wait for success state
    const successMessage = page.getByText(/Thanks for reporting/);
    await expect(successMessage).toBeVisible({ timeout: 10_000 });
    
    // Modal should auto-close after success
    await expect(page.getByRole("heading", { name: "Report Wait Time" })).not.toBeVisible();
  });
});
