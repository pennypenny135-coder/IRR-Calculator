# IRR Calculator（Next.js + TypeScript）

兩個完全獨立的 IRR 頁面（金額單位：HKD）：

| 路徑 | 功能 | localStorage key |
| --- | --- | --- |
| `/` | 逐年獨立 IRR | `irr_calculator_independent_v2` |
| `/overall` | 整體 IRR（自選截止年份 1–30，預設第 10 年） | `irr_calculator_overall_v2` |

只有主題（深色／淺色）設定 `irr_calculator_theme` 全站共用。兩頁可共用 UI component、型別及計算 utility，但**不共用輸入 state 或儲存 key**，也沒有任何自動同步／複製。舊版共用資料不會被讀取或搬移。

每頁各自提供：自動暫存、手動儲存、重設、CSV 匯入／匯出／範本、PDF 匯出（瀏覽器列印 → 另存為 PDF）、隱藏年份及重新顯示。重設及 CSV 匯入只影響當前頁面。

## 年度輸入欄位

年份 ｜ 投資金額／供款 ｜ 保證價值 ｜ 保證佔比 ｜ 非保證價值 ｜ 非保證佔比 ｜ 總退保價值 ｜ 總額佔比 ｜ 隱藏 ｜ 獨立 IRR（只限第一頁）

- **投資金額／供款**：該年度現金流出，請輸入**負數**（例如 `-12500`）。空白視為 0。正數不會被自動轉成負數，受影響的 IRR 顯示 N/A。第 0 年必須為負數。
- **總退保價值**：該年度的累積價值（不是每年派發現金），視為該年供款後的價值。
- 保證／非保證／總退保價值允許負數，但**負數價值不會被當成供款**。
- 第 0 年與其他年份欄位結構相同；價值及佔比顯示 `—`，不可輸入，不可隱藏。
- 只輸入保證或非保證 → 總退保價值自動合計（未輸入者視為 0，其佔比 N/A）。可直接輸入總額；手動總額優先，與組成項不一致只提示。清除手動總額後恢復自動合計。全部留空則保持空白。

## IRR 現金流規則

年度 IRR（非 XIRR），第 y 年 = t=y。截止年份 N：

- `y < N`：`cashFlow[y] = C[y]`（供款）
- `y = N`：`cashFlow[N] = C[N] + V[N]`（同年淨額結算）
- 其他年份的退保價值**不會**加入現金流。

例：t0..t2 = -10000，V5 = 60000，V10 = 100000

- 第 5 年：`[-10000, -10000, -10000, 0, 0, 60000]` → 約 18.63%
- 第 10 年：`[-10000, -10000, -10000, 0, 0, 0, 0, 0, 0, 0, 100000]` → 約 14.24%

隱藏年份只影響顯示；資料與供款仍按原年份計算，時間軸不會壓縮。

## CSV 格式

```csv
year,investment,guaranteed,non_guaranteed,total,hidden
0,-10000,,,,false
1,-10000,,,,false
2,-10000,,,,false
5,,50000,10000,60000,false
10,,80000,20000,100000,false
```

- UTF-8 BOM；匯出完整 0–30 年（含隱藏年份），只匯出當前頁資料。
- 空白與 `0` 保持區別。`total` 只輸出手動總額；空白代表自動合計。
- 匯入會取代當前頁資料，驗證通過後先要求確認；驗證 year（0–30）、整數金額、重複年份、供款不得為正數、`hidden`（true/false）。任何錯誤都會列出行號與原因，且**不會部分覆寫**。
- 缺少 `investment` 欄的舊格式會被拒絕，並提示使用新版範本（不會把負數 total 推斷為供款）。

## 開發與測試

```bash
npm run dev          # 開發
npm run build        # production build
npm test             # Vitest：計算邏輯、CSV、頁面獨立性／還原／匯入（jsdom）
npm run test:e2e     # Playwright：真實瀏覽器的對齊、導覽、主題對比度（需先 npm run build）
```

首次執行 e2e 需要 `npx playwright install chromium`（Linux 另需系統函式庫，可用 `npx playwright install-deps chromium`）。

## 專案結構

- `src/lib/irr/calc.ts`：現金流、IRR、摘要（純函式）
- `src/lib/irr/csv.ts`：CSV 匯出／匯入驗證
- `src/lib/irr/storage.ts`、`useCalculatorStore.ts`：每頁獨立儲存
- `src/components/`：`IrrCalculatorPage`、`YearTable`、`MoneyInput`、`SiteNav`
- `e2e/`：Playwright 測試
