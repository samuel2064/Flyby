import { windowAverage } from "../src/waitStats";

declare global {
  var expect: any;
}

describe("windowAverage", () => {
  it("returns null for empty array", () => {
    expect(windowAverage([])).toBeNull();
  });
  it("calculates average for single element", () => {
    expect(windowAverage([10])).toBe(10);
  });
  it("rounds to one decimal", () => {
    // average of [10, 11] = 10.5
    expect(windowAverage([10, 11])).toBeCloseTo(10.5, 1);
  });
});
