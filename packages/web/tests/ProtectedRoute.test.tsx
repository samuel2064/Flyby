import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestBrowserRouter } from "./testRouter";
import ProtectedRoute from "../src/components/ProtectedRoute";
import { useAuth } from "../src/contexts/AuthContext";

vi.mock("../src/contexts/AuthContext");

const renderProtectedRoute = (children: React.ReactNode) =>
  render(
    <TestBrowserRouter>
      <ProtectedRoute>{children}</ProtectedRoute>
    </TestBrowserRouter>
  );

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ProtectedRoute", () => {
  it("shows loading spinner while auth is loading", () => {
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: null, isLoading: true });

    renderProtectedRoute(<div>Protected Content</div>);

    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
    expect(screen.queryByText("Protected Content")).toBeFalsy();
  });

  it("redirects to login when user is not authenticated", () => {
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: null, isLoading: false });

    renderProtectedRoute(<div>Protected Content</div>);

    // Navigate component should redirect, so protected content shouldn't render
    expect(screen.queryByText("Protected Content")).toBeFalsy();
  });

  it("renders children when user is authenticated", () => {
    const mockUser = { displayName: "Test User", email: "test@example.com" };
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: mockUser, isLoading: false });

    renderProtectedRoute(<div>Protected Content</div>);

    expect(screen.getByText("Protected Content")).toBeTruthy();
  });

  it("renders complex children when authenticated", () => {
    const mockUser = { displayName: "Test User", email: "test@example.com" };
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: mockUser, isLoading: false });

    renderProtectedRoute(
      <div>
        <h1>Dashboard</h1>
        <p>Welcome back!</p>
      </div>
    );

    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("Welcome back!")).toBeTruthy();
  });
});