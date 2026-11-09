import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "../src/components/FilterBar";

describe("FilterBar", () => {
  it("renders terminal filter chips", () => {
    render(
      <FilterBar
        terminals={["A", "B"]}
        selectedTerminals={["A"]}
        onTerminalChange={vi.fn()}
        timeRanges={[{ label: "1h", value: "1h" }]}
        selectedTimeRange="1h"
        onTimeRangeChange={vi.fn()}
        showAlertsOnly={false}
        onToggleAlerts={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "A" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "B" })).toBeTruthy();
  });

  it("highlights active terminal chip", () => {
    render(
      <FilterBar
        terminals={["A"]}
        selectedTerminals={["A"]}
        onTerminalChange={vi.fn()}
        timeRanges={[]}
        selectedTimeRange="1h"
        onTimeRangeChange={vi.fn()}
        showAlertsOnly={false}
        onToggleAlerts={vi.fn()}
      />,
    );
    const chip = screen.getByRole("checkbox", { name: "A" });
    expect(chip.className).toContain("bg-brand-600");
    expect(chip.getAttribute("aria-checked")).toBe("true");
  });

  it("toggles terminal selection on click", () => {
    const onTerminalChange = vi.fn();
    render(
      <FilterBar
        terminals={["A"]}
        selectedTerminals={[]}
        onTerminalChange={onTerminalChange}
        timeRanges={[]}
        selectedTimeRange="1h"
        onTimeRangeChange={vi.fn()}
        showAlertsOnly={false}
        onToggleAlerts={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "A" }));
    expect(onTerminalChange).toHaveBeenCalledWith(["A"]);
  });

  it("renders time range select", () => {
    render(
      <FilterBar
        terminals={[]}
        selectedTerminals={[]}
        onTerminalChange={vi.fn()}
        timeRanges={[{ label: "1 Hour", value: "1h" }, { label: "24 Hours", value: "24h" }]}
        selectedTimeRange="1h"
        onTimeRangeChange={vi.fn()}
        showAlertsOnly={false}
        onToggleAlerts={vi.fn()}
      />,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("1h");
  });

  it("calls onTimeRangeChange when select changes", () => {
    const onTimeRangeChange = vi.fn();
    render(
      <FilterBar
        terminals={[]}
        selectedTerminals={[]}
        onTerminalChange={vi.fn()}
        timeRanges={[
          { label: "1h", value: "1h" },
          { label: "24h", value: "24h" },
        ]}
        selectedTimeRange="1h"
        onTimeRangeChange={onTimeRangeChange}
        showAlertsOnly={false}
        onToggleAlerts={vi.fn()}
      />,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "24h" } });
    expect(onTimeRangeChange).toHaveBeenCalledWith("24h");
  });

  it("renders alerts-only checkbox", () => {
    const onToggleAlerts = vi.fn();
    render(
      <FilterBar
        terminals={[]}
        selectedTerminals={[]}
        onTerminalChange={vi.fn()}
        timeRanges={[]}
        selectedTimeRange="1h"
        onTimeRangeChange={vi.fn()}
        showAlertsOnly={true}
        onToggleAlerts={onToggleAlerts}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: /alerts only/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onToggleAlerts).toHaveBeenCalledWith(false);
  });

  it("applies opacity when isLoading", () => {
    render(
      <FilterBar
        terminals={[]}
        selectedTerminals={[]}
        onTerminalChange={vi.fn()}
        timeRanges={[]}
        selectedTimeRange="1h"
        onTimeRangeChange={vi.fn()}
        showAlertsOnly={false}
        onToggleAlerts={vi.fn()}
        isLoading
      />,
    );
    const outer = document.querySelector("div.space-x-3");
    expect(outer?.className).toContain("opacity-70");
  });
});
