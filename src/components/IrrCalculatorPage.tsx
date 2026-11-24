"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  computeIndependentIrrs,
  computeRows,
  investmentIssue,
  summarizeIndependent,
  summarizeOverall,
  type IndependentCell,
} from "@/lib/irr/calc";
import { exportCsv, importCsv, templateCsv, type CsvError } from "@/lib/irr/csv";
import { formatMoney, formatPercent } from "@/lib/irr/format";
import { MAX_YEAR, type CalculatorMode } from "@/lib/irr/types";
import { useCalculatorStore } from "@/lib/irr/useCalculatorStore";
import { YearTable } from "./YearTable";

const PAGE_TEXT: Record<CalculatorMode, { title: string; subtitle: string; file: string }> = {
  independent: {
    title: "逐年獨立 IRR",
    subtitle: "每個有正數總退保價值的年份，各自只用該年及以前的供款獨立計算 IRR。",
    file: "irr-independent",
  },
  overall: {
    title: "整體 IRR",
    subtitle: "自選截止年份，計算該年份的整體 IRR。此頁資料與「逐年獨立 IRR」頁完全獨立，請在此重新輸入。",
    file: "irr-overall",
  },
};

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("讀取檔案失敗"));
    reader.readAsText(file, "utf-8");
  });
}

