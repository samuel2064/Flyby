import { test, expect } from "@playwright/test";

/**
 * Report flow E2E (rewritten for the current reporting surface).
 *
 * The routed report path is the checkpoint page (/checkpoint/:id, Report Time
 * button -> ReportModal). Checkpoint ids are Prisma UUIDs in the seeded E2E
 * database, so the test discovers one through the public airport-detail API
 * instead of hardcoding an id.
 *
 * The POST is intercepted so the test is deterministic (rate limits and DB
 * contention from other workers must not flap the suite).
 */

test.describe("Report wait time", () => {
  test("opens the report modal from a checkpoint page and submits successfully", async ({ page }) => {
    // Discover a seeded checkpoint id for JFK through the public API.
    const detail = await page.request.get("/api/airports/JFK");
    expect(detail.ok()).toBeTruthy();
    const payload = await detail.json();
    const checkpointId = payload?.data?.checkpoints?.[0]?.id;
    expect(checkpointId, "seeded JFK airport detail must expose checkpoints").toBeTruthy();

    // Deterministic POST: fulfill with the 201 contract shape.
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

    await page.goto(`/checkpoint/${checkpointId}`);

    // Open the report modal.
    const reportButton = page.getByRole("button", { name: /Report Time/i }).first();
    await expect(reportButton).toBeVisible();
    await reportButton.click();

    await expect(page.getByRole("heading", { name: "Report Wait Time" })).toBeVisible();

    // Preset wait-time options with 15 selected by default.
    await expect(page.getByRole("button", { name: "15", exact: true })).toBeVisible();

    // Lane picker (TIR-367): three choices, Standard preselected.
    const standard = page.getByRole("radio", { name: "Standard" });
    await expect(standard).toBeVisible();
    await expect(standard).toHaveAttribute("aria-checked", "true");

    // Submit and observe the success feedback.
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(/Thanks for reporting/)).toBeVisible({ timeout: 10_000 });

    // The modal auto-closes after the success flash.
    await expect(page.getByRole("heading", { name: "Report Wait Time" })).not.toBeVisible({ timeout: 10_000 });
  });

  test("report modal is cancellable without submitting", async ({ page }) => {
    const detail = await page.request.get("/api/airports/JFK");
    const payload = await detail.json();
    const checkpointId = payload?.data?.checkpoints?.[0]?.id;
    expect(checkpointId).toBeTruthy();

    await page.goto(`/checkpoint/${checkpointId}`);
    await page.getByRole("button", { name: /Report Time/i }).first().click();
    await expect(page.getByRole("heading", { name: "Report Wait Time" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Report Wait Time" })).not.toBeVisible();
  });
});
