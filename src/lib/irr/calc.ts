import { parseAmount } from "./format";
import { MAX_YEAR, type RowInput } from "./types";

export type InvestmentStatus = "blank" | "negative" | "zero" | "positive" | "invalid";

export interface RowCalc {
  year: number;
  /** 供款原始數值；空白 = null */
  investment: number | null;
  investmentStatus: InvestmentStatus;
  /** 參與現金流的供款 C[y]（空白 = 0；有誤的值亦 = 0，但 IRR 會被擋下） */
  cashOut: number;
  guaranteed: number | null;
  nonGuaranteed: number | null;
  manualTotal: number | null;
  /** 保證／非保證有任何一項輸入時的自動合計（未輸入者視為 0） */
  autoTotal: number | null;
  /** 有效總退保價值 V[y]；全部留空 = null */
  effectiveTotal: number | null;
  totalIsManual: boolean;
  /** 手動總額與已輸入組成項合計不一致 */
  mismatch: boolean;
  /** 任一價值欄位含無效數字（例如只輸入了「-」） */
  hasInvalidValue: boolean;
  guaranteedPct: number | null;
  nonGuaranteedPct: number | null;
  totalPct: number | null;
}

export function computeRow(year: number, row: RowInput): RowCalc {
  const inv = parseAmount(row.investment);
  const g = parseAmount(row.guaranteed);
  const ng = parseAmount(row.nonGuaranteed);
  const t = parseAmount(row.total);

  let investmentStatus: InvestmentStatus;
  if (inv.state === "blank") investmentStatus = "blank";
  else if (inv.state === "invalid") investmentStatus = "invalid";
  else if (inv.value < 0) investmentStatus = "negative";
  else if (inv.value === 0) investmentStatus = "zero";
  else investmentStatus = "positive";

  const guaranteed = g.value;
  const nonGuaranteed = ng.value;
  const manualTotal = t.value;
  const componentsEntered = guaranteed !== null || nonGuaranteed !== null;
  const autoTotal = componentsEntered ? (guaranteed ?? 0) + (nonGuaranteed ?? 0) : null;

  const totalIsManual = manualTotal !== null;
  const effectiveTotal = totalIsManual ? manualTotal : autoTotal;
  const mismatch = totalIsManual && componentsEntered && manualTotal !== autoTotal;

  const denominator = effectiveTotal !== null && effectiveTotal !== 0 ? effectiveTotal : null;
  const pct = (part: number | null): number | null =>
    part !== null && denominator !== null ? part / denominator : null;

  return {
    year,
    investment: inv.value,
    investmentStatus,
    cashOut: inv.value ?? 0,
    guaranteed,
    nonGuaranteed,
    manualTotal,
    autoTotal,
    effectiveTotal,
    totalIsManual,
    mismatch,
    hasInvalidValue: g.state === "invalid" || ng.state === "invalid" || t.state === "invalid",
    guaranteedPct: pct(guaranteed),
    nonGuaranteedPct: pct(nonGuaranteed),
    totalPct: denominator !== null ? 1 : null,
  };
}

/** 一律以完整 0–30 年計算；隱藏狀態不會進入這裡，所以不可能壓縮時間軸。 */
export function computeRows(rows: RowInput[]): RowCalc[] {
  return rows.map((row, year) => computeRow(year, row));
}

/** 供款欄位的提示／錯誤文字；沒有問題回傳 null。 */
export function investmentIssue(calc: RowCalc): string | null {
  if (calc.investmentStatus === "invalid") return "請輸入有效數字";
  if (calc.year === 0) {
    return calc.investmentStatus === "negative" ? null : "初始投資應為負數";
  }
  if (calc.investmentStatus === "positive") return "供款請輸入負數，例如 -12500";
  return null;
}

export interface CashflowResult {
  flows: number[] | null;
  reason: string | null;
}

/**
 * 建立截止年份 N 的年度現金流（t = 0..N）：
 *   y < N : C[y]
 *   y = N : C[N] + V[N]
 * 其他年份的退保價值絕不加入。
 */
export function buildCashflows(calcs: RowCalc[], cutoff: number): CashflowResult {
  const end = calcs[cutoff];
  if (!end || cutoff < 1 || cutoff > MAX_YEAR) {
    return { flows: null, reason: "截止年份必須介於 1–30" };
  }
  const value = end.effectiveTotal;
  if (value === null || value <= 0) {
    return { flows: null, reason: `第 ${cutoff} 年沒有正數總退保價值` };
  }

  for (let y = 0; y <= cutoff; y++) {
    const c = calcs[y];
    if (c.investmentStatus === "invalid") {
      return { flows: null, reason: `第 ${y} 年供款不是有效數字` };
    }
    if (y > 0 && c.investmentStatus === "positive") {
      return { flows: null, reason: `第 ${y} 年供款為正數，請改為負數（例如 -12500）` };
    }
  }
  if (calcs[0].investmentStatus !== "negative") {
    return { flows: null, reason: "尚未有有效初始投資（第 0 年應為負數）" };
  }

  const flows: number[] = [];
  for (let y = 0; y < cutoff; y++) flows.push(calcs[y].cashOut);
  flows.push(calcs[cutoff].cashOut + value);
  return { flows, reason: null };
}

