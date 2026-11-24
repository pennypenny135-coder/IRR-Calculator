// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IrrCalculatorPage } from "./IrrCalculatorPage";
import { STORAGE_KEYS } from "@/lib/irr/types";

const IND = STORAGE_KEYS.independent;
const OVR = STORAGE_KEYS.overall;

const inv = (y: number) => `第 ${y} 年 投資金額／供款（HKD）`;
const gua = (y: number) => `第 ${y} 年 保證價值（HKD）`;
const non = (y: number) => `第 ${y} 年 非保證價值（HKD）`;
const tot = (y: number) => `第 ${y} 年 總退保價值（HKD）`;

async function setAmount(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value !== "") await user.type(input, value);
  await user.tab();
}

async function fillBaseline(user: ReturnType<typeof userEvent.setup>) {
  await setAmount(user, inv(0), "-10000");
  await setAmount(user, inv(1), "-10000");
  await setAmount(user, inv(2), "-10000");
  await setAmount(user, tot(5), "60000");
  await setAmount(user, tot(10), "100000");
}

function irrText(container: HTMLElement, year: number): string {
  return container.querySelector(`tr[data-year="${year}"] [data-col="irr"]`)?.textContent ?? "";
}
function value(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
}
function stored(key: string) {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("兩頁資料完全獨立", () => {
  it("1. 第一頁修改資料不影響第二頁", async () => {
    const user = userEvent.setup();
    const first = render(<IrrCalculatorPage mode="independent" />);
    await fillBaseline(user);
    await user.click(screen.getByRole("button", { name: "儲存" }));
    expect(stored(IND).rows[5].total).toBe("60000");
    expect(stored(OVR)).toBeNull();
    first.unmount();

    render(<IrrCalculatorPage mode="overall" />);
    expect(value(inv(0))).toBe("");
    expect(value(tot(5))).toBe("");
    expect(screen.getByTestId("card-value-overall-irr").textContent).toBe("N/A");
    expect(stored(OVR)).toBeNull();
    expect(stored(IND).rows[5].total).toBe("60000");
  });

  it("2. 第二頁重設不影響第一頁", async () => {
    const user = userEvent.setup();
    const first = render(<IrrCalculatorPage mode="independent" />);
    await fillBaseline(user);
    await user.click(screen.getByRole("button", { name: "儲存" }));
    const before = JSON.stringify(stored(IND));
    first.unmount();

    const second = render(<IrrCalculatorPage mode="overall" />);
    await fillBaseline(user);
    await user.click(screen.getByRole("button", { name: "儲存" }));
    expect(value(tot(10))).toBe("100,000");
    await user.click(screen.getByRole("button", { name: "重設" }));
    expect(value(tot(10))).toBe("");
    expect(stored(OVR).rows[10].total).toBe("");
    second.unmount();

    expect(JSON.stringify(stored(IND))).toBe(before);
    render(<IrrCalculatorPage mode="independent" />);
    expect(value(tot(10))).toBe("100,000");
  });

  it("3. 重新整理後兩頁各自還原自己的資料（含截止年份、隱藏年份）", async () => {
    const user = userEvent.setup();
    const a = render(<IrrCalculatorPage mode="independent" />);
    await setAmount(user, inv(0), "-111");
    await user.click(screen.getByLabelText("隱藏第 3 年"));
    await waitFor(() => expect(stored(IND)?.rows[0].investment).toBe("-111"));
    a.unmount();

    const b = render(<IrrCalculatorPage mode="overall" />);
    await setAmount(user, inv(0), "-222");
    await user.selectOptions(screen.getByLabelText("截止年份"), "7");
    await waitFor(() => expect(stored(OVR)?.cutoffYear).toBe(7));
    b.unmount();

    const a2 = render(<IrrCalculatorPage mode="independent" />);
    expect(value(inv(0))).toBe("-111");
    expect(screen.queryByLabelText("隱藏第 3 年")).toBeNull(); // 仍然隱藏
    expect(screen.getByTestId("hidden-bar")).toBeTruthy();
    a2.unmount();

    render(<IrrCalculatorPage mode="overall" />);
    expect(value(inv(0))).toBe("-222");
    expect((screen.getByLabelText("截止年份") as HTMLSelectElement).value).toBe("7");
    expect(screen.queryByTestId("hidden-bar")).toBeNull(); // 第二頁沒有隱藏年份
  });

  it("舊版共用資料不會被自動複製到新頁面", () => {
    window.localStorage.setItem("irr_calculator", JSON.stringify({ rows: [{ total: "999" }] }));
    render(<IrrCalculatorPage mode="independent" />);
    expect(value(tot(1))).toBe("");
    expect(stored(OVR)).toBeNull();
  });
});

describe("CSV 匯入只更新當前頁", () => {
  const csv = "year,investment,guaranteed,non_guaranteed,total,hidden\n0,-5000,,,,false\n3,,,,9000,true\n";

  it("4. 匯入第二頁不影響第一頁", async () => {
    const user = userEvent.setup();
    const first = render(<IrrCalculatorPage mode="independent" />);
    await setAmount(user, inv(0), "-777");
    await user.click(screen.getByRole("button", { name: "儲存" }));
    first.unmount();

    render(<IrrCalculatorPage mode="overall" />);
    const file = new File([csv], "x.csv", { type: "text/csv" });
    fireEvent.change(screen.getByTestId("csv-file-input"), { target: { files: [file] } });
    await waitFor(() => expect(value(inv(0))).toBe("-5,000"));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "儲存" }));
    expect(stored(OVR).rows[3]).toMatchObject({ total: "9000", hidden: true });
    expect(stored(IND).rows[0].investment).toBe("-777");
  });

  it("驗證失敗時顯示列號，且不覆寫現有資料", async () => {
    const user = userEvent.setup();
    render(<IrrCalculatorPage mode="independent" />);
    await setAmount(user, inv(0), "-777");
    const bad = "year,investment,guaranteed,non_guaranteed,total,hidden\n0,-5000,,,,false\n1,500,,,,false\n";
    fireEvent.change(screen.getByTestId("csv-file-input"), { target: { files: [new File([bad], "bad.csv")] } });
    const errors = await screen.findByTestId("csv-errors");
    expect(errors.textContent).toContain("第 3 行");
    expect(errors.textContent).toContain("正數");
    expect(value(inv(0))).toBe("-777");
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("使用者取消確認時不覆寫資料", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<IrrCalculatorPage mode="independent" />);
    await setAmount(user, inv(0), "-777");
    fireEvent.change(screen.getByTestId("csv-file-input"), { target: { files: [new File([csv], "x.csv")] } });
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(value(inv(0))).toBe("-777");
  });

  it("舊格式 CSV 提示使用新版範本", async () => {
    render(<IrrCalculatorPage mode="independent" />);
    const legacy = "year,guaranteed,non_guaranteed,total,hidden\n0,,,-10000,false\n";
    fireEvent.change(screen.getByTestId("csv-file-input"), { target: { files: [new File([legacy], "old.csv")] } });
    const errors = await screen.findByTestId("csv-errors");
    expect(errors.textContent).toContain("新版 CSV 範本");
  });
});

