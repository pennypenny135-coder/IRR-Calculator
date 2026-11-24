import { parseAmount } from "./format";
import {
  DEFAULT_CUTOFF_YEAR,
  MAX_YEAR,
  createDefaultState,
  createEmptyRow,
  type PageState,
  type RowInput,
} from "./types";

interface StoredPayload {
  version: 2;
  rows: RowInput[];
  cutoffYear: number;
  savedAt: string;
}

function cleanAmount(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return parseAmount(s).state === "valid" ? s : "";
}

function cleanRow(v: unknown, year: number): RowInput {
  const base = createEmptyRow();
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  return {
    investment: cleanAmount(o.investment),
    guaranteed: cleanAmount(o.guaranteed),
    nonGuaranteed: cleanAmount(o.nonGuaranteed),
    total: cleanAmount(o.total),
    hidden: year === 0 ? false : o.hidden === true,
  };
}

export function serializeState(state: PageState): string {
  return JSON.stringify({ version: 2, rows: state.rows, cutoffYear: state.cutoffYear });
}

/** 讀取指定 key；不存在或損毀時回傳 null（不會讀取任何其他 key）。 */
export function loadState(key: string): { state: PageState; savedAt: string | null } | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredPayload>;
    if (!data || data.version !== 2 || !Array.isArray(data.rows)) return null;
    const defaults = createDefaultState();
    const rows = defaults.rows.map((_, y) => cleanRow(data.rows?.[y], y));
    const cutoff = Number(data.cutoffYear);
    const cutoffYear =
      Number.isInteger(cutoff) && cutoff >= 1 && cutoff <= MAX_YEAR ? cutoff : DEFAULT_CUTOFF_YEAR;
    return { state: { rows, cutoffYear }, savedAt: typeof data.savedAt === "string" ? data.savedAt : null };
  } catch {
    return null;
  }
}

export function saveState(key: string, state: PageState): string | null {
  try {
    const savedAt = new Date().toISOString();
    const payload = { ...JSON.parse(serializeState(state)), savedAt };
    window.localStorage.setItem(key, JSON.stringify(payload));
    return savedAt;
  } catch {
    return null;
  }
}
