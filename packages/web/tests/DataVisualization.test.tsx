import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataVisualization } from "../src/components/DataVisualization";

describe("DataVisualization", () => {
  it("renders skeleton when data is empty", () => {
    render(<DataVisualization type="bar" data={[]} />);
    const el = document.querySelector("div.animate-pulse");
    expect(el).toBeTruthy();
  });

  it("renders stat type with latest value", () => {
    const data = [{ label: "Wait", value: 15 }, { label: "Wait", value: 20 }];
    render(<DataVisualization type="stat" data={data} showLabels />);
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("Wait")).toBeTruthy();
  });

  it("renders stat type without labels when showLabels is false", () => {
    const data = [{ label: "Wait", value: 15 }];
    render(<DataVisualization type="stat" data={data} showLabels={false} />);
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.queryByText("Wait")).toBeNull();
  });

  it("renders line type with placeholder", () => {
    render(<DataVisualization type="line" data={[{ x: 1, y: 2 }]} />);
    const el = document.querySelector("p");
    expect(el?.textContent).toContain("line chart visualization");
  });

  it("renders pie type with placeholder", () => {
    render(<DataVisualization type="pie" data={[{ x: 1, y: 2 }]} />);
    const el = document.querySelector("p");
    expect(el?.textContent).toContain("pie chart visualization");
  });

  it("applies custom width and height", () => {
    render(<DataVisualization data={[{ v: 1 }]} width={400} height={300} />);
    const divWithStyle = document.querySelector("div[style]");
    expect(divWithStyle?.getAttribute("style")).toContain("400px");
    expect(divWithStyle?.getAttribute("style")).toContain("300px");
  });
});