describe("第一頁表格行為", () => {
  it("5/7/8. 同年淨額結算、早期供款連動、第 10 年供款不影響第 5 年", async () => {
    const user = userEvent.setup();
    const { container } = render(<IrrCalculatorPage mode="independent" />);
    await fillBaseline(user);
    expect(irrText(container, 5)).toBe("18.63%");
    expect(irrText(container, 10)).toBe("14.24%");

    // 修改第 10 年供款：第 5 年不變
    await setAmount(user, inv(10), "-5000");
    expect(irrText(container, 5)).toBe("18.63%");
    expect(irrText(container, 10)).not.toBe("14.24%");
    await setAmount(user, inv(10), "");
    expect(irrText(container, 10)).toBe("14.24%");

    // 修改第 1 年供款：第 5、10 年都即時更新
    await setAmount(user, inv(1), "-20000");
    expect(irrText(container, 5)).not.toBe("18.63%");
    expect(irrText(container, 10)).not.toBe("14.24%");
    await setAmount(user, inv(1), "-10000");

    // 同年供款 + 退保價值：現金流 50000，IRR 低於未供款時
    await setAmount(user, inv(5), "-10000");
    const netted = irrText(container, 5);
    expect(netted).not.toBe("18.63%");
    expect(netted.endsWith("%")).toBe(true);
  });

  it("6. 隱藏年份不改變 IRR", async () => {
    const user = userEvent.setup();
    const { container } = render(<IrrCalculatorPage mode="independent" />);
    await fillBaseline(user);
    await user.click(screen.getByLabelText("隱藏第 1 年"));
    await user.click(screen.getByLabelText("隱藏第 2 年"));
    expect(container.querySelector('tr[data-year="1"]')).toBeNull();
    expect(irrText(container, 5)).toBe("18.63%");
    expect(irrText(container, 10)).toBe("14.24%");
    expect(screen.getByTestId("card-value-total-contribution").textContent).toBe("-30,000");
    await user.click(screen.getByRole("button", { name: "全部顯示" }));
    expect(container.querySelector('tr[data-year="1"]')).not.toBeNull();
    expect(value(inv(1))).toBe("-10,000");
  });

  it("10. 只輸入總退保價值即可計算", async () => {
    const user = userEvent.setup();
    const { container } = render(<IrrCalculatorPage mode="independent" />);
    await setAmount(user, inv(0), "-10000");
    await setAmount(user, tot(3), "12000");
    expect(irrText(container, 3)).toMatch(/^\d+\.\d{2}%$/);
  });

  it("11. 保證或非保證留空時佔比顯示 N/A，並自動合計", async () => {
    const user = userEvent.setup();
    const { container } = render(<IrrCalculatorPage mode="independent" />);
    await setAmount(user, gua(5), "50000");
    const cell = (col: string) => container.querySelector(`tr[data-year="5"] [data-col="${col}"]`)?.textContent;
    expect(cell("guaranteedPct")).toBe("100.00%");
    expect(cell("nonGuaranteedPct")).toBe("N/A");
    expect(cell("totalPct")).toBe("100.00%");
    expect((screen.getByLabelText(tot(5)) as HTMLInputElement).placeholder).toBe("50,000");

    await setAmount(user, non(5), "10000");
    expect(cell("guaranteedPct")).toBe("83.33%");
    expect(cell("nonGuaranteedPct")).toBe("16.67%");
  });

  it("手動總額與組成項不一致只提示、不覆蓋；清除後恢復自動合計", async () => {
    const user = userEvent.setup();
    const { container } = render(<IrrCalculatorPage mode="independent" />);
    await setAmount(user, gua(5), "50000");
    await setAmount(user, non(5), "10000");
    await setAmount(user, tot(5), "70000");
    expect(value(tot(5))).toBe("70,000");
    expect(container.querySelector("#hint-total-independent-5")?.textContent).toContain("不一致");
    await setAmount(user, tot(5), "");
    expect(container.querySelector("#hint-total-independent-5")?.textContent).toBe("自動合計");
    expect((screen.getByLabelText(tot(5)) as HTMLInputElement).placeholder).toBe("60,000");
  });

  it("供款提示：正數、第 0 年；正數令 IRR 為 N/A", async () => {
    const user = userEvent.setup();
    const { container } = render(<IrrCalculatorPage mode="independent" />);
    expect(container.querySelector("#hint-inv-independent-0")?.textContent).toBe("初始投資應為負數");
    await setAmount(user, inv(0), "-10000");
    expect(container.querySelector("#hint-inv-independent-0")?.textContent).toBe("初始投資");
    await setAmount(user, tot(5), "60000");
    await setAmount(user, inv(2), "12500");
    expect(container.querySelector("#hint-inv-independent-2")?.textContent).toBe("供款請輸入負數，例如 -12500");
    expect(value(inv(2))).toBe("12,500"); // 不自動轉負
    expect(irrText(container, 5)).toBe("N/A");
  });

  it("輸入框編輯時接受負號，失焦後千分位，並拒絕非數字", async () => {
    const user = userEvent.setup();
    render(<IrrCalculatorPage mode="independent" />);
    const input = screen.getByLabelText(inv(1)) as HTMLInputElement;
    await user.click(input);
    await user.type(input, "-12a500");
    expect(input.value).toBe("-12500");
    await user.tab();
    expect(input.value).toBe("-12,500");
  });
});

