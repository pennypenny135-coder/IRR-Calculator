// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { IrrCalculatorPage } from "./IrrCalculatorPage";
import { createDefaultState } from "@/lib/irr/types";
import { followLatestOverallValue, restoreOverallCutoff } from "@/lib/irr/overallCutoff";

const edit = (year: number, field: string, value: string) => {
  fireEvent.change(screen.getByLabelText(`第 ${year} 年 ${field}（HKD）`), { target: { value } });
};
const cutoff = () => (screen.getByLabelText("截止年份") as HTMLSelectElement).value;

beforeEach(() => window.localStorage.clear());

describe("overall latest positive valuation year", () => {
  it("updates all summary cards for years 8 and 9, then falls back after clearing year 9", async () => {
    render(<IrrCalculatorPage mode="overall" />);
    for (let year = 0; year <= 4; year++) edit(year, "投資金額／供款", "-12500");
    edit(8, "保證價值", "55631");
    edit(8, "非保證價值", "12813");
    expect(cutoff()).toBe("8");
    edit(9, "保證價值", "56360");
    edit(9, "非保證價值", "16563");
    expect(cutoff()).toBe("9");
    expect(screen.getByTestId("card-value-surrender").textContent).toBe("72,923");
    expect(screen.getByTestId("card-value-total-contribution").textContent).toBe("-62,500");
    expect(screen.getByTestId("card-value-net-return").textContent).toBe("10,423");
    expect(screen.getByTestId("card-value-overall-irr").textContent).toMatch(/^\d+\.\d{2}%$/);
    expect(screen.getByTestId("card-overall-irr").textContent).toContain("截止第 9 年");
    expect(screen.getByTestId("card-overall-irr").textContent).not.toContain("第 10 年沒有正數");
    edit(9, "保證價值", "");
    edit(9, "非保證價值", "");
    await waitFor(() => expect(cutoff()).toBe("8"));
    expect(screen.getByTestId("card-value-surrender").textContent).toBe("68,444");
  });

  it("keeps manual cutoff selection until another valuation edit", () => {
    render(<IrrCalculatorPage mode="overall" />);
    edit(0, "投資金額／供款", "-10000");
    edit(5, "總退保價值", "15000");
    edit(9, "總退保價值", "20000");
    fireEvent.change(screen.getByLabelText("截止年份"), { target: { value: "5" } });
    edit(1, "投資金額／供款", "-100");
    fireEvent.click(screen.getByLabelText("隱藏第 9 年"));
    expect(cutoff()).toBe("5");
    edit(8, "總退保價值", "18000");
    expect(cutoff()).toBe("9");
  });

  it("repairs a blank saved cutoff and respects manual total precedence", () => {
    const state = createDefaultState();
    state.cutoffYear = 10;
    state.rows[8].total = "68444";
    state.rows[9].guaranteed = "56360";
    state.rows[9].nonGuaranteed = "16563";
    state.rows[9].hidden = true;
    expect(restoreOverallCutoff(state).cutoffYear).toBe(9);
    state.rows[9].total = "0";
    expect(followLatestOverallValue(state).cutoffYear).toBe(8);
    state.rows[9].total = "-1";
    expect(followLatestOverallValue(state).cutoffYear).toBe(8);
    state.rows[9].total = "";
    expect(followLatestOverallValue(state).cutoffYear).toBe(9);
    state.cutoffYear = 8;
    expect(restoreOverallCutoff(state)).toBe(state);
  });

  it("leaves an empty page cutoff unchanged", () => {
    const state = createDefaultState();
    expect(followLatestOverallValue(state)).toBe(state);
    expect(restoreOverallCutoff(state)).toBe(state);
  });
});
