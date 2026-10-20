import React from "react";
import { BrowserRouter, MemoryRouter } from "react-router-dom";

/** BrowserRouter for tests (React Router v7 — v7 behaviors are default). */
export function TestBrowserRouter({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

/** MemoryRouter for tests (React Router v7 — v7 behaviors are default). */
export function TestMemoryRouter({
  children,
  initialEntries,
}: {
  children: React.ReactNode;
  initialEntries?: string[];
}) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      {children}
    </MemoryRouter>
  );
}
