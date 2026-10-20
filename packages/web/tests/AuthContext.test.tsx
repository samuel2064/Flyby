import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { AuthProvider, useAuth } from "../src/contexts/AuthContext";

function TestComponent() {
  const { user, token, login, logout, isLoading } = useAuth();
  return (
    <div>
      {isLoading && <p>Loading</p>}
      {user ? (
        <>
          <p data-testid="user-email">{user.email}</p>
          <p data-testid="user-name">{user.displayName || "No name"}</p>
          <p data-testid="token">{token}</p>
          <button onClick={logout}>Log out</button>
        </>
      ) : (
        <>
          <p>Not logged in</p>
          <button
            onClick={() =>
              login("mock.token.123", {
                id: "user-123",
                email: "test@example.com",
                displayName: "Test User",
              })
            }
          >
            Log in
          </button>
        </>
      )}
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("initializes without user", () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    expect(screen.getByText("Not logged in")).toBeDefined();
  });

  it("restores user from localStorage on mount", () => {
    localStorage.setItem("flyby_token", "stored.token");
    localStorage.setItem(
      "flyby_user",
      JSON.stringify({ id: "u-1", email: "stored@example.com", displayName: "Stored User" })
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId("user-email").textContent).toBe("stored@example.com");
    expect(screen.getByTestId("token").textContent).toBe("stored.token");
  });

  it("handles malformed localStorage gracefully", () => {
    localStorage.setItem("flyby_token", "bad");
    localStorage.setItem("flyby_user", "not-json");

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByText("Not logged in")).toBeDefined();
    expect(localStorage.getItem("flyby_token")).toBeNull();
  });

  it("logs in and persists to localStorage", async () => {
    let setTokenValue: string | null = null;
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      if (key === "flyby_token") setTokenValue = value;
      originalSetItem(key, value);
    };

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

    await waitFor(() => {
      expect(screen.getByTestId("user-email")).toBeDefined();
    });

    expect(screen.getByTestId("user-email").textContent).toBe("test@example.com");
    expect(screen.getByTestId("user-name").textContent).toBe("Test User");
    expect(localStorage.getItem("flyby_token")).toBe("mock.token.123");

    localStorage.setItem = originalSetItem;
  });

  it("logs out and clears localStorage", async () => {
    localStorage.setItem("flyby_token", "token");
    localStorage.setItem("flyby_user", JSON.stringify({ id: "u-1", email: "a@b.com" }));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /Log out/i }));

    await waitFor(() => {
      expect(screen.getByText("Not logged in")).toBeDefined();
    });

    expect(localStorage.getItem("flyby_token")).toBeNull();
    expect(localStorage.getItem("flyby_user")).toBeNull();
  });
});
