"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadState, saveState, serializeState } from "./storage";
import { STORAGE_KEYS, createDefaultState, type CalculatorMode, type PageState, type RowInput } from "./types";

const AUTOSAVE_DELAY_MS = 250;

export type SaveKind = "loaded" | "auto" | "manual" | "reset" | null;

/**
 * 每個頁面各自擁有一份 state 與 localStorage key。
 * 這個 hook 只會讀寫 STORAGE_KEYS[mode]，不會碰另一頁的資料。
 */
export function useCalculatorStore(mode: CalculatorMode) {
  const key = STORAGE_KEYS[mode];
  const [state, setState] = useState<PageState>(createDefaultState);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<{ kind: SaveKind; at: string | null }>({ kind: null, at: null });

  const stateRef = useRef(state);
  const loadedRef = useRef(false);
  const lastSerialized = useRef<string>("");

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 掛載後讀取本頁自己的資料
  useEffect(() => {
    const result = loadState(key);
    const initial = result?.state ?? createDefaultState();
    lastSerialized.current = serializeState(initial);
    stateRef.current = initial;
    loadedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(initial);
    setStatus({ kind: result ? "loaded" : null, at: result?.savedAt ?? null });
    setLoaded(true);
  }, [key]);

  const writeNow = useCallback(
    (kind: Exclude<SaveKind, "loaded" | null>) => {
      const current = stateRef.current;
      const savedAt = saveState(key, current);
      if (savedAt) {
        lastSerialized.current = serializeState(current);
        setStatus({ kind, at: savedAt });
      }
    },
    [key],
  );

  // 自動暫存（防抖）
  useEffect(() => {
    if (!loaded) return;
    if (serializeState(state) === lastSerialized.current) return;
    const timer = window.setTimeout(() => writeNow("auto"), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state, loaded, writeNow]);

  // 離開頁面或重新整理前，立即寫入尚未暫存的變更
  useEffect(() => {
    const flush = () => {
      if (!loadedRef.current) return;
      if (serializeState(stateRef.current) === lastSerialized.current) return;
      saveState(key, stateRef.current);
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [key]);

  const updateRow = useCallback((year: number, patch: Partial<RowInput>) => {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((row, y) => (y === year ? { ...row, ...patch } : row)),
    }));
  }, []);

  const setCutoffYear = useCallback((cutoffYear: number) => {
    setState((prev) => ({ ...prev, cutoffYear }));
  }, []);

  const replaceRows = useCallback((rows: RowInput[]) => {
    setState((prev) => ({ ...prev, rows }));
  }, []);

  const showAllYears = useCallback(() => {
    setState((prev) => ({ ...prev, rows: prev.rows.map((r) => (r.hidden ? { ...r, hidden: false } : r)) }));
  }, []);

  const reset = useCallback(() => {
    const fresh = createDefaultState();
    stateRef.current = fresh;
    setState(fresh);
    const savedAt = saveState(key, fresh);
    if (savedAt) {
      lastSerialized.current = serializeState(fresh);
      setStatus({ kind: "reset", at: savedAt });
    }
  }, [key]);

  const saveManually = useCallback(() => writeNow("manual"), [writeNow]);

  return { state, loaded, status, updateRow, setCutoffYear, replaceRows, showAllYears, reset, saveManually };
}
