/** 金額欄位的輸入解析與顯示格式（整數、千分位、可帶負號）。 */

export type AmountParse =
  | { state: "blank"; value: null }
  | { state: "invalid"; value: null }
  | { state: "valid"; value: number };

export function parseAmount(raw: string): AmountParse {
  const s = raw.trim();
  if (s === "") return { state: "blank", value: null };
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    return { state: "valid", value: n === 0 ? 0 : n }; // 避免 -0
  }
  return { state: "invalid", value: null };
}

/** 將使用者輸入清理成只含負號（僅限開頭）與數字的字串。 */
export function sanitizeAmountInput(input: string): string {
  const normalized = input.replace(/[−－–—]/g, "-");
  const negative = normalized.trimStart().startsWith("-");
  const digits = normalized.replace(/[^0-9]/g, "");
  if (negative) return "-" + digits;
  return digits;
}

/** 失焦後的標準化：移除前導 0、單獨的負號清成空白，但保留「0」與空白的差異。 */
export function normalizeAmount(raw: string): string {
  const parsed = parseAmount(raw);
  if (parsed.state === "valid") return String(parsed.value);
  return "";
}

export function formatMoney(value: number): string {
  const rounded = Math.round(value);
  return (rounded === 0 ? 0 : rounded).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** 失焦後輸入框的顯示值（千分位）。無效值原樣顯示。 */
export function formatAmountForDisplay(raw: string): string {
  const parsed = parseAmount(raw);
  if (parsed.state === "valid") return formatMoney(parsed.value);
  return raw;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}
