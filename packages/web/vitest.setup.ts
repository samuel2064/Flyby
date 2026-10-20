import { vi } from "vitest"

// Mock localStorage for jsdom
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
  key: vi.fn(),
  length: 0,
}
Object.defineProperty(global, "localStorage", {
  writable: true,
  value: localStorageMock,
})

// Mock matchMedia for jsdom
const mockMatchMedia = vi.fn().mockReturnValue(true)
Object.defineProperty(global, "matchMedia", {
  writable: true,
  value: mockMatchMedia,
})