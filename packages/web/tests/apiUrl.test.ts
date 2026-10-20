import { describe, it, expect, afterEach } from "vitest";
import { apiUrl } from "../src/lib/apiUrl";

describe("apiUrl", () => {
  const originalEnv: string = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

  afterEach(() => {
    // Restore the baked-in env value so other tests observe build defaults.
    import.meta.env.VITE_API_BASE_URL = originalEnv;
  });

  it("keeps relative paths untouched when no base URL is configured", () => {
    // import.meta.env stringifies assigned values, so "unset" must be '' (undefined would become the literal string "undefined").
    import.meta.env.VITE_API_BASE_URL = '';
    expect(apiUrl("/api/checkpoints")).toBe("/api/checkpoints");
    expect(apiUrl("/v1/auth/login")).toBe("/v1/auth/login");
  });

  it("prefixes the base URL when configured", () => {
    import.meta.env.VITE_API_BASE_URL = "https://api.example.com";
    expect(apiUrl("/api/checkpoints")).toBe("https://api.example.com/api/checkpoints");
    expect(apiUrl("/v1/auth/login")).toBe("https://api.example.com/v1/auth/login");
  });

  it("strips trailing slashes from the configured base", () => {
    import.meta.env.VITE_API_BASE_URL = "https://api.example.com/";
    expect(apiUrl("/api/health")).toBe("https://api.example.com/api/health");
  });

  it("adds a leading slash for path-less segments", () => {
    import.meta.env.VITE_API_BASE_URL = "https://api.example.com";
    expect(apiUrl("api/health")).toBe("https://api.example.com/api/health");
  });

  it("never rewrites absolute URLs", () => {
    import.meta.env.VITE_API_BASE_URL = "https://api.example.com";
    expect(apiUrl("https://other.example.com/api")).toBe("https://other.example.com/api");
    expect(apiUrl("//cdn.example.com/x")).toBe("//cdn.example.com/x");
  });

  it("never rewrites data: URLs", () => {
    import.meta.env.VITE_API_BASE_URL = "https://api.example.com";
    expect(apiUrl("data:text/plain,hi")).toBe("data:text/plain,hi");
  });
});
