"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/irr/types";

type Theme = "dark" | "light";

export function SiteNav() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* 忽略儲存失敗 */
    }
  };

  const link = (href: string, label: string) => (
    <Link href={href} className={pathname === href ? "nav-link active" : "nav-link"} aria-current={pathname === href ? "page" : undefined}>
      {label}
    </Link>
  );

  return (
    <nav className="site-nav no-print" aria-label="主要導覽">
      <div className="nav-inner">
        <span className="brand">IRR Calculator</span>
        <div className="nav-links">
          {link("/", "逐年獨立 IRR")}
          {link("/overall", "整體 IRR")}
        </div>
        <button type="button" className="btn btn-small theme-toggle" onClick={toggle} aria-label="切換深色／淺色主題">
          {theme === "dark" ? "☀ 淺色" : "☾ 深色"}
        </button>
      </div>
    </nav>
  );
}
