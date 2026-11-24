import { describe, expect, it } from "vitest";
import {
  buildCashflows,
  computeIndependentIrrs,
  computeRow,
  computeRows,
  summarizeIndependent,
  summarizeOverall,
} from "./calc";
import { createDefaultState, type RowInput } from "./types";

function makeRows(spec: Record<number, Partial<RowInput>>): RowInput[] {
  const rows = createDefaultState().rows;
  for (const [year, patch] of Object.entries(spec)) {
    rows[Number(year)] = { ...rows[Number(year)], ...patch };
  }
  return rows;
}

/** 原有測試案例：t0..t2 = -10000，V5 = 60000，V10 = 100000 */
const baseline = () =>
  makeRows({
    0: { investment: "-10000" },
    1: { investment: "-10000" },
    2: { investment: "-10000" },
    5: { total: "60000" },
    10: { total: "100000" },
  });

function irrAt(rows: RowInput[], year: number): number | null {
  const cell = computeIndependentIrrs(computeRows(rows))[year];
  return cell.kind === "irr" ? cell.irr : null;
}

describe("原有基準案例（保留）", () => {
  it("第 5 年 IRR 約 18.63%，第 10 年 IRR 約 14.24%", () => {
    const rows = baseline();
    expect(irrAt(rows, 5)! * 100).toBeCloseTo(18.63, 2);
    expect(irrAt(rows, 10)! * 100).toBeCloseTo(14.24, 2);
  });

  it("現金流序列正確", () => {
    const calcs = computeRows(baseline());
    expect(buildCashflows(calcs, 5).flows).toEqual([-10000, -10000, -10000, 0, 0, 60000]);
    expect(buildCashflows(calcs, 10).flows).toEqual([-10000, -10000, -10000, 0, 0, 0, 0, 0, 0, 0, 100000]);
  });
});

describe("現金流淨額結算", () => {
  it("同年供款與退保價值在同一時間點淨額結算（50000 而非 60000）", () => {
    const rows = baseline();
    rows[5] = { ...rows[5], investment: "-10000", total: "60000" };
    const { flows } = buildCashflows(computeRows(rows), 5);
    expect(flows).toEqual([-10000, -10000, -10000, 0, 0, 50000]);
  });

  it("第 5 年的退保價值不會被當成第 10 年的實收現金", () => {
    const flows = buildCashflows(computeRows(baseline()), 10).flows!;
    expect(flows[5]).toBe(0);
    expect(flows.reduce((s, f) => s + f, 0)).toBe(100000 - 30000);
  });

  it("負數退保價值不再被推斷為供款", () => {
    const rows = makeRows({ 0: { investment: "-10000" }, 3: { total: "-5000" }, 5: { total: "20000" } });
    const flows = buildCashflows(computeRows(rows), 5).flows!;
    expect(flows).toEqual([-10000, 0, 0, 0, 0, 20000]);
  });
});

describe("隱藏年份不影響計算與時間軸", () => {
  it("隱藏中間年份後 IRR 與現金流完全不變", () => {
    const visible = baseline();
    const hidden = baseline().map((r, y) => (y > 0 && y < 10 ? { ...r, hidden: true } : r));
    expect(computeRows(hidden)).toEqual(computeRows(visible));
    expect(irrAt(hidden, 5)).toBe(irrAt(visible, 5));
    expect(irrAt(hidden, 10)).toBe(irrAt(visible, 10));
    expect(buildCashflows(computeRows(hidden), 5).flows).toHaveLength(6); // 第 5 年仍是 t=5
  });

  it("隱藏的供款年份仍按原年份參與計算", () => {
    const rows = baseline();
    rows[1] = { ...rows[1], hidden: true };
    expect(buildCashflows(computeRows(rows), 5).flows![1]).toBe(-10000);
  });
});

describe("第一頁：獨立 IRR 的連動", () => {
  it("修改早期供款後，所有相關年份的 IRR 都更新", () => {
    const before = baseline();
    const after = baseline();
    after[1] = { ...after[1], investment: "-20000" };
    expect(irrAt(after, 5)).not.toBe(irrAt(before, 5));
    expect(irrAt(after, 10)).not.toBe(irrAt(before, 10));
    expect(irrAt(after, 5)!).toBeLessThan(irrAt(before, 5)!);
    expect(irrAt(after, 10)!).toBeLessThan(irrAt(before, 10)!);
  });

  it("修改第 10 年供款不影響第 5 年 IRR", () => {
    const before = baseline();
    const after = baseline();
    after[10] = { ...after[10], investment: "-50000" };
    expect(irrAt(after, 5)).toBe(irrAt(before, 5));
    expect(irrAt(after, 10)).not.toBe(irrAt(before, 10));
  });

  it("沒有正數退保價值的年份是「—」，無法計算的是 N/A", () => {
    const cells = computeIndependentIrrs(computeRows(baseline()));
    expect(cells[3].kind).toBe("none");
    expect(cells[0].kind).toBe("none");
    const noInitial = computeIndependentIrrs(computeRows(makeRows({ 5: { total: "60000" } })));
    expect(noInitial[5].kind).toBe("na");
  });
});