describe("表格結構", () => {
  it("第 0 年與其他年份欄位數一致，無 colspan，欄位與表頭數一致", () => {
    for (const mode of ["independent", "overall"] as const) {
      const { container, unmount } = render(<IrrCalculatorPage mode={mode} />);
      const headCount = container.querySelectorAll("thead th").length;
      expect(headCount).toBe(mode === "independent" ? 10 : 9);
      expect(container.querySelectorAll("colgroup col").length).toBe(headCount);
      expect(container.querySelector("[colspan]")).toBeNull();
      container.querySelectorAll("tbody tr").forEach((tr) => {
        expect(tr.children.length).toBe(headCount);
      });
      const row0 = container.querySelector('tr[data-year="0"]')!;
      expect(row0.textContent).toContain("第 0 年");
      expect(row0.querySelectorAll("input").length).toBe(1); // 只有供款可輸入
      expect(row0.querySelector('[data-col="guaranteed"]')?.textContent).toBe("—");
      expect(row0.querySelector('[data-col="hidden"] input')).toBeNull();
      unmount();
    }
  });
});

describe("第二頁：整體 IRR", () => {
  it("預設截止第 10 年，重現基準案例；截止年份無退保價值時 N/A 並提示原因", async () => {
    const user = userEvent.setup();
    render(<IrrCalculatorPage mode="overall" />);
    expect((screen.getByLabelText("截止年份") as HTMLSelectElement).value).toBe("10");
    await fillBaseline(user);
    expect(screen.getByTestId("card-value-overall-irr").textContent).toBe("14.24%");
    expect(screen.getByTestId("card-value-total-contribution").textContent).toBe("-30,000");
    expect(screen.getByTestId("card-value-surrender").textContent).toBe("100,000");
    expect(screen.getByTestId("card-value-net-return").textContent).toBe("70,000");
    expect(screen.getByTestId("card-value-multiple").textContent).toBe("3.33x");

    await user.selectOptions(screen.getByLabelText("截止年份"), "5");
    expect(screen.getByTestId("card-value-overall-irr").textContent).toBe("18.63%");

    await user.selectOptions(screen.getByLabelText("截止年份"), "7");
    expect(screen.getByTestId("card-value-overall-irr").textContent).toBe("N/A");
    expect(screen.getByTestId("card-overall-irr").textContent).toContain("第 7 年沒有正數總退保價值");
  });
});
