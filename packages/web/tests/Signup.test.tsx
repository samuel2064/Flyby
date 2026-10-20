import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestBrowserRouter } from "./testRouter";
import { AuthProvider } from "../src/contexts/AuthContext";
import Signup from "../src/pages/Signup";

const renderSignup = () =>
  render(
    <TestBrowserRouter>
      <AuthProvider>
        <Signup />
      </AuthProvider>
    </TestBrowserRouter>
  );

describe("Signup page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders signup form", () => {
    renderSignup();
    expect(screen.getByText("Create your Flyby account")).toBeDefined();
    expect(screen.getByPlaceholderText("Traveler One")).toBeDefined();
    expect(screen.getByPlaceholderText("you@example.com")).toBeDefined();
    expect(screen.getByPlaceholderText("••••••••")).toBeDefined();
  });

  it("signs up successfully and shows welcome message", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          user: { id: "user-456", email: "new@example.com", displayName: "New User" },
          token: "mock.token.here",
        },
      }),
    } as Response);

    renderSignup();

    fireEvent.change(screen.getByPlaceholderText("Traveler One"), {
      target: { value: "New User" },
    });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Sign up/i }));

    await waitFor(() => {
      expect(screen.getByText("Welcome to Flyby!")).toBeDefined();
    });

    expect(localStorage.getItem("flyby_token")).toBe("mock.token.here");
  });

  it("shows error on failed signup", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "Email already registered" }),
    } as Response);

    renderSignup();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "existing@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Sign up/i }));

    await waitFor(() => {
      expect(screen.getByText("Email already registered")).toBeDefined();
    });
  });
});
