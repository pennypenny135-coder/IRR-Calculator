import { computeRows } from "./calc";
import type { PageState } from "./types";

/** Keep original year indices, including hidden years. */
export function followLatestOverallValue(state: PageState): PageState {
  const calcs = computeRows(state.rows);
  for (let year = calcs.length - 1; year >= 1; year--) {
    const value = calcs[year].effectiveTotal;
    if (value !== null && value > 0) {
      return year === state.cutoffYear ? state : { ...state, cutoffYear: year };
    }
  }
  return state;
}

/** Preserve a manually selected valid valuation year on reload. */
export function restoreOverallCutoff(state: PageState): PageState {
  const value = computeRows(state.rows)[state.cutoffYear]?.effectiveTotal;
  return value !== null && value !== undefined && value > 0
    ? state
    : followLatestOverallValue(state);
}
