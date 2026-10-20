import { describe, it, expect } from "vitest";
import { validateUUID, validateReportedAt, validateMinutes, validateHours, validateLineType, validateReportType, validateSource } from "../src/validation";

describe("validateUUID", () => {
  it("accepts valid standard UUID", () => {
    const result = validateUUID("123e4567-e89b-12d3-a456-426614174000");
    expect(result.valid).toBe(true);
    expect(result.id).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("accepts valid CUID", () => {
    const result = validateUUID("cABC123def456789012345678");
    expect(result.valid).toBe(true);
    expect(result.id).toBe("cABC123def456789012345678");
  });

  it("rejects invalid format", () => {
    const result = validateUUID("not-a-uuid");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid ID format");
  });

  it("rejects empty string", () => {
    const result = validateUUID("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid or missing ID");
  });

  it("rejects null", () => {
    const result = validateUUID(null as unknown as string);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid or missing ID");
  });

  it("rejects undefined", () => {
    const result = validateUUID(undefined as unknown as string);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid or missing ID");
  });
});

describe("validateReportedAt", () => {
  it("accepts valid ISO date string (recent, relative to now)", () => {
    const result = validateReportedAt(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    expect(result.valid).toBe(true);
    expect(result.date instanceof Date).toBe(true);
  });

  it("accepts a date just inside the 30-day window", () => {
    const result = validateReportedAt(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString());
    expect(result.valid).toBe(true);
  });

  it("rejects undefined", () => {
    const result = validateReportedAt(undefined as unknown);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("reportedAt is required");
  });

  it("rejects null", () => {
    const result = validateReportedAt(null as unknown);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("reportedAt is required");
  });

  it("rejects non-string", () => {
    const result = validateReportedAt(123 as unknown);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("reportedAt must be a valid ISO date string");
  });

  it("rejects future date (beyond 5 min skew)", () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = validateReportedAt(futureDate);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("reportedAt cannot be in the future");
  });

  it("rejects date older than 30 days", () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const result = validateReportedAt(oldDate);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("reportedAt cannot be older than 30 days");
  });
});

describe("validateMinutes", () => {
  it("accepts valid integer minutes", () => {
    const result = validateMinutes(15);
    expect(result.valid).toBe(true);
    expect(result.minutes).toBe(15);
  });

  it("accepts 0 minutes", () => {
    const result = validateMinutes(0);
    expect(result.valid).toBe(true);
    expect(result.minutes).toBe(0);
  });

  it("accepts 300 minutes (max)", () => {
    const result = validateMinutes(300);
    expect(result.valid).toBe(true);
    expect(result.minutes).toBe(300);
  });

  it("rejects negative minutes", () => {
    const result = validateMinutes(-1);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid wait time minutes (must be a whole number between 0-300)");
  });

  it("rejects minutes > 300", () => {
    const result = validateMinutes(301);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid wait time minutes (must be a whole number between 0-300)");
  });

  it("rejects float minutes", () => {
    const result = validateMinutes(15.5);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid wait time minutes (must be a whole number between 0-300)");
  });

  it("rejects non-number", () => {
    const result = validateMinutes("fifteen" as unknown as number);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid wait time minutes (must be a whole number between 0-300)");
  });
});

describe("validateHours", () => {
  it("accepts valid hours with default 24", () => {
    const result = validateHours(undefined as unknown);
    expect(result.valid).toBe(true);
    expect(result.hours).toBe(24);
  });

  it("accepts 1 hour", () => {
    const result = validateHours(1);
    expect(result.valid).toBe(true);
    expect(result.hours).toBe(1);
  });

  it("accepts 168 hours (max)", () => {
    const result = validateHours(168);
    expect(result.valid).toBe(true);
    expect(result.hours).toBe(168);
  });

  it("rejects 0 hours", () => {
    const result = validateHours(0);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("hours must be a positive integer between 1 and 168");
  });

  it("rejects 169 hours (over max)", () => {
    const result = validateHours(169);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("hours must be a positive integer between 1 and 168");
  });

  it("rejects negative hours", () => {
    const result = validateHours(-1);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("hours must be a positive integer between 1 and 168");
  });

  it("rejects non-integer hours", () => {
    const result = validateHours(24.5);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("hours must be a positive integer between 1 and 168");
  });
});

describe("validateLineType", () => {
  it("accepts valid lineType 'standard'", () => {
    const result = validateLineType("standard");
    expect(result.valid).toBe(true);
    expect(result.type).toBe("standard");
  });

  it("accepts valid lineType 'preclear'", () => {
    const result = validateLineType("preclear");
    expect(result.valid).toBe(true);
    expect(result.type).toBe("preclear");
  });

  it("accepts valid lineType 'clear'", () => {
    const result = validateLineType("clear");
    expect(result.valid).toBe(true);
    expect(result.type).toBe("clear");
  });

  it("rejects invalid lineType", () => {
    const result = validateLineType("invalid");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Must be one of");
  });

  it("rejects undefined", () => {
    const result = validateLineType(undefined as unknown as string);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Must be one of");
  });

  it("rejects null", () => {
    const result = validateLineType(null as unknown as string);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Must be one of");
  });
});

describe("validateReportType", () => {
  it("accepts valid reportType 'standard'", () => {
    const result = validateReportType("standard");
    expect(result.valid).toBe(true);
    expect(result.type).toBe("standard");
  });

  it("accepts valid reportType 'preclear'", () => {
    const result = validateReportType("preclear");
    expect(result.valid).toBe(true);
    expect(result.type).toBe("preclear");
  });

  it("accepts valid reportType 'clear'", () => {
    const result = validateReportType("clear");
    expect(result.valid).toBe(true);
    expect(result.type).toBe("clear");
  });

  it("rejects invalid reportType", () => {
    const result = validateReportType("invalid");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Must be one of");
  });
});

describe("validateSource", () => {
  it("accepts valid source 'crowd'", () => {
    const result = validateSource("crowd");
    expect(result.valid).toBe(true);
    expect(result.source).toBe("crowd");
  });

  it("accepts valid source 'official'", () => {
    const result = validateSource("official");
    expect(result.valid).toBe(true);
    expect(result.source).toBe("official");
  });

  it("defaults invalid source to crowd", () => {
    const result = validateSource("invalid");
    expect(result.valid).toBe(true);
    expect(result.source).toBe("crowd");
  });
});