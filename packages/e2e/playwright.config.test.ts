import { beforeEach, describe, expect, it, vi } from "vitest";

type WebServerEntry = {
  env?: Record<string, string | undefined>;
  url?: string;
};

type PlaywrightConfig = {
  use?: { baseURL?: string };
  webServer?: WebServerEntry[];
};

async function loadConfig(): Promise<PlaywrightConfig> {
  vi.resetModules();
  const mod = (await import("./playwright.config")) as {
    default: PlaywrightConfig;
  };
  return mod.default;
}

describe("playwright.config port flexibility", () => {
  beforeEach(() => {
    delete process.env.E2E_API_PORT;
    delete process.env.E2E_WEB_PORT;
  });

  it("defaults to API 3001 / web 3000 when no env vars are set", async () => {
    const config = await loadConfig();

    expect(config.use?.baseURL).toBe("http://localhost:3000");
    expect(config.webServer?.[0]?.env?.PORT).toBe("3001");
    expect(config.webServer?.[0]?.url).toBe("http://localhost:3001/health");
    expect(config.webServer?.[1]?.env?.PORT).toBe("3000");
    expect(config.webServer?.[1]?.url).toBe("http://localhost:3000");
  });

  it("honors E2E_API_PORT / E2E_WEB_PORT overrides end to end", async () => {
    process.env.E2E_API_PORT = "3199";
    process.env.E2E_WEB_PORT = "3299";

    const config = await loadConfig();

    expect(config.use?.baseURL).toBe("http://localhost:3299");
    expect(config.webServer?.[0]?.env?.PORT).toBe("3199");
    expect(config.webServer?.[0]?.url).toBe("http://localhost:3199/health");
    expect(config.webServer?.[1]?.env?.PORT).toBe("3299");
    expect(config.webServer?.[1]?.env?.E2E_API_PORT).toBe("3199");
    expect(config.webServer?.[1]?.env?.E2E_WEB_PORT).toBe("3299");
    expect(config.webServer?.[1]?.url).toBe("http://localhost:3299");
  });
});
