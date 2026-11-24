import { MAX_YEAR, createEmptyRow, type RowInput } from "./types";

export const CSV_HEADER = ["year", "investment", "guaranteed", "non_guaranteed", "total", "hidden"] as const;
const BOM = "\uFEFF";

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildCsvFromRows(rows: { year: number; row: RowInput }[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const { year, row } of rows) {
    lines.push(
      [year, row.investment, row.guaranteed, row.nonGuaranteed, row.total, row.hidden ? "true" : "false"]
        .map((v) => escapeCell(String(v)))
        .join(","),
    );
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

/** 匯出完整 0–30 年（含隱藏年份）。total 欄只輸出手動總額，空白代表自動合計。 */
export function exportCsv(rows: RowInput[]): string {
  return buildCsvFromRows(rows.slice(0, MAX_YEAR + 1).map((row, year) => ({ year, row })));
}

export function templateCsv(): string {
  const base = (patch: Partial<RowInput>): RowInput => ({ ...createEmptyRow(), ...patch });
  return buildCsvFromRows([
    { year: 0, row: base({ investment: "-10000" }) },
    { year: 1, row: base({ investment: "-10000" }) },
    { year: 2, row: base({ investment: "-10000" }) },
    { year: 5, row: base({ guaranteed: "50000", nonGuaranteed: "10000", total: "60000" }) },
    { year: 10, row: base({ guaranteed: "80000", nonGuaranteed: "20000", total: "100000" }) },
  ]);
}

interface CsvRecord {
  line: number; // 檔案中的實際行號（從 1 開始）
  cells: string[];
}

/** 簡易 RFC4180 解析（支援引號、雙引號跳脫、CRLF）。 */
export function parseCsvRecords(text: string): CsvRecord[] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let cellTouched = false;

  const endCell = () => {
    cells.push(cell);
    cell = "";
    cellTouched = false;
  };
  const endRecord = () => {
    endCell();
    const blank = cells.length === 1 && cells[0].trim() === "";
    if (!blank) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && !cellTouched && cell === "") {
      inQuotes = true;
      cellTouched = true;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else if (ch === "\n") {
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += ch;
      cellTouched = true;
    }
  }
  if (cell !== "" || cells.length > 0) endRecord();
  return records;
}

export interface CsvError {
  line: number | null;
  message: string;
}

export type CsvImportResult =
  | { ok: true; rows: RowInput[] }
  | { ok: false; errors: CsvError[] };

const AMOUNT_RE = /^-?\d+$/;
const AMOUNT_COMMA_RE = /^-?\d{1,3}(,\d{3})+$/;

function parseAmountCell(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return "";
  if (AMOUNT_RE.test(s) || AMOUNT_COMMA_RE.test(s)) {
    const n = Number(s.replace(/,/g, ""));
    return String(n === 0 ? 0 : n);
  }
  return null;
}

function parseBoolCell(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === "" || s === "false" || s === "0" || s === "no") return false;
  if (s === "true" || s === "1" || s === "yes") return true;
  return null;
}

/** 驗證並轉換 CSV。任何錯誤都不會產生部分結果。 */
export function importCsv(text: string): CsvImportResult {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { ok: false, errors: [{ line: null, message: "CSV 是空的，請使用新版範本。" }] };
  }

  const header = records[0].cells.map((c) => c.trim().toLowerCase());
  const required = CSV_HEADER as readonly string[];

  if (!header.includes("investment")) {
    return {
      ok: false,
      errors: [
        {
          line: records[0].line,
          message:
            "偵測到舊版 CSV（缺少 investment 欄）。本版本不會把負數 total 推斷為供款，請下載新版 CSV 範本，並把供款填入 investment 欄。",
        },
      ],
    };
  }

  const headerErrors: CsvError[] = [];
  for (const name of required) {
    if (!header.includes(name)) {
      headerErrors.push({ line: records[0].line, message: `標題列缺少「${name}」欄。` });
    }
  }
  header.forEach((name, i) => {
    if (!required.includes(name)) {
      headerErrors.push({ line: records[0].line, message: `標題列第 ${i + 1} 欄「${name}」不是有效欄位。` });
    } else if (header.indexOf(name) !== i) {
      headerErrors.push({ line: records[0].line, message: `標題列欄位「${name}」重複。` });
    }
  });
  if (headerErrors.length > 0) return { ok: false, errors: headerErrors };

  const idx = (name: string) => header.indexOf(name);
  const errors: CsvError[] = [];
  const rows: RowInput[] = Array.from({ length: MAX_YEAR + 1 }, createEmptyRow);
  const seen = new Map<number, number>();
  const dataRecords = records.slice(1);

  if (dataRecords.length === 0) {
    return { ok: false, errors: [{ line: null, message: "CSV 沒有任何資料列。" }] };
  }

  for (const rec of dataRecords) {
    const { line, cells } = rec;
    if (cells.length !== header.length) {
      errors.push({ line, message: `欄位數量為 ${cells.length}，應為 ${header.length}。` });
      continue;
    }
    const get = (name: string) => cells[idx(name)];

    const yearRaw = get("year").trim();
    if (!/^\d+$/.test(yearRaw) || Number(yearRaw) > MAX_YEAR) {
      errors.push({ line, message: `year「${yearRaw}」無效，必須是 0–${MAX_YEAR} 的整數。` });
      continue;
    }
    const year = Number(yearRaw);
    const firstLine = seen.get(year);
    if (firstLine !== undefined) {
      errors.push({ line, message: `第 ${year} 年重複出現（首次出現在第 ${firstLine} 行）。` });
      continue;
    }
    seen.set(year, line);

    let ok = true;
    const fields: Record<"investment" | "guaranteed" | "non_guaranteed" | "total", string> = {
      investment: "",
      guaranteed: "",
      non_guaranteed: "",
      total: "",
    };
    for (const name of ["investment", "guaranteed", "non_guaranteed", "total"] as const) {
      const parsed = parseAmountCell(get(name));
      if (parsed === null) {
        errors.push({ line, message: `${name}「${get(name).trim()}」不是有效的整數金額。` });
        ok = false;
      } else {
        fields[name] = parsed;
      }
    }
    if (ok && fields.investment !== "" && Number(fields.investment) > 0) {
      errors.push({ line, message: `investment「${fields.investment}」為正數；供款必須輸入負數，例如 -12500。` });
      ok = false;
    }
    const hidden = parseBoolCell(get("hidden"));
    if (hidden === null) {
      errors.push({ line, message: `hidden「${get("hidden").trim()}」無效，請使用 true 或 false。` });
      ok = false;
    } else if (hidden && year === 0) {
      errors.push({ line, message: "第 0 年不可隱藏。" });
      ok = false;
    }
    if (!ok) continue;

    rows[year] = {
      investment: fields.investment,
      guaranteed: fields.guaranteed,
      nonGuaranteed: fields.non_guaranteed,
      total: fields.total,
      hidden: hidden === true,
    };
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}
