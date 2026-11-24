import { expect, test, type Page } from "@playwright/test";

const inv = (y: number) => `第 ${y} 年 投資金額／供款（HKD）`;
const tot = (y: number) => `第 ${y} 年 總退保價值（HKD）`;

async function type(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.blur();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("兩頁資料真實導覽與重新整理後各自還原", async ({ page }) => {
  await page.goto("/");
  await type(page, inv(0), "-10000");
  await type(page, tot(5), "60000");
  await expect(page.locator('tr[data-year="5"] [data-col="irr"]')).toHaveText("43.10%"); // 只有初始投資 + 第 5 年價值
  await type(page, inv(1), "-10000");
  await type(page, inv(2), "-10000");
  await expect(page.locator('tr[data-year="5"] [data-col="irr"]')).toHaveText("18.63%");

  await page.getByRole("link", { name: "整體 IRR" }).click();
  await expect(page).toHaveURL(/\/overall$/);
  await expect(page.getByLabel(inv(0), { exact: true })).toHaveValue("");
  await type(page, inv(0), "-500");
  await page.reload();
  await expect(page.getByLabel(inv(0), { exact: true })).toHaveValue("-500");

  await page.getByRole("link", { name: "逐年獨立 IRR" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByLabel(inv(0), { exact: true })).toHaveValue("-10,000");
  await expect(page.locator('tr[data-year="5"] [data-col="irr"]')).toHaveText("18.63%");

  // 第二頁重設不影響第一頁
  await page.goto("/overall");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "重設" }).click();
  await expect(page.getByLabel(inv(0), { exact: true })).toHaveValue("");
  await page.goto("/");
  await expect(page.getByLabel(inv(0), { exact: true })).toHaveValue("-10,000");
});

test("已有數值的欄位重新輸入會取代舊值（不會接在千分位後面）", async ({ page }) => {
  await page.goto("/");
  await type(page, tot(5), "50000");
  await expect(page.getByLabel(tot(5), { exact: true })).toHaveValue("50,000");
  await page.getByLabel(tot(5), { exact: true }).focus();
  await page.keyboard.type("123");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(tot(5), { exact: true })).toHaveValue("123");
  await type(page, tot(5), "50000");
  await expect(page.getByLabel(tot(5), { exact: true })).toHaveValue("50,000");
});

test("主題設定全站共用，資料 key 各自獨立", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "切換深色／淺色主題" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/overall");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await type(page, inv(0), "-1");
  await page.getByRole("button", { name: "儲存" }).click();
  const keys = await page.evaluate(() => Object.keys(window.localStorage).sort());
  expect(keys).toEqual(["irr_calculator_overall_v2", "irr_calculator_theme"]);
});

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

