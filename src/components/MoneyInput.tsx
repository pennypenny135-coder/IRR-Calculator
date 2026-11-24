"use client";

import { useEffect, useRef, useState } from "react";
import { formatAmountForDisplay, normalizeAmount, sanitizeAmountInput } from "@/lib/irr/format";

interface MoneyInputProps {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * 編輯中顯示原始輸入（不加千分位，游標不會跳動），失焦後才格式化。
 * 允許開頭負號。
 */
export function MoneyInput({ value, onChange, ariaLabel, placeholder, invalid, describedBy }: MoneyInputProps) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // 聚焦時顯示值會由「千分位」切換為「原始輸入」，瀏覽器的選取範圍會因此消失；
  // 在重新繪製後全選，這樣 Tab 進入欄位再輸入會取代舊值，而不是接在後面。
  useEffect(() => {
    if (focused && ref.current && document.activeElement === ref.current) ref.current.select();
  }, [focused]);

  return (
    <input
      ref={ref}
      type="text"
      autoComplete="off"
      spellCheck={false}
      className="cell-input num"
      aria-label={ariaLabel}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      placeholder={placeholder}
      value={focused ? value : formatAmountForDisplay(value)}
      onFocus={() => setFocused(true)}
      onChange={(e) => onChange(sanitizeAmountInput(e.target.value))}
      onBlur={() => {
        setFocused(false);
        const normalized = normalizeAmount(value);
        if (normalized !== value) onChange(normalized);
      }}
    />
  );
}
