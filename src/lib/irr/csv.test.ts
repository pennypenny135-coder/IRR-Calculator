import { describe, expect, it } from "vitest";
import { exportCsv, importCsv, parseCsvRecords, templateCsv } from "./csv";
import { createDefaultState } from "./types";

describe("CSV 匯出／範本", () => {
  it("使用 UTF-8 BOM、新版標題，並匯出完整 0–30 年（含隱藏年份）", () => {
    const rows = createDefaultState().rows;
    rows[4] = { ...rows[4], hidden: true, total: "5" };
    const csv = exportCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.trim().split("\r\n");
    expect(lines[0].replace("\uFEFF", "")).toBe("year,investment,guaranteed,non_guaranteed,total,hidden");
    expect(lines).toHaveLength(1 + 31);
    expect(lines[5]).toBe("4,,,,5,true");
  });

  it("空白與 0 保持區別（匯出再匯入後不變）", () => {
    const rows = createDefaultState().rows;
    rows[1] = { ...rows[1], investment: "0" };
    rows[2] = { ...rows[2], investment: "" };
    rows[3] = { ...rows[3], investment: "-12500", guaranteed: "0" };
    const result = importCsv(exportCsv(rows));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toEqual(rows);
  });

  it("範本可以被匯入，內容與規格範例一致", () => {
    const result = importCsv(templateCsv());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows[0].investment).toBe("-10000");
      expect(result.rows[5]).toMatchObject({ guaranteed: "50000", nonGuaranteed: "10000", total: "60000" });
      expect(result.rows[10].total).toBe("100000");
      expect(result.rows[3].investment).toBe("");
    }
  });
});

describe("CSV 匯入驗證", () => {
  const H = "year,investment,guaranteed,non_guaranteed,total,hidden\n";

  it("舊格式（缺少 investment）提示使用新版範本，不推斷供款", () => {
    const r = importCsv("year,guaranteed,non_guaranteed,total,hidden\n0,,,-10000,false\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toContain("新版 CSV 範本");
  });

  it("錯誤附列號與原因，且不產生部分結果", () => {
    const r = importCsv(H + "0,-10000,,,,false\n1,12500,,,,false\n1,-5,,,,false\n99,,,,,false\nx,,,,,false\n2,,abc,,,false\n3,,,,,maybe\n");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const byLine = (n: number) => r.errors.find((e) => e.line === n)?.message ?? "";
      expect(byLine(3)).toContain("正數");
      expect(byLine(4)).toContain("重複");
      expect(byLine(5)).toContain("year");
      expect(byLine(6)).toContain("year");
      expect(byLine(7)).toContain("guaranteed");
      expect(byLine(8)).toContain("hidden");
    }
  });

  it("第 0 年不可隱藏；欄位數量不符會報錯", () => {
    const r = importCsv(H + "0,-1,,,,true\n1,-1,,\n");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
    }
  });

  it("支援 CRLF、引號與 BOM；小數金額被拒絕", () => {
    const ok = importCsv("\uFEFF" + H.replace("\n", "\r\n") + '1,"-1,000",,,,false\r\n');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.rows[1].investment).toBe("-1000");
    expect(importCsv(H + "1,-10.5,,,,false\n").ok).toBe(false);
  });

  it("解析器正確處理引號內的逗號與換行", () => {
    const recs = parseCsvRecords('a,"b,c","d\ne"\n1,2,3\n');
    expect(recs[0].cells).toEqual(["a", "b,c", "d\ne"]);
    expect(recs[1].line).toBe(3);
  });
});