describe("供款驗證", () => {
  it("正數供款令受影響的 IRR 顯示 N/A（不自動轉負）", () => {
    const rows = baseline();
    rows[3] = { ...rows[3], investment: "12500" };
    const cells = computeIndependentIrrs(computeRows(rows));
    expect(cells[5].kind).toBe("na");
    expect(cells[10].kind).toBe("na");
    expect(computeRow(3, rows[3]).cashOut).toBe(12500); // 未被轉換
  });

  it("正數供款只影響該年份及之後；較早年份不受影響", () => {
    const rows = baseline();
    rows[3] = { ...rows[3], investment: "12500" };
    rows[2] = { ...rows[2], total: "40000" };
    expect(irrAt(rows, 2)).not.toBeNull();
  });

  it("第 0 年空白、0 或正數都不是有效初始投資", () => {
    for (const investment of ["", "0", "10000"]) {
      const rows = makeRows({ 0: { investment }, 5: { total: "60000" } });
      expect(computeIndependentIrrs(computeRows(rows))[5].kind).toBe("na");
    }
  });

  it("空白供款當作 0，與明確輸入 0 結果相同但保留區別", () => {
    expect(computeRow(1, { ...baseline()[1], investment: "" }).investment).toBeNull();
    expect(computeRow(1, { ...baseline()[1], investment: "0" }).investment).toBe(0);
    expect(computeRow(1, { ...baseline()[1], investment: "" }).cashOut).toBe(0);
  });
});

describe("保證／非保證／總退保價值", () => {
  it("只輸入總退保價值也能計算", () => {
    expect(irrAt(baseline(), 5)).not.toBeNull();
    const c = computeRow(5, { investment: "", guaranteed: "", nonGuaranteed: "", total: "60000", hidden: false });
    expect(c.effectiveTotal).toBe(60000);
  });

  it("只輸入保證或非保證時自動合計，空白者視為 0 但佔比 N/A", () => {
    const onlyG = computeRow(5, { investment: "", guaranteed: "50000", nonGuaranteed: "", total: "", hidden: false });
    expect(onlyG.effectiveTotal).toBe(50000);
    expect(onlyG.guaranteedPct).toBe(1);
    expect(onlyG.nonGuaranteedPct).toBeNull(); // N/A
    expect(onlyG.totalPct).toBe(1);

    const onlyNg = computeRow(5, { investment: "", guaranteed: "", nonGuaranteed: "8000", total: "", hidden: false });
    expect(onlyNg.effectiveTotal).toBe(8000);
    expect(onlyNg.guaranteedPct).toBeNull();
    expect(onlyNg.nonGuaranteedPct).toBe(1);
  });

  it("手動總額優先，不一致只標示、不覆蓋；清除後恢復自動合計", () => {
    const manual = computeRow(5, { investment: "", guaranteed: "50000", nonGuaranteed: "10000", total: "70000", hidden: false });
    expect(manual.effectiveTotal).toBe(70000);
    expect(manual.mismatch).toBe(true);
    expect(manual.guaranteedPct).toBeCloseTo(50000 / 70000, 10);
    const cleared = computeRow(5, { investment: "", guaranteed: "50000", nonGuaranteed: "10000", total: "", hidden: false });
    expect(cleared.effectiveTotal).toBe(60000);
    expect(cleared.mismatch).toBe(false);
  });

  it("全部留空時保持空白（不變成 0），佔比 N/A", () => {
    const c = computeRow(5, { investment: "", guaranteed: "", nonGuaranteed: "", total: "", hidden: false });
    expect(c.effectiveTotal).toBeNull();
    expect(c.guaranteedPct).toBeNull();
    expect(c.nonGuaranteedPct).toBeNull();
    expect(c.totalPct).toBeNull();
  });

  it("分母為 0 時佔比 N/A；非零時總額佔比 100%", () => {
    const zero = computeRow(5, { investment: "", guaranteed: "0", nonGuaranteed: "0", total: "", hidden: false });
    expect(zero.guaranteedPct).toBeNull();
    expect(zero.totalPct).toBeNull();
    const nonZero = computeRow(5, { investment: "", guaranteed: "", nonGuaranteed: "", total: "123", hidden: false });
    expect(nonZero.totalPct).toBe(1);
  });

  it("仍允許負數價值（不當成供款）", () => {
    const c = computeRow(5, { investment: "", guaranteed: "-100", nonGuaranteed: "", total: "", hidden: false });
    expect(c.effectiveTotal).toBe(-100);
    expect(c.cashOut).toBe(0);
  });
});

describe("摘要", () => {
  it("第一頁摘要", () => {
    const calcs = computeRows(baseline());
    const s = summarizeIndependent(calcs, computeIndependentIrrs(calcs));
    expect(s.initialInvestment).toBe(-10000);
    expect(s.totalContribution).toBe(-30000);
    expect(s.latestYear).toBe(10);
    expect(s.latestIrr?.kind).toBe("irr");
  });

  it("第二頁摘要只統計到截止年份", () => {
    const rows = baseline();
    rows[12] = { ...rows[12], investment: "-99999" };
    const s = summarizeOverall(computeRows(rows), 10);
    expect(s.totalContribution).toBe(-30000);
    expect(s.surrenderValue).toBe(100000);
    expect(s.netReturn).toBe(70000);
    expect(s.multiple).toBeCloseTo(100000 / 30000, 10);
    expect(s.irr.irr! * 100).toBeCloseTo(14.24, 2);
  });

  it("截止年份沒有正數退保價值時 N/A 並附原因", () => {
    const s = summarizeOverall(computeRows(baseline()), 7);
    expect(s.irr.irr).toBeNull();
    expect(s.irr.reason).toContain("第 7 年");
  });
});
