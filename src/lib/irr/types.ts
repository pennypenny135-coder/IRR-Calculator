export const MIN_YEAR = 0;
export const MAX_YEAR = 30;
export const DEFAULT_CUTOFF_YEAR = 10;

export type CalculatorMode = "independent" | "overall";

/** 兩頁各自使用獨立的 localStorage key，不可共用。 */
export const STORAGE_KEYS: Record<CalculatorMode, string> = {
  independent: "irr_calculator_independent_v2",
  overall: "irr_calculator_overall_v2",
};

/** 只有主題設定全站共用。 */
export const THEME_KEY = "irr_calculator_theme";

/**
 * 單一年份的原始輸入。全部用字串保存，這樣才能區分「空白」與「0」。
 * total 有值 = 手動總額；total 空白 = 自動合計。
 */
export interface RowInput {
  investment: string;
  guaranteed: string;
  nonGuaranteed: string;
  total: string;
  hidden: boolean;
}

export interface PageState {
  rows: RowInput[]; // 長度固定 31（第 0–30 年）
  cutoffYear: number; // 只有整體 IRR 頁使用
}

export function createEmptyRow(): RowInput {
  return { investment: "", guaranteed: "", nonGuaranteed: "", total: "", hidden: false };
}

export function createDefaultState(): PageState {
  return {
    rows: Array.from({ length: MAX_YEAR + 1 }, createEmptyRow),
    cutoffYear: DEFAULT_CUTOFF_YEAR,
  };
}
