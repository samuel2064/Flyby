import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestBrowserRouter } from "./testRouter";
import { AuthProvider } from "../src/contexts/AuthContext";
import Login from "../src/pages/Login";

const renderLogin = () =>
  render(
    <TestBrowserRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </TestBrowserRouter>
  );

describe("Login page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders login form", () => {
    renderLogin();
    expect(screen.getByText("Log in to Flyby")).toBeDefined();
    expect(screen.getByPlaceholderText("you@example.com")).toBeDefined();
    expect(screen.getByPlaceholderText("••••••••")).toBeDefined();
  });

  it("logs in successfully and shows welcome message", async () => {
    const mockToken = "header." + btoa(JSON.stringify({ sub: "user-123" })) + ".signature";

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          user: { id: "user-123", email: "test@example.com", displayName: "Test User" },
          token: mockToken,
        },
      }),
    } as Response);

    renderLogin();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

    await waitFor(() => {
      expect(screen.getByText("Welcome back!")).toBeDefined();
    });

    expect(localStorage.getItem("flyby_token")).toBe(mockToken);
  });

  it("shows error on failed login", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid email or password" }),
    } as Response);

    renderLogin();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "wrong@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "wrongpass" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeDefined();
    });
  });
});
