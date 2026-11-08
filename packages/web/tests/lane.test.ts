import { describe, it, expect } from "vitest";
import { isLaneType, laneLabel, laneBadgeClass } from "../src/lib/lane";

// Lane discriminator display helpers (TIR-367): the stored reportType
// vocabulary is standard | preclear | clear; the UI shows traveler-facing
// labels and never renders the raw string, and standard lanes get no badge
// (the absence IS the standard signal).

describe("isLaneType", () => {
  it("accepts exactly the documented vocabulary", () => {
    expect(isLaneType("standard")).toBe(true);
    expect(isLaneType("preclear")).toBe(true);
    expect(isLaneType("clear")).toBe(true);
  });

  it("rejects everything else, including near-misses and legacy spellings", () => {
    expect(isLaneType("precheck")).toBe(false);
    expect(isLaneType("Standard")).toBe(false);
    expect(isLaneType("")).toBe(false);
    expect(isLaneType(null)).toBe(false);
    expect(isLaneType(undefined)).toBe(false);
    expect(isLaneType(42)).toBe(false);
  });
});

describe("laneLabel", () => {
  it("maps expedited lanes to their traveler-facing labels", () => {
    expect(laneLabel("preclear")).toBe("TSA PreCheck");
    expect(laneLabel("clear")).toBe("CLEAR");
  });

  it("returns null for standard/unspecified lanes (no badge)", () => {
    expect(laneLabel("standard")).toBeNull();
    expect(laneLabel(null)).toBeNull();
    expect(laneLabel(undefined)).toBeNull();
    expect(laneLabel("garbage")).toBeNull();
  });
});

describe("laneBadgeClass", () => {
  it("gives each expedited lane a distinct hue", () => {
    const preclear = laneBadgeClass("preclear");
    const clear = laneBadgeClass("clear");
    expect(preclear).not.toBe(clear);
    expect(preclear).toContain("sky");
    expect(clear).toContain("violet");
  });

  it("has an AA-safe neutral fallback for standard/unspecified", () => {
    const fallback = laneBadgeClass("standard");
    expect(fallback).toContain("slate");
    expect(laneBadgeClass(null)).toBe(fallback);
    expect(laneBadgeClass(undefined)).toBe(fallback);
  });
});