function Card({ id, label, value, sub, tone }: { id: string; label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" }) {
  return (
    <div className="card" data-testid={`card-${id}`}>
      <div className="card-label">{label}</div>
      <div className="card-value num" data-testid={`card-value-${id}`}>
        {value}
      </div>
      {sub ? <div className={tone === "warn" ? "card-sub card-sub-warn" : "card-sub"}>{sub}</div> : null}
    </div>
  );
}

function irrCellText(cell: IndependentCell | null | undefined): { text: string; reason?: string } {
  if (!cell || cell.kind === "none") return { text: "—" };
  if (cell.kind === "na") return { text: "N/A", reason: cell.reason };
  return { text: formatPercent(cell.irr) };
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-HK", { hour12: false });
}

export function IrrCalculatorPage({ mode }: { mode: CalculatorMode }) {
  const text = PAGE_TEXT[mode];
  const store = useCalculatorStore(mode);
  const { state, status } = store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvErrors, setCsvErrors] = useState<CsvError[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const calcs = useMemo(() => computeRows(state.rows), [state.rows]);
  const independentCells = useMemo(
    () => (mode === "independent" ? computeIndependentIrrs(calcs) : null),
    [mode, calcs],
  );
  const indSummary = useMemo(
    () => (independentCells ? summarizeIndependent(calcs, independentCells) : null),
    [calcs, independentCells],
  );
  const overallSummary = useMemo(
    () => (mode === "overall" ? summarizeOverall(calcs, state.cutoffYear) : null),
    [mode, calcs, state.cutoffYear],
  );

  const hiddenYears = state.rows.map((r, y) => (r.hidden && y > 0 ? y : -1)).filter((y) => y > 0);
  const hiddenIssues = hiddenYears
    .map((y) => ({ y, issue: investmentIssue(calcs[y]) }))
    .filter((x) => x.issue !== null);

  const statusText = (() => {
    if (!status.at) return "尚未儲存（輸入後會自動暫存在此瀏覽器）";
    const t = formatTime(status.at);
    switch (status.kind) {
      case "manual":
        return `已手動儲存 ${t}`;
      case "reset":
        return `已重設 ${t}`;
      case "loaded":
        return `已還原上次暫存 ${t}`;
      default:
        return `已自動暫存 ${t}`;
    }
  })();

  const onReset = () => {
    if (!window.confirm(`確定要重設「${text.title}」頁的所有資料嗎？（不會影響另一頁）`)) return;
    store.reset();
    setCsvErrors([]);
    setMessage("已重設本頁資料。");
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      const content = await readFileText(file);
      const result = importCsv(content);
      if (!result.ok) {
        setCsvErrors(result.errors);
        return;
      }
      setCsvErrors([]);
      if (!window.confirm(`匯入會取代「${text.title}」頁目前的所有年度資料（不會影響另一頁）。確定要繼續嗎？`)) {
        return;
      }
      store.replaceRows(result.rows);
      setMessage(`已從 ${file.name} 匯入資料到本頁。`);
    } catch {
      setCsvErrors([{ line: null, message: "無法讀取檔案。" }]);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="page" data-page={mode}>
      <header className="page-header">
        <h1>{text.title}</h1>
        <p className="muted">{text.subtitle}</p>
        <p className="muted small">
          金額單位：HKD。每年一個時間點（第 0 年 = t0），使用年度 IRR（非 XIRR）。「投資金額／供款」是該年現金流出（請輸入負數）；
          「總退保價值」是該年累積價值，不是每年派發現金，並視為該年供款後的價值。
        </p>
      </header>

      <div className="print-only print-title">
        {text.title}（HKD）— 列印日期 {new Date().toLocaleDateString("zh-HK")}
      </div>

      {mode === "overall" ? (
        <div className="cutoff-row no-print">
          <label htmlFor="cutoff-year">截止年份</label>
          <select
            id="cutoff-year"
            className="select"
            value={state.cutoffYear}
            onChange={(e) => store.setCutoffYear(Number(e.target.value))}
          >
            {Array.from({ length: MAX_YEAR }, (_, i) => i + 1).map((y) => (
              <option key={y} value={y}>
                第 {y} 年
              </option>
            ))}
          </select>
          <span className="muted small">只計算第 0 年至第 {state.cutoffYear} 年；其後年份的資料不會被計入。</span>
        </div>
      ) : null}

      <section className="cards" aria-label="摘要">
        {indSummary ? (
          <>
            <Card
              id="initial"
              label="初始投資（HKD）"
              value={indSummary.initialInvestment === null ? "—" : formatMoney(indSummary.initialInvestment)}
              sub="第 0 年供款"
            />
            <Card id="total-contribution" label="總供款（HKD）" value={formatMoney(indSummary.totalContribution)} sub="第 0–30 年供款合計" />
            <Card
              id="latest-year"
              label="最新回報年份"
              value={indSummary.latestYear === null ? "—" : `第 ${indSummary.latestYear} 年`}
              sub="最後一個有正數退保價值的年份"
            />
            <Card
              id="latest-irr"
              label="最新獨立 IRR"
              value={irrCellText(indSummary.latestIrr).text}
              sub={irrCellText(indSummary.latestIrr).reason}
              tone="warn"
            />
          </>
        ) : null}
        {overallSummary ? (
          <>
            <Card
              id="total-contribution"
              label="總供款（HKD）"
              value={formatMoney(overallSummary.totalContribution)}
              sub={`第 0–${state.cutoffYear} 年供款合計`}
            />
            <Card
              id="surrender"
              label={`第 ${state.cutoffYear} 年退保價值（HKD）`}
              value={overallSummary.surrenderValue === null ? "N/A" : formatMoney(overallSummary.surrenderValue)}
              sub="截止年份總退保價值"
            />
            <Card
              id="net-return"
              label="淨回報（HKD）"
              value={overallSummary.netReturn === null ? "N/A" : formatMoney(overallSummary.netReturn)}
              sub="退保價值 + 供款合計"
            />
            <Card
              id="overall-irr"
              label="整體 IRR"
              value={overallSummary.irr.irr === null ? "N/A" : formatPercent(overallSummary.irr.irr)}
              sub={overallSummary.irr.irr === null ? overallSummary.irr.reason : `截止第 ${state.cutoffYear} 年`}
              tone={overallSummary.irr.irr === null ? "warn" : undefined}
            />
            <Card
              id="multiple"
              label="回報倍數"
              value={overallSummary.multiple === null ? "N/A" : `${overallSummary.multiple.toFixed(2)}x`}
              sub="退保價值 ÷ 供款合計絕對值"
            />
          </>
        ) : null}
      </section>

      <section className="toolbar no-print" aria-label="資料操作">
        <div className="toolbar-buttons">
          <button type="button" className="btn btn-primary" onClick={store.saveManually}>
            儲存
          </button>
          <button type="button" className="btn btn-danger" onClick={onReset}>
            重設
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            匯入 CSV
          </button>
          <button type="button" className="btn" onClick={() => downloadText(`${text.file}.csv`, exportCsv(state.rows))}>
            匯出 CSV
          </button>
          <button type="button" className="btn" onClick={() => downloadText(`${text.file}-template.csv`, templateCsv())}>
            CSV 範本
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            匯出 PDF
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            aria-label="選擇要匯入的 CSV 檔案"
            data-testid="csv-file-input"
            onChange={(e) => void onImportFile(e.target.files?.[0])}
          />
        </div>
        <div className="muted small" role="status" data-testid="save-status">
          {statusText}
        </div>
      </section>

      {message ? (
        <div className="notice notice-ok no-print" role="status">
          {message}
        </div>
      ) : null}

      {csvErrors.length > 0 ? (
        <div className="notice notice-error no-print" role="alert" data-testid="csv-errors">
          <strong>CSV 匯入失敗，現有資料沒有被修改：</strong>
          <ul>
            {csvErrors.slice(0, 50).map((err, i) => (
              <li key={i}>
                {err.line !== null ? `第 ${err.line} 行：` : ""}
                {err.message}
              </li>
            ))}
          </ul>
          {csvErrors.length > 50 ? <div>還有 {csvErrors.length - 50} 個錯誤未顯示。</div> : null}
          <button type="button" className="btn btn-small" onClick={() => setCsvErrors([])}>
            關閉
          </button>
        </div>
      ) : null}

      {hiddenYears.length > 0 ? (
        <div className="notice no-print" data-testid="hidden-bar">
          <span>已隱藏 {hiddenYears.length} 個年份（資料與供款仍照原年份計算）：</span>
          {hiddenYears.map((y) => (
            <button key={y} type="button" className="chip" onClick={() => store.updateRow(y, { hidden: false })}>
              顯示第 {y} 年
            </button>
          ))}
          <button type="button" className="btn btn-small" onClick={store.showAllYears}>
            全部顯示
          </button>
        </div>
      ) : null}

      {hiddenIssues.length > 0 ? (
        <div className="notice notice-warn no-print" role="alert">
          {hiddenIssues.map((x) => (
            <div key={x.y}>
              隱藏的第 {x.y} 年：{x.issue}
            </div>
          ))}
        </div>
      ) : null}

      <YearTable
        mode={mode}
        rows={state.rows}
        calcs={calcs}
        independent={independentCells}
        cutoffYear={state.cutoffYear}
        onChange={store.updateRow}
      />

      <p className="muted small table-note">
        {mode === "overall" ? `灰底年份在截止年份之後，不會計入整體 IRR。` : ""}
        {"保證／非保證留空時視為 0 計入自動合計，但其佔比顯示 N/A。手動輸入總額後以手動總額為準；清除後恢復自動合計。"}
      </p>
    </div>
  );
}
