import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "IRR Calculator",
  description: "逐年獨立 IRR 與整體 IRR 計算器（HKD）",
};

// 只有主題設定全站共用；在繪製前套用，避免閃爍。預設為深色。
const themeScript = `try{var t=localStorage.getItem("irr_calculator_theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-HK" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SiteNav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