function npv(flows: number[], x: number): number {
  // x = 1 + r
  let sum = 0;
  for (let t = 0; t < flows.length; t++) sum += flows[t] / Math.pow(x, t);
  return sum;
}

/** 年度 IRR（非 XIRR）。無解或現金流不含正負兩個方向時回傳 null。 */
export function solveIrr(flows: number[]): number | null {
  if (!flows.some((f) => f < 0) || !flows.some((f) => f > 0)) return null;

  const STEPS = 800;
  const lo = Math.log(0.001);
  const hi = Math.log(1001);
  let best: number | null = null;

  let prevX = Math.exp(lo);
  let prevV = npv(flows, prevX);
  for (let i = 1; i <= STEPS; i++) {
    const x = Math.exp(lo + ((hi - lo) * i) / STEPS);
    const v = npv(flows, x);
    if (prevV === 0 || (prevV < 0) !== (v < 0) || v === 0) {
      let a = prevX;
      let b = x;
      let fa = prevV;
      if (fa !== 0) {
        for (let k = 0; k < 200; k++) {
          const m = (a + b) / 2;
          const fm = npv(flows, m);
          if (fm === 0) {
            a = b = m;
            break;
          }
          if ((fa < 0) === (fm < 0)) {
            a = m;
            fa = fm;
          } else {
            b = m;
          }
          if (b - a < 1e-14) break;
        }
      } else {
        b = a;
      }
      const root = (a + b) / 2 - 1;
      if (best === null || Math.abs(root) < Math.abs(best)) best = root;
    }
    prevX = x;
    prevV = v;
  }
  return best;
}

export interface IrrResult {
  irr: number | null;
  reason: string | null;
  flows: number[] | null;
}

export function computeIrrForYear(calcs: RowCalc[], cutoff: number): IrrResult {
  const built = buildCashflows(calcs, cutoff);
  if (!built.flows) return { irr: null, reason: built.reason, flows: null };
  const irr = solveIrr(built.flows);
  if (irr === null) {
    return { irr: null, reason: "現金流不足以計算 IRR", flows: built.flows };
  }
  return { irr, reason: null, flows: built.flows };
}

export type IndependentCell =
  | { kind: "none" } // 沒有正數退保價值 → 顯示「—」
  | { kind: "na"; reason: string }
  | { kind: "irr"; irr: number };

/** 第一頁：每個有正數總退保價值的年份各自獨立計算。 */
export function computeIndependentIrrs(calcs: RowCalc[]): IndependentCell[] {
  return calcs.map((c, y) => {
    if (y === 0) return { kind: "none" };
    const v = c.effectiveTotal;
    if (v === null || v <= 0) return { kind: "none" };
    const res = computeIrrForYear(calcs, y);
    if (res.irr === null) return { kind: "na", reason: res.reason ?? "N/A" };
    return { kind: "irr", irr: res.irr };
  });
}

export interface IndependentSummary {
  initialInvestment: number | null;
  totalContribution: number;
  latestYear: number | null;
  latestIrr: IndependentCell | null;
}

export function summarizeIndependent(calcs: RowCalc[], cells: IndependentCell[]): IndependentSummary {
  let latestYear: number | null = null;
  for (let y = MAX_YEAR; y >= 1; y--) {
    const v = calcs[y].effectiveTotal;
    if (v !== null && v > 0) {
      latestYear = y;
      break;
    }
  }
  return {
    initialInvestment: calcs[0].investment,
    totalContribution: calcs.reduce((s, c) => s + c.cashOut, 0),
    latestYear,
    latestIrr: latestYear !== null ? cells[latestYear] : null,
  };
}

export interface OverallSummary {
  totalContribution: number;
  surrenderValue: number | null;
  netReturn: number | null;
  multiple: number | null;
  irr: IrrResult;
}

/** 第二頁：只統計第 0 年至截止年份。 */
export function summarizeOverall(calcs: RowCalc[], cutoff: number): OverallSummary {
  let totalContribution = 0;
  for (let y = 0; y <= cutoff; y++) totalContribution += calcs[y].cashOut;
  const surrenderValue = calcs[cutoff]?.effectiveTotal ?? null;
  const netReturn = surrenderValue !== null ? surrenderValue + totalContribution : null;
  const multiple =
    surrenderValue !== null && totalContribution !== 0
      ? surrenderValue / Math.abs(totalContribution)
      : null;
  return {
    totalContribution,
    surrenderValue,
    netReturn,
    multiple,
    irr: computeIrrForYear(calcs, cutoff),
  };
}
