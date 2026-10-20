import { test, expect } from "@playwright/test";

/**
 * Authentication E2E tests — verifies login, signup, and protected route flows.
 */

test.describe("Authentication", () => {
  // No beforeEach needed — pages start fresh with no localStorage per test

  test.describe("Login page", () => {
    test("displays login form", async ({ page }) => {
      await page.goto("/login");

      // Page heading
      await expect(page.getByRole("heading", { name: "Log in to Flyby" })).toBeVisible();

      // Form fields
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    });

    test("shows error for invalid credentials", async ({ page }) => {
      await page.goto("/login");

      await page.getByLabel("Email").fill("nonexistent@example.com");
      await page.getByLabel("Password", { exact: true }).fill("wrongpassword");
      await page.getByRole("button", { name: "Log in" }).click();

      await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    });

    test("successfully logs in and redirects to dashboard", async ({ page }) => {
      // Sign up first so we have a user to log in with
      await page.goto("/signup");
      await page.getByLabel("Display Name").fill("Test User");
      await page.getByLabel("Email").fill("login-test@example.com");
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Sign up" }).click();

      // Wait for dashboard redirect after signup
      await expect(page).toHaveURL("/dashboard");

      // Log out so we can test login from scratch
      await page.getByRole("button", { name: "Log out" }).click();

      // Log in with the same credentials
      await page.goto("/login");
      await page.getByLabel("Email").fill("login-test@example.com");
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Log in" }).click();

      // Should redirect to dashboard on success
      await expect(page).toHaveURL("/dashboard");
    });
  });

  test.describe("Signup page", () => {
    test("displays signup form", async ({ page }) => {
      await page.goto("/signup");

      // Page heading
      await expect(page.getByRole("heading", { name: "Create your Flyby account" })).toBeVisible();

      // Form fields
      await expect(page.getByLabel("Display Name")).toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();
    });

    test("shows error for duplicate email", async ({ page }) => {
      // Sign up first
      await page.goto("/signup");
      await page.getByLabel("Display Name").fill("First User");
      await page.getByLabel("Email").fill("duplicate@example.com");
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Sign up" }).click();
      await expect(page).toHaveURL("/dashboard");

      // Log out so we can test duplicate email from scratch
      await page.getByRole("button", { name: "Log out" }).click();

      // Try signing up again with same email
      await page.goto("/signup");
      await page.getByLabel("Display Name").fill("Second User");
      await page.getByLabel("Email").fill("duplicate@example.com");
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Sign up" }).click();

      // Should show duplicate email error
      await expect(page.getByText(/already (exists|registered)/i)).toBeVisible();
    });

    test("successfully signs up and redirects to dashboard", async ({ page }) => {
      await page.goto("/signup");

      await page.getByLabel("Display Name").fill("New User");
      await page.getByLabel("Email").fill("newuser@example.com");
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Sign up" }).click();

      // Should redirect to dashboard on success
      await expect(page).toHaveURL("/dashboard");
    });
  });

  test.describe("Protected routes", () => {
    test("redirects to login when accessing dashboard without auth", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL("/login");
    });

    test("redirects to login when accessing profile without auth", async ({ page }) => {
      await page.goto("/profile");
      await expect(page).toHaveURL("/login");
    });

    test("allows access to dashboard after login", async ({ page }) => {
      // Sign up and log in
      await page.goto("/signup");
      await page.getByLabel("Display Name").fill("Dashboard User");
      await page.getByLabel("Email").fill("dashboard@example.com");
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Sign up" }).click();

      // Wait for dashboard
      await expect(page).toHaveURL("/dashboard");

      // Navigate directly to dashboard (reload page)
      await page.goto("/dashboard");
      await expect(page).toHaveURL("/dashboard");
    });

    test("allows access to profile after login", async ({ page }) => {
      // Sign up and log in
      await page.goto("/signup");
      await page.getByLabel("Display Name").fill("Profile User");
      await page.getByLabel("Email").fill("profile@example.com");
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByRole("button", { name: "Sign up" }).click();

      // Wait for dashboard
      await expect(page).toHaveURL("/dashboard");

      // Navigate to profile (reload page)
      await page.goto("/profile");
      await expect(page).toHaveURL("/profile");
    });
  });
});
