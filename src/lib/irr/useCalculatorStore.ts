"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadState, saveState, serializeState } from "./storage";
import { followLatestOverallValue, restoreOverallCutoff } from "./overallCutoff";
import { STORAGE_KEYS, createDefaultState, type CalculatorMode, type PageState, type RowInput } from "./types";

const AUTOSAVE_DELAY_MS = 250;

export type SaveKind = "loaded" | "auto" | "manual" | "reset" | null;

/** Each page owns its own state and localStorage key. */
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

  useEffect(() => {
    const result = loadState(key);
    const saved = result?.state ?? createDefaultState();
    const initial = mode === "overall" ? restoreOverallCutoff(saved) : saved;
    lastSerialized.current = serializeState(saved);
    stateRef.current = initial;
    loadedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(initial);
    setStatus({ kind: result ? "loaded" : null, at: result?.savedAt ?? null });
    setLoaded(true);
  }, [key, mode]);

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

  useEffect(() => {
    if (!loaded) return;
    if (serializeState(state) === lastSerialized.current) return;
    const timer = window.setTimeout(() => writeNow("auto"), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state, loaded, writeNow]);

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
    setState((prev) => {
      const next = {
        ...prev,
        rows: prev.rows.map((row, y) => (y === year ? { ...row, ...patch } : row)),
      };
      const valueChanged = patch.guaranteed !== undefined || patch.nonGuaranteed !== undefined || patch.total !== undefined;
      return mode === "overall" && valueChanged ? followLatestOverallValue(next) : next;
    });
  }, [mode]);

  const setCutoffYear = useCallback((cutoffYear: number) => {
    setState((prev) => ({ ...prev, cutoffYear }));
  }, []);

  const replaceRows = useCallback((rows: RowInput[]) => {
    setState((prev) => {
      const next = { ...prev, rows };
      return mode === "overall" ? followLatestOverallValue(next) : next;
    });
  }, [mode]);

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
