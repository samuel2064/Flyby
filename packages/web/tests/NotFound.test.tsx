import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NotFound from "../src/pages/NotFound";

describe("NotFound page", () => {
  it("renders 404 message", async () => {
    render(
      <MemoryRouter initialEntries={["/nonexistent"]}>
        <Routes>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("404")).toBeDefined();
      expect(screen.getByText("Page not found")).toBeDefined();
      expect(screen.getByText(/The page you're looking for/)).toBeDefined();
    });
  });

  it("includes a link back to home", async () => {
    render(
      <MemoryRouter initialEntries={["/nonexistent"]}>
        <Routes>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const link = screen.getByText("Go back home");
      expect(link).toBeDefined();
      expect(link.getAttribute("href")).toBe("/");
    });
  });
});