for (const vp of viewports) {
  for (const path of ["/", "/overall"]) {
    for (const theme of ["dark", "light"]) {
      test(`12. 表頭與輸入框對齊 ${vp.name} ${path} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.addInitScript((t) => window.localStorage.setItem("irr_calculator_theme", t), theme);
        await page.goto(path);
        // 觸發提示文字（會讓該列變高），確認不會影響欄位對齊
        await type(page, inv(1), "12500");
        await type(page, inv(0), "0");

        const result = await page.evaluate(() => {
          const table = document.querySelector("table.year-table") as HTMLTableElement;
          const ths = Array.from(table.querySelectorAll("thead th")) as HTMLElement[];
          const rows = Array.from(table.querySelectorAll("tbody tr")).slice(0, 8) as HTMLElement[];
          const problems: string[] = [];
          const box = (el: Element) => el.getBoundingClientRect();
          const colInputBoxes: Record<number, { l: number; r: number }[]> = {};

          for (const tr of rows) {
            if (tr.children.length !== ths.length) problems.push(`row ${tr.dataset.year} cell count`);
            Array.from(tr.children).forEach((cell, i) => {
              const h = box(ths[i]);
              const c = box(cell);
              if (Math.abs(h.left - c.left) > 0.6 || Math.abs(h.right - c.right) > 0.6) {
                problems.push(`row ${tr.dataset.year} col ${i} cell misaligned with header`);
              }
              const cs = getComputedStyle(cell);
              const hs = getComputedStyle(ths[i]);
              if (cs.textAlign !== hs.textAlign) problems.push(`row ${tr.dataset.year} col ${i} text-align ${cs.textAlign} vs ${hs.textAlign}`);
              const input = cell.querySelector("input.cell-input") as HTMLInputElement | null;
              if (input) {
                const b = box(input);
                (colInputBoxes[i] ||= []).push({ l: b.left, r: b.right });
                if (b.width < 70) problems.push(`input too narrow ${b.width}`);
                if (Math.abs(b.height - 36) > 0.6) problems.push(`input height ${b.height}`);
                if (getComputedStyle(input).textAlign !== "right") problems.push("input not right aligned");
                // 輸入框填滿欄位（扣除 padding）
                const padL = parseFloat(cs.paddingLeft);
                const padR = parseFloat(cs.paddingRight);
                if (Math.abs(b.left - (c.left + padL)) > 0.6 || Math.abs(b.right - (c.right - padR)) > 0.6) {
                  problems.push(`input does not fill cell col ${i}`);
                }
              }
            });
          }
          for (const [col, boxes] of Object.entries(colInputBoxes)) {
            const first = boxes[0];
            for (const b of boxes) {
              if (Math.abs(b.l - first.l) > 0.6 || Math.abs(b.r - first.r) > 0.6) problems.push(`col ${col} inputs differ`);
            }
          }
          // 第 0 年供款輸入框與第 1 年位置一致
          const i0 = box(rows[0].querySelector("input")!);
          const i1 = box(rows[1].querySelector('[data-col="investment"] input')!);
          if (Math.abs(i0.left - i1.left) > 0.6 || Math.abs(i0.width - i1.width) > 0.6) problems.push("year0/year1 investment input differ");
          // 欄位寬度穩定：提示不會撐開欄位
          const widths = ths.map((t) => Math.round(box(t).width));
          return { problems, widths, headCount: ths.length, pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
        });

        expect(result.problems).toEqual([]);
        expect(result.headCount).toBe(path === "/" ? 10 : 9);
        expect(result.pageOverflow).toBe(false);
      });
    }
  }
}

test("12b. 提示文字不改變欄寬；表頭在捲動容器中 sticky；手機可橫向捲動", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const widthsBefore = await page.$$eval("thead th", (ths) => ths.map((t) => t.getBoundingClientRect().width));
  await type(page, inv(0), "5000"); // 觸發「初始投資應為負數」
  await type(page, inv(3), "7");
  const widthsAfter = await page.$$eval("thead th", (ths) => ths.map((t) => t.getBoundingClientRect().width));
  expect(widthsAfter).toEqual(widthsBefore);

  const scroll = page.getByTestId("year-table-independent");
  const info = await scroll.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(info.sw).toBeGreaterThan(info.cw); // 可橫向捲動
  await scroll.evaluate((el) => {
    el.scrollTop = 400;
  });
  const { headTop, boxTop } = await page.evaluate(() => ({
    headTop: document.querySelector("thead th")!.getBoundingClientRect().top,
    boxTop: document.querySelector(".table-scroll")!.getBoundingClientRect().top,
  }));
  expect(Math.abs(headTop - boxTop - 1)).toBeLessThan(3); // 貼在容器頂端（扣除 1px 邊框）
});

test("兩種主題的文字對比度達到 WCAG AA", async ({ page }) => {
  for (const theme of ["dark", "light"]) {
    await page.addInitScript((t) => window.localStorage.setItem("irr_calculator_theme", t), theme);
    await page.goto("/");
    await type(page, inv(0), "5000");
    const ratios = await page.evaluate(() => {
      const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const bgOf = (el: Element): number[] => {
        let node: Element | null = el;
        while (node) {
          const c = parse(getComputedStyle(node).backgroundColor);
          if (c.length === 3 || (c.length === 4 && c[3] > 0.9)) return c;
          node = node.parentElement;
        }
        return [255, 255, 255];
      };
      const ratio = (el: Element) => {
        const fg = lum(parse(getComputedStyle(el).color));
        const bg = lum(bgOf(el));
        const [a, b] = fg > bg ? [fg, bg] : [bg, fg];
        return (a + 0.05) / (b + 0.05);
      };
      const sel = [".card-label", ".card-value", "thead th", ".year-cell", ".cell-input", ".hint-error", ".dash", ".muted", ".btn", ".nav-link"];
      return sel.map((s) => [s, ratio(document.querySelector(s)!)] as const);
    });
    for (const [selector, r] of ratios) {
      expect(r, `${theme} ${selector}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
