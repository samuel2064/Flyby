import { describe, expect, it } from "vitest";
import seedAirports from "../prisma/seed/airports.json" with { type: "json" };

// TIR-339 M3: the seed file is the canonical airport reference. It was
// reconciled (2026-11-06) to the deploy repo's data/airports.json - same
// order, same public names - because fresh monorepo deploys (staging, then
// the cutover target) seed from this file and must byte-match prod.
describe("seed airports.json deploy-contract parity", () => {
  it("has the canonical airport count and deploy data-file order", () => {
    expect(seedAirports).toHaveLength(51);
    const codes = (seedAirports as Array<{ code: string }>).map((a) => a.code);
    // Deploy data file leads with the launch hubs in this exact order.
    expect(codes.slice(0, 8)).toEqual(["JFK", "SEA", "LAX", "ORD", "SFO", "ATL", "DFW", "DEN"]);
  });

  it("uses deploy public names (no ' Airport' suffix)", () => {
    for (const a of seedAirports as Array<{ code: string; name: string }>) {
      expect(a.name, `${a.code} name`).not.toMatch(/ Airport$/);
    }
    expect(seedAirports.find((a) => a.code === "JFK")?.name).toBe("John F. Kennedy International");
  });

  it("keeps the monorepo-only geo fields the schema requires", () => {
    for (const a of seedAirports as Array<Record<string, unknown>>) {
      expect(a.city, `${a.code} city`).toBeTruthy();
      expect(a.country, `${a.code} country`).toBeTruthy();
      expect(a.timezone, `${a.code} timezone`).toBeTruthy();
    }
  });
});
