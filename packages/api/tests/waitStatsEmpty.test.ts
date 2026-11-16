import { computeWaitStats } from "../src/waitStats";

describe("computeWaitStats with empty input", () => {
  it("returns null stats when no reports", () => {
    const result = computeWaitStats("UTC", []);
    expect(result.sampleSize).toBe(0);
    expect(result.overall.averageMinutes).toBeNull();
    expect(result.byHourOfDay.every((h) => h.averageMinutes === null)).toBe(true);
    expect(result.byDayOfWeek.every((d) => d.averageMinutes === null)).toBe(true);
  });
});
