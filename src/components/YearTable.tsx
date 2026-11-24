"use client";

import { formatMoney, formatPercent } from "@/lib/irr/format";
import { investmentIssue, type IndependentCell, type RowCalc } from "@/lib/irr/calc";
import type { CalculatorMode, RowInput } from "@/lib/irr/types";
import { MoneyInput } from "./MoneyInput";

type Align = "left" | "right" | "center";

interface ColumnDef {
  key: string;
  label: string;
  unit?: string;
  width: number;
  align: Align;
}

const BASE_COLUMNS: ColumnDef[] = [
  { key: "year", label: "年份", width: 84, align: "left" },
  { key: "investment", label: "投資金額／供款", unit: "HKD", width: 168, align: "right" },
  { key: "guaranteed", label: "保證價值", unit: "HKD", width: 150, align: "right" },
  { key: "guaranteedPct", label: "保證佔比", width: 100, align: "right" },
  { key: "nonGuaranteed", label: "非保證價值", unit: "HKD", width: 150, align: "right" },
  { key: "nonGuaranteedPct", label: "非保證佔比", width: 108, align: "right" },
  { key: "total", label: "總退保價值", unit: "HKD", width: 168, align: "right" },
  { key: "totalPct", label: "總額佔比", width: 100, align: "right" },
  { key: "hidden", label: "隱藏", width: 72, align: "center" },
];
const IRR_COLUMN: ColumnDef = { key: "irr", label: "獨立 IRR", width: 116, align: "right" };

export function getColumns(mode: CalculatorMode): ColumnDef[] {
  return mode === "independent" ? [...BASE_COLUMNS, IRR_COLUMN] : BASE_COLUMNS;
}

const alignClass: Record<Align, string> = { left: "al-left", right: "al-right num", center: "al-center" };

function Dash() {
  return (
    <span className="cell-static dash" aria-label="不適用">
      —
    </span>
  );
}

function Pct({ value }: { value: number | null }) {
  return value === null ? (
    <span className="cell-static na">N/A</span>
  ) : (
    <span className="cell-static num">{formatPercent(value)}</span>
  );
}

interface YearTableProps {
  mode: CalculatorMode;
  rows: RowInput[];
  calcs: RowCalc[];
  independent: IndependentCell[] | null;
  cutoffYear: number;
  onChange: (year: number, patch: Partial<RowInput>) => void;
}

export function YearTable({ mode, rows, calcs, independent, cutoffYear, onChange }: YearTableProps) {
  const columns = getColumns(mode);
  const minWidth = columns.reduce((sum, c) => sum + c.width, 0);

  return (
    <div className="table-scroll" data-testid={`year-table-${mode}`} tabIndex={0} aria-label="年度輸入表格（可橫向捲動）">
      <table className="year-table" style={{ minWidth }}>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={alignClass[c.align]} data-col={c.key}>
                <span className="th-label">{c.label}</span>
                {c.unit ? <span className="th-unit">（{c.unit}）</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, year) => {
            if (row.hidden && year !== 0) return null;
            const calc = calcs[year];
            const issue = investmentIssue(calc);
            const beyond = mode === "overall" && year > cutoffYear;
            const invHintId = `hint-inv-${mode}-${year}`;
            const totalHintId = `hint-total-${mode}-${year}`;

            const autoPlaceholder =
              !calc.totalIsManual && calc.autoTotal !== null ? formatMoney(calc.autoTotal) : undefined;

            let totalHint: { text: string; warn: boolean } | null = null;
            if (calc.mismatch && calc.autoTotal !== null) {
              totalHint = { text: `與組成項合計 ${formatMoney(calc.autoTotal)} 不一致，以手動總額計算`, warn: true };
            } else if (!calc.totalIsManual && calc.autoTotal !== null) {
              totalHint = { text: "自動合計", warn: false };
            }

            const irrCell = independent?.[year];

            return (
              <tr key={year} data-year={year} className={beyond ? "beyond-cutoff" : undefined}>
                <th scope="row" className="al-left year-cell">
                  第 {year} 年
                </th>

                <td className="al-right num" data-col="investment">
                  <MoneyInput
                    value={row.investment}
                    onChange={(v) => onChange(year, { investment: v })}
                    ariaLabel={`第 ${year} 年 投資金額／供款（HKD）`}
                    invalid={issue !== null}
                    describedBy={invHintId}
                  />
                  <div id={invHintId} className={issue ? "hint hint-error" : "hint"}>
                    {issue ?? (year === 0 ? "初始投資" : "")}
                  </div>
                </td>

                <td className="al-right num" data-col="guaranteed">
                  {year === 0 ? (
                    <Dash />
                  ) : (
                    <MoneyInput
                      value={row.guaranteed}
                      onChange={(v) => onChange(year, { guaranteed: v })}
                      ariaLabel={`第 ${year} 年 保證價值（HKD）`}
                    />
                  )}
                </td>
                <td className="al-right num" data-col="guaranteedPct">
                  {year === 0 ? <Dash /> : <Pct value={calc.guaranteedPct} />}
                </td>

                <td className="al-right num" data-col="nonGuaranteed">
                  {year === 0 ? (
                    <Dash />
                  ) : (
                    <MoneyInput
                      value={row.nonGuaranteed}
                      onChange={(v) => onChange(year, { nonGuaranteed: v })}
                      ariaLabel={`第 ${year} 年 非保證價值（HKD）`}
                    />
                  )}
                </td>
                <td className="al-right num" data-col="nonGuaranteedPct">
                  {year === 0 ? <Dash /> : <Pct value={calc.nonGuaranteedPct} />}
                </td>

                <td className="al-right num" data-col="total">
                  {year === 0 ? (
                    <Dash />
                  ) : (
                    <>
                      <MoneyInput
                        value={row.total}
                        onChange={(v) => onChange(year, { total: v })}
                        ariaLabel={`第 ${year} 年 總退保價值（HKD）`}
                        placeholder={autoPlaceholder}
                        describedBy={totalHintId}
                      />
                      <div id={totalHintId} className={totalHint?.warn ? "hint hint-warn" : "hint"}>
                        {totalHint?.text ?? ""}
                      </div>
                    </>
                  )}
                </td>
                <td className="al-right num" data-col="totalPct">
                  {year === 0 ? <Dash /> : <Pct value={calc.totalPct} />}
                </td>

                <td className="al-center" data-col="hidden">
                  {year === 0 ? (
                    <Dash />
                  ) : (
                    <span className="cell-static">
                      <input
                        type="checkbox"
                        className="hide-check"
                        aria-label={`隱藏第 ${year} 年`}
                        checked={row.hidden}
                        onChange={(e) => onChange(year, { hidden: e.target.checked })}
                      />
                    </span>
                  )}
                </td>

                {mode === "independent" ? (
                  <td className="al-right num" data-col="irr">
                    {!irrCell || irrCell.kind === "none" ? (
                      <Dash />
                    ) : irrCell.kind === "na" ? (
                      <span className="cell-static na" title={irrCell.reason}>
                        N/A
                      </span>
                    ) : (
                      <span className="cell-static num irr-value">{formatPercent(irrCell.irr)}</span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
